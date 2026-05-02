/* eslint global-require: off, no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build:main`, this file is compiled to
 * `./src/main.prod.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { ipcMain, app, BrowserWindow, shell, globalShortcut, Menu, Tray, dialog } from 'electron';
import electronLocalshortcut from 'electron-localshortcut';
import { configureStore } from '@reduxjs/toolkit';
import { forwardToRenderer, triggerAlias, replayActionMain } from 'electron-redux';
import playerReducer from './redux/playerSlice';
import playQueueReducer from './redux/playQueueSlice';
import multiSelectReducer from './redux/multiSelectSlice';
import configReducer from './redux/configSlice';
import MenuBuilder from './menu';
import { isWindows, isMacOS, isLinux } from './shared/utils';
import { settings, setDefaultSettings } from './components/shared/setDefaultSettings';

setDefaultSettings(false);

let systemCaCerts = null;

// On Linux, Electron uses neither the system CA trust store nor the NSS database
// for certificate verification — neither the Node.js/axios network stack nor
// Chromium's audio-streaming stack will trust user-added CAs by default.
// We fix this by:
//   1. Setting NODE_EXTRA_CA_CERTS so the renderer's Node.js picks up the system
//      bundle before the renderer process is spawned (inherited via env).
//   2. Patching https.globalAgent for the main process, in case TLS was already
//      loaded by an import before NODE_EXTRA_CA_CERTS could take effect.
//   3. Storing the bundle for the certificate-error handler below, which covers
//      Chromium's network stack (audio streaming, cover art, etc.).
if (isLinux()) {
  const caBundlePaths = [
    '/etc/ssl/certs/ca-certificates.crt', // Debian / Ubuntu / Mint
    '/etc/pki/tls/certs/ca-bundle.crt', // Fedora / RHEL / CentOS
    '/etc/ssl/ca-bundle.pem', // openSUSE
    '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem', // Arch Linux
  ];
  const bundlePath = caBundlePaths.find((p) => fs.existsSync(p));
  if (bundlePath) {
    process.env.NODE_EXTRA_CA_CERTS = bundlePath;
    try {
      systemCaCerts = fs.readFileSync(bundlePath);
      https.globalAgent.options.ca = systemCaCerts;
    } catch {
      // Bundle found but unreadable — NODE_EXTRA_CA_CERTS still covers the renderer
    }
  }
}

export const store = configureStore({
  reducer: {
    player: playerReducer,
    playQueue: playQueueReducer,
    multiSelect: multiSelectReducer,
    config: configReducer,
  },
  middleware: [triggerAlias, forwardToRenderer],
});

replayActionMain(store);

let mainWindow = null;
let tray = null;
let exitFromTray = false;
let forceQuit = false;
let saved = false;

if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('electron-debug')();
}

const installExtensions = async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      { forceDownload, loadExtensionOptions: { allowFileAccess: true } }
    )
    .catch(console.log);
};

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../assets');

const getAssetPath = (...paths) => {
  return path.join(RESOURCES_PATH, ...paths);
};

const stop = () => {
  mainWindow.webContents.send('player-stop');
};

const playPause = () => {
  mainWindow.webContents.send('player-play-pause');
};

const nextTrack = () => {
  mainWindow.webContents.send('player-next-track');
};

const previousTrack = () => {
  mainWindow.webContents.send('player-prev-track');
};

const volumeUp = () => {
  mainWindow.webContents.send('player-volume-up');
};

const volumeDown = () => {
  mainWindow.webContents.send('player-volume-down');
};

const toggleMute = () => {
  mainWindow.webContents.send('player-mute');
};

const toAccelerator = (key) =>
  key
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return 'CommandOrControl';
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Shift';
      if (part === 'meta') return 'Meta';
      if (part === 'left') return 'Left';
      if (part === 'right') return 'Right';
      if (part === 'up') return 'Up';
      if (part === 'down') return 'Down';
      if (part === 'del') return 'Delete';
      if (part === 'backspace') return 'Backspace';
      if (part === 'space') return 'Space';
      if (part === 'esc') return 'Escape';
      return part.toUpperCase();
    })
    .join('+');

let customShortcutKeys = [];

const unregisterCustomShortcuts = () => {
  customShortcutKeys.forEach((acc) => {
    try {
      globalShortcut.unregister(acc);
    } catch {
      // ignore
    }
  });
  customShortcutKeys = [];
};

const registerCustomShortcuts = (hotkeys) => {
  unregisterCustomShortcuts();
  const actions = {
    playPause: () => playPause(),
    nextTrack: () => nextTrack(),
    prevTrack: () => previousTrack(),
    volumeUp: () => volumeUp(),
    volumeDown: () => volumeDown(),
    mute: () => toggleMute(),
  };
  Object.entries(actions).forEach(([action, handler]) => {
    const key = hotkeys[action];
    if (!key) return;
    const accelerator = toAccelerator(key);
    try {
      if (globalShortcut.register(accelerator, handler)) {
        customShortcutKeys.push(accelerator);
      }
    } catch {
      // invalid accelerator - skip
    }
  });
};

const registerCustomShortcutsFromSettings = () => {
  registerCustomShortcuts({
    playPause: settings.get('hotkeyPlayPause') || 'ctrl+p',
    nextTrack: settings.get('hotkeyNextTrack') || 'ctrl+right',
    prevTrack: settings.get('hotkeyPrevTrack') || 'ctrl+left',
    volumeUp: settings.get('hotkeyVolumeUp') || 'ctrl+up',
    volumeDown: settings.get('hotkeyVolumeDown') || 'ctrl+down',
    mute: settings.get('hotkeyMute') || 'ctrl+m',
  });
};

const quickSave = () => {
  mainWindow.webContents.send('save-queue-state', app.getPath('userData'));
};

const createWinThumbarButtons = () => {
  if (isWindows()) {
    mainWindow.setThumbarButtons([
      {
        tooltip: 'Previous Track',
        icon: getAssetPath('skip-previous.png'),
        click: () => previousTrack(),
      },
      {
        tooltip: 'Play/Pause',
        icon: getAssetPath('play-circle.png'),
        click: () => playPause(),
      },
      {
        tooltip: 'Next Track',
        icon: getAssetPath('skip-next.png'),
        click: () => {
          nextTrack();
        },
      },
    ]);
  }
};

const saveQueue = (callback) => {
  ipcMain.on('saved-state', () => {
    callback();
  });

  mainWindow.webContents.send('save-queue-state', app.getPath('userData'));
};

const restoreQueue = () => {
  mainWindow.webContents.send('restore-queue-state', app.getPath('userData'));
};

const createWindow = async () => {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
    await installExtensions();
  }

  let windowDimensions = [];
  let windowPos = [];
  let isCentered = true;

  // If retained window size is enabled, use saved dimensions and position. Otherwise, use defined defaults
  if (settings.get('retainWindowSize')) {
    windowDimensions = settings.get('savedWindowSize');
    windowPos = settings.get('savedWindowPos');
    isCentered = false;
  } else {
    windowDimensions = [settings.get('defaultWindowWidth'), settings.get('defaultWindowHeight')];
  }

  mainWindow = new BrowserWindow({
    show: false,
    width: windowDimensions[0],
    height: windowDimensions[1],
    center: isCentered,
    x: windowPos[0],
    y: windowPos[1],
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    minWidth: 768,
    minHeight: 600,
    frame: settings.get('titleBarStyle') === 'native',
  });

  electronLocalshortcut.register(mainWindow, 'Ctrl+Shift+I', () => {
    mainWindow?.webContents.openDevTools();
  });

  electronLocalshortcut.register(mainWindow, 'F12', () => {
    if (settings.get('allowDevConsole')) {
      mainWindow?.webContents.openDevTools({ mode: 'undocked' });
    }
  });

  if (settings.get('globalMediaHotkeys')) {
    globalShortcut.register('MediaStop', () => {
      stop();
    });

    globalShortcut.register('MediaPlayPause', () => {
      playPause();
    });

    globalShortcut.register('MediaNextTrack', () => {
      nextTrack();
    });

    globalShortcut.register('MediaPreviousTrack', () => {
      previousTrack();
    });
  } else if (!settings.get('systemMediaTransportControls')) {
    electronLocalshortcut.register(mainWindow, 'MediaStop', () => {
      stop();
    });

    electronLocalshortcut.register(mainWindow, 'MediaPlayPause', () => {
      playPause();
    });

    electronLocalshortcut.register(mainWindow, 'MediaNextTrack', () => {
      nextTrack();
    });

    electronLocalshortcut.register(mainWindow, 'MediaPreviousTrack', () => {
      previousTrack();
    });
  }

  if (settings.get('globalShortcuts')) {
    registerCustomShortcutsFromSettings();
  }

  ipcMain.on('enable-global-shortcuts', () => {
    registerCustomShortcutsFromSettings();
  });

  ipcMain.on('disable-global-shortcuts', () => {
    unregisterCustomShortcuts();
  });

  ipcMain.on('quicksave', () => {
    quickSave();
  });

  ipcMain.on('enableGlobalHotkeys', () => {
    electronLocalshortcut.unregisterAll(mainWindow);

    globalShortcut.register('MediaStop', () => {
      stop();
    });

    globalShortcut.register('MediaPlayPause', () => {
      playPause();
    });

    globalShortcut.register('MediaNextTrack', () => {
      nextTrack();
    });

    globalShortcut.register('MediaPreviousTrack', () => {
      previousTrack();
    });
  });

  ipcMain.on('disableGlobalHotkeys', () => {
    globalShortcut.unregisterAll();
    customShortcutKeys = [];

    if (settings.get('globalShortcuts')) {
      registerCustomShortcutsFromSettings();
    }

    if (!settings.get('systemMediaTransportControls')) {
      electronLocalshortcut.register(mainWindow, 'MediaStop', () => {
        stop();
      });

      electronLocalshortcut.register(mainWindow, 'MediaPlayPause', () => {
        playPause();
      });

      electronLocalshortcut.register(mainWindow, 'MediaNextTrack', () => {
        nextTrack();
      });

      electronLocalshortcut.register(mainWindow, 'MediaPreviousTrack', () => {
        previousTrack();
      });
    }
  });

  mainWindow.loadURL(`file://${__dirname}/index.html#${settings.get('startPage')}`);

  // @TODO: Use 'ready-to-show' event
  // https://github.com/electron/electron/blob/master/docs/api/browser-window.md#using-ready-to-show-event
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
      mainWindow.focus();

      createWinThumbarButtons();
    }

    if (settings.get('resume')) {
      restoreQueue();
    }
  });

  mainWindow.on('minimize', (event) => {
    if (store.getState().config.window.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('moved', () => {
    if (settings.get('retainWindowSize')) {
      settings.set('savedWindowPos', mainWindow.getPosition());
    }
  });

  mainWindow.on('close', (event) => {
    if (!exitFromTray && store.getState().config.window.exitToTray) {
      if (isMacOS() && !forceQuit) {
        exitFromTray = true;
      }
      event.preventDefault();
      mainWindow.hide();
    }

    // If retain window size is enabled, save the dimensions
    if (settings.get('retainWindowSize')) {
      const curSize = mainWindow.getSize();
      settings.set('savedWindowSize', [curSize[0], curSize[1]]);
    }

    // If we have enabled saving the queue, we need to defer closing the main window until it has finished saving.
    if (!saved && settings.get('resume')) {
      event.preventDefault();
      saved = true;
      saveQueue(() => {
        mainWindow.close();
        if (forceQuit) {
          app.exit();
        }
      });
    }
  });

  if (isWindows()) {
    app.setAppUserModelId(process.execPath);
  }

  if (isMacOS()) {
    app.on('before-quit', () => {
      forceQuit = true;
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const CREDENTIAL_KEYS = new Set([
    'server',
    'serverBase64',
    'serverType',
    'username',
    'password',
    'salt',
    'hash',
    'token',
    'userId',
    'legacyAuth',
    'musicFolder',
  ]);

  ipcMain.handle('app-version', () => app.getVersion());

  // ─── MPV backend ────────────────────────────────────────────────────────────
  let mpvInstance = null;
  // Guard: only allow auto-next after the queue has been loaded at least once.
  // Prevents spurious playlist-pos events during MPV initialization from firing auto-next.
  let mpvQueueLoaded = false;
  // Suppresses renderer-player-stop while player-set-queue is mid-load.
  // mpv.load('replace') briefly sets playlist-pos to -1, which would otherwise
  // reset Redux status to PAUSED while we're actively starting a new track.
  let mpvLoadingQueue = false;

  const getMpv = () => mpvInstance;

  const sendToRenderer = (channel, ...args) => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  };

  const debugLog = (...args) => {
    console.log(...args);
    sendToRenderer('mpv-debug-log', args.join(' '));
  };

  const createMpvInstance = async (binaryPath, extraParameters, properties) => {
    const pid = process.pid;
    const socketPath = isWindows() ? `\\\\.\\pipe\\mpvserver-${pid}` : `/tmp/node-mpv-${pid}.sock`;

    // eslint-disable-next-line global-require
    const MpvAPI = require('node-mpv');
    const mpv = new MpvAPI(
      {
        audio_only: true,
        auto_restart: false,
        binary: binaryPath || null,
        socket: socketPath,
        time_update: 0.05,
      },
      ['--no-config', '--load-scripts=no', '--prefetch-playlist=yes', ...extraParameters]
    );

    // Auto-advance: require both a 0→1 transition AND that the queue has been loaded.
    // This prevents spurious events during MPV initialization from triggering auto-next.
    // playlist-pos === -1 means MPV went idle (end of playlist) — sync pause state.
    let lastPlaylistPos = -1;
    mpv.on('status', ({ property, value }) => {
      if (property === 'playlist-pos') {
        const prev = lastPlaylistPos;
        lastPlaylistPos = value;
        if (value === -1) {
          if (!mpvLoadingQueue) sendToRenderer('renderer-player-stop');
          return;
        }
        if (prev === 0 && value === 1 && mpvQueueLoaded) {
          sendToRenderer('renderer-player-auto-next');
        }
      }
    });

    // 'resumed' events are not forwarded. State is synced via the explicit
    // sendToRenderer at the end of player-set-queue, and via direct Redux
    // dispatches from UI actions. Forwarding 'resumed' causes spurious PLAYING
    // dispatches from gapless preloading that fire after mpvLoadingQueue drops.
    mpv.on('resumed', () => {
      debugLog('[MPV main] MPV event: resumed (not forwarded)');
    });
    mpv.on('paused', () =>
      console.log(
        '[MPV main] MPV event: paused (not forwarded, mpvLoadingQueue:',
        mpvLoadingQueue,
        ')'
      )
    );
    mpv.on('stopped', () => {
      debugLog('[MPV main] MPV event: stopped, mpvLoadingQueue:', mpvLoadingQueue);
      if (!mpvLoadingQueue) sendToRenderer('renderer-player-stop');
    });
    mpv.on('timeposition', (time) => sendToRenderer('renderer-player-current-time', time));
    mpv.on('crashed', () => {
      mpvInstance = null;
      sendToRenderer('renderer-player-fallback', true);
    });

    await mpv.start();
    if (properties && Object.keys(properties).length > 0) {
      await mpv.setMultipleProperties(properties);
    }
    return mpv;
  };

  ipcMain.handle(
    'player-initialize',
    async (_, { binaryPath, extraParameters = [], properties = {} } = {}) => {
      mpvQueueLoaded = false;
      mpvLoadingQueue = false;
      try {
        if (mpvInstance && mpvInstance.isRunning()) {
          await mpvInstance.quit();
        }
      } catch {
        /* ignore */
      }
      try {
        mpvInstance = await createMpvInstance(binaryPath, extraParameters, properties);
      } catch {
        mpvInstance = null;
        sendToRenderer('renderer-player-fallback', true);
      }
    }
  );

  ipcMain.handle(
    'player-restart',
    async (_, { binaryPath, extraParameters = [], properties = {} } = {}) => {
      mpvQueueLoaded = false;
      mpvLoadingQueue = false;
      try {
        if (mpvInstance && mpvInstance.isRunning()) {
          await mpvInstance.quit();
        }
      } catch {
        /* ignore */
      }
      try {
        mpvInstance = await createMpvInstance(binaryPath, extraParameters, properties);
      } catch {
        mpvInstance = null;
        sendToRenderer('renderer-player-fallback', true);
      }
    }
  );

  ipcMain.handle('player-is-running', () => {
    return mpvInstance ? mpvInstance.isRunning() : false;
  });

  ipcMain.handle('player-get-audio-devices', async () => {
    const mpv = getMpv();
    if (!mpv || !mpv.isRunning()) return [];
    try {
      const list = await mpv.getProperty('audio-device-list');
      return (list || []).map((d) => ({ label: d.description || d.name, value: d.name }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('player-set-audio-device', async (_, deviceName) => {
    const mpv = getMpv();
    if (!mpv || !mpv.isRunning()) return;
    try {
      await mpv.setProperty('audio-device', deviceName);
    } catch {
      /* ignore — MPV keeps the old device on failure */
    }
  });

  ipcMain.on('player-quit', async () => {
    if (mpvInstance && mpvInstance.isRunning()) {
      try {
        await mpvInstance.quit();
      } catch {
        /* ignore */
      }
    }
    mpvInstance = null;
  });

  ipcMain.on('player-play', () => {
    debugLog('[MPV main] player-play received');
    const mpv = getMpv();
    if (mpv && mpv.isRunning()) mpv.play().catch(() => {});
  });

  ipcMain.on('player-pause', () => {
    const mpv = getMpv();
    if (mpv && mpv.isRunning()) mpv.pause().catch(() => {});
  });

  ipcMain.on('player-stop', () => {
    const mpv = getMpv();
    if (mpv && mpv.isRunning()) mpv.stop().catch(() => {});
  });

  ipcMain.on('player-seek-to', (_, time) => {
    const mpv = getMpv();
    if (mpv && mpv.isRunning()) mpv.goToPosition(time).catch(() => {});
  });

  ipcMain.on('player-volume', (_, value) => {
    const mpv = getMpv();
    if (mpv && mpv.isRunning()) mpv.volume(value).catch(() => {});
  });

  ipcMain.on('player-mute', (_, mute) => {
    const mpv = getMpv();
    if (mpv && mpv.isRunning()) mpv.mute(mute).catch(() => {});
  });

  // Load current track (replace) + preload next track (append)
  ipcMain.on('player-set-queue', async (_, { current, next, pause = false }) => {
    debugLog('[MPV main] player-set-queue received. pause:', pause, 'url:', current);
    mpvQueueLoaded = true;
    mpvLoadingQueue = true;
    const mpv = getMpv();
    if (!mpv || !mpv.isRunning()) {
      debugLog('[MPV main] player-set-queue: MPV not running, aborting');
      mpvLoadingQueue = false;
      return;
    }
    try {
      // Pre-pause before loading so MPV does not auto-play during the load.
      // For pause:false, we call mpv.play() after loading.
      // For pause:true, we rely on player-play arriving from the play-effect
      // (when the user clicked) to override this pre-pause after the load.
      debugLog('[MPV main] pre-pausing before load...');
      await mpv.pause();
      debugLog('[MPV main] calling mpv.load...');
      await mpv.load(current, 'replace');
      debugLog('[MPV main] mpv.load done. appending next:', next);
      if (next) await mpv.load(next, 'append');
      if (!pause) {
        debugLog('[MPV main] calling mpv.play()');
        await mpv.play();
      }
      debugLog('[MPV main] play/pause done');
    } catch (err) {
      debugLog('[MPV main] player-set-queue error:', err);
    }
    mpvLoadingQueue = false;
    // For pause:false, sync PLAYING state to renderer as a safety net.
    // For pause:true, no dispatch needed — Redux is already PAUSED, and sending
    // renderer-player-pause would cause a spurious player-pause that fights
    // against the player-play sent by the play-effect on user double-click.
    if (!pause) {
      debugLog('[MPV main] sending renderer-player-play to renderer');
      sendToRenderer('renderer-player-play');
    }
  });

  // Replace the preloaded next track (playlist position 1)
  ipcMain.on('player-set-queue-next', async (_, { url }) => {
    const mpv = getMpv();
    if (!mpv || !mpv.isRunning()) return;
    try {
      const size = await mpv.getPlaylistSize();
      if (size > 1) await mpv.playlistRemove(1);
      if (url) await mpv.load(url, 'append');
    } catch {
      /* ignore */
    }
  });

  // Called after auto-next: MPV advanced from pos 0→1, so playlist is [finished, now-playing].
  // Remove the finished track at position 0, then append the new next-next.
  ipcMain.on('player-auto-next', async (_, { url }) => {
    const mpv = getMpv();
    if (!mpv || !mpv.isRunning()) return;
    try {
      await mpv.playlistRemove(0);
      if (url) await mpv.load(url, 'append');
    } catch {
      /* ignore */
    }
  });

  // Set MPV audio filter chain (for live EQ updates)
  ipcMain.on('player-set-af', (_, afString) => {
    const mpv = getMpv();
    if (!mpv || !mpv.isRunning()) return;
    mpv.setProperty('af', afString || '').catch(() => {});
  });
  // ─── End MPV backend ─────────────────────────────────────────────────────────

  ipcMain.handle('export-settings', async () => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Settings',
        defaultPath: 'sonixd-redux-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePath) return { success: false };
      const store = { ...settings.store };
      CREDENTIAL_KEYS.forEach((k) => delete store[k]);
      fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
      return { success: true };
    } catch {
      return { success: false, error: true };
    }
  });

  ipcMain.handle('import-settings', async () => {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Settings',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (canceled || filePaths.length === 0) return { success: false };
      const parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
      if (typeof parsed !== 'object' || Array.isArray(parsed))
        return { success: false, error: true };
      Object.entries(parsed).forEach(([key, value]) => {
        if (!CREDENTIAL_KEYS.has(key)) settings.set(key, value);
      });
      return { success: true };
    } catch {
      return { success: false, error: true };
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ipcMain.handle('file-path', async (_, argument) => {
    const filePath = dialog.showOpenDialogSync({
      properties: ['openFile', 'openDirectory'],
    });
    return filePath;
  });

  ipcMain.on('minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('maximize', () => {
    mainWindow.maximize();
  });

  ipcMain.on('unmaximize', () => {
    mainWindow.unmaximize();
  });

  ipcMain.on('close', () => {
    mainWindow.close();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('maximize');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('unmaximize');
  });
};

const createTray = () => {
  if (isMacOS()) {
    return;
  }

  tray = isLinux() ? new Tray(getAssetPath('icon.png')) : new Tray(getAssetPath('icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Play/Pause',
      click: () => {
        playPause();
      },
    },
    {
      label: 'Next Track',
      click: () => {
        nextTrack();
      },
    },
    {
      label: 'Previous Track',
      click: () => {
        previousTrack();
      },
    },
    {
      label: 'Stop',
      click: () => {
        stop();
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Open main window',
      click: () => {
        mainWindow.show();
        createWinThumbarButtons();
      },
    },
    {
      label: 'Quit Sonixd Redux',
      click: () => {
        exitFromTray = true;
        app.quit();
      },
    },
  ]);

  tray.on('double-click', () => {
    mainWindow.show();
    createWinThumbarButtons();
  });

  tray.setToolTip('Sonixd Redux');
  tray.setContextMenu(contextMenu);
};

const gotProcessLock = app.requestSingleInstanceLock();
if (!gotProcessLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow.show();
  });
}

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  globalShortcut.unregisterAll();
  if (isMacOS()) {
    mainWindow = null;
  } else {
    app.quit();
  }
});

// Re-verify certificates that Chromium rejects using Node.js TLS against the
// system CA bundle loaded above. This lets user-trusted CAs (e.g. a home router
// or OPNsense CA) work on Linux without any manual NSS database manipulation.
// Node.js and Chromium use independent TLS stacks, so this request will not
// re-trigger the certificate-error event.
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (!systemCaCerts) {
    callback(false);
    return;
  }

  event.preventDefault();

  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    callback(false);
    return;
  }

  const req = https.request(
    {
      host: urlObj.hostname,
      port: parseInt(urlObj.port, 10) || 443,
      method: 'HEAD',
      path: '/',
      ca: systemCaCerts,
      rejectUnauthorized: true,
      timeout: 5000,
    },
    () => callback(true)
  );

  req.on('error', () => callback(false));
  req.on('timeout', () => {
    req.destroy();
    callback(false);
  });

  try {
    req.end();
  } catch {
    callback(false);
  }
});

app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

app
  .whenReady()
  .then(() => {
    createWindow();
    createTray();
    return null;
  })
  .catch(console.log);

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

ipcMain.on('reload', () => {
  if (process.env.APPIMAGE) {
    app.exit();
    app.relaunch({
      execPath: process.env.APPIMAGE,
      args: process.argv.slice(1).concat(['--appimage-extract-and-run']),
    });
    app.exit(0);
  } else {
    app.relaunch();
    app.exit();
  }
});
