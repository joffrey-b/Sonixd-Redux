/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build:main`, this file is compiled to
 * `./src/main.prod.js` using webpack. This gives us some performance wins.
 */
// Must be first import: calls app.setPath('userData', ...) before any
// electron-store Store constructor runs (both registerMainLanguage and
// setDefaultSettings construct stores as static-import side effects).
import './setUserDataPath.mjs';
import { fileURLToPath } from 'url';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import sourceMapSupport from 'source-map-support';
import electronDebug from 'electron-debug';
import Store from 'electron-store';
import RPC from 'discord-rpc';
import {
  ipcMain,
  app,
  BrowserWindow,
  shell,
  globalShortcut,
  Menu,
  Tray,
  dialog,
  nativeTheme,
} from 'electron';
import { configureStore } from '@reduxjs/toolkit';
import { stateSyncEnhancer } from 'electron-redux/main';
// Must be imported before setDefaultSettings: as a side effect of evaluating
// this module, it registers the persisted `language` setting with
// settingsAccess.ts for i18n.js to read. setDefaultSettings.ts transitively
// imports i18n.js (for column label translations), and i18n.js needs the
// language synchronously at init time — before setDefaultSettings.ts has
// constructed (and could register) its own settings instance. See
// registerMainLanguage.ts for the full explanation of why this ordering matters.
import './components/shared/registerMainLanguage';
// Must be imported before any redux slice: as a side effect of evaluating this
// module, it registers the real settings instance with settingsAccess.ts, which
// configSlice/playQueueSlice read from at module-evaluation time to seed their
// initialState. ES modules evaluate dependency-first in declaration order, so
// this import (and its registration side effect) is guaranteed to run first.
//
// The slice reducers themselves (playerSlice, playQueueSlice, multiSelectSlice,
// configSlice, jukeboxSlice) are intentionally NOT statically imported here. Each
// computes its initialState as a module-level constant read from settings at
// import time — but ES modules hoist and evaluate all static imports before any
// of *this* file's own top-level statements run, including setDefaultSettings(false)
// below. A static import here would race ahead of that seeding, permanently baking
// un-seeded defaults (e.g. empty column lists) into this process's electron-redux
// store, which is then synced to every renderer reload, clobbering the renderer's
// own correctly-seeded state. Dynamically importing them after setDefaultSettings(false)
// has run guarantees settings are seeded first. See initStore() below.
import { settings, setDefaultSettings } from './components/shared/setDefaultSettings';
import { Server } from './types';
import MenuBuilder from './menu';
import { isWindows, isMacOS, isLinux } from './shared/utils';
import { assertUnderDir } from './shared/assertUnderDir';
import { validateImportedSettings } from './shared/settingsImportValidation';
import { evictOldestFilesUntilUnderLimit } from './shared/cacheEviction';

// In development, main.dev.mjs runs as native ESM via tsx, so we derive __dirname
// from import.meta.url. In production, webpack compiles this file to CJS and
// import.meta.url becomes a compile-time string (the CI build path), making
// __dirname wrong at runtime. Use app.getAppPath() when packaged — it is always
// the correct runtime app directory regardless of where the app is installed.
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = app.isPackaged ? app.getAppPath() : path.dirname(fileURLToPath(import.meta.url));

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[main] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[main] Unhandled rejection:', reason);
});

setDefaultSettings(false);

// Relocated from `src/components/shared/libraryCache.ts` (C1 / nodeIntegration —
// the renderer can no longer `require('electron-store')` directly). electron-store
// is file-backed, so the single instance lives here, mirroring `settings` above —
// the renderer gets a synchronous get/set proxy via `bridge.libraryCache`, preserving
// the exact call signatures `useLibraryCache.ts`'s 13 call sites already use.
//
// No defaults: omitting the old-format keys (songs/lastSyncedAt/serverUrl) means
// has() only returns true when those keys were actually written to disk (i.e. by v1.0.7),
// which lets the migration check below distinguish upgrades from fresh installs.
const libraryCache = new Store({ name: 'library-cache' });

// Detect upgrade from old multi-key format (v1.0.7) to new cacheSnapshot format.
// Must run before any library cache read so old data is cleared before the renderer
// requests it. The renderer polls via 'check-library-cache-migration' on mount (pull
// model) rather than receiving a push — avoids the ready-to-show vs useEffect race.
let libraryCacheWasMigrated = false;
if (libraryCache.has('songs') && !libraryCache.has('cacheSnapshot')) {
  libraryCache.delete('songs');
  libraryCache.delete('lastSyncedAt');
  libraryCache.delete('serverUrl');
  libraryCacheWasMigrated = true;
}

let systemCaCerts = null;

// On Linux, Chromium may not automatically trust user-added CAs depending on the
// distribution and how the CA was imported. We load the system CA bundle here so
// the certificate-error handler below can re-verify rejected certificates against
// it, acting as a safety net for user-trusted CAs (e.g. a private CA or OPNsense).
if (isLinux()) {
  const caBundlePaths = [
    '/etc/ssl/certs/ca-certificates.crt', // Debian / Ubuntu / Mint
    '/etc/pki/tls/certs/ca-bundle.crt', // Fedora / RHEL / CentOS
    '/etc/ssl/ca-bundle.pem', // openSUSE
    '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem', // Arch Linux
  ];
  const bundlePath = caBundlePaths.find((p) => fs.existsSync(p));
  if (bundlePath) {
    try {
      systemCaCerts = fs.readFileSync(bundlePath);
    } catch {
      // ignore — certificate-error handler will fall back to rejecting unknown certs
    }
  }
}

// Assigned below, once the slice reducers are dynamically imported (which must
// happen after setDefaultSettings(false) above — see the import comment).
export let store;
export let setServerType;
// Used by the import-settings handler to refresh the main process's redux
// state after writing imported settings directly to the store — see
// configSlice.ts's buildInitialState / playQueueSlice.ts's
// buildSettingsDerivedFields for the full explanation.
export let replaceConfigState;
export let buildConfigInitialState;
export let refreshPlayQueueSettingsFields;
export let buildPlayQueueSettingsDerivedFields;

const storeReadyPromise = (async () => {
  const [
    { default: playerReducer },
    playQueueSliceModule,
    { default: multiSelectReducer },
    configSliceModule,
    { default: jukeboxReducer },
  ] = await Promise.all([
    import('./redux/playerSlice'),
    import('./redux/playQueueSlice'),
    import('./redux/multiSelectSlice'),
    import('./redux/configSlice'),
    import('./redux/jukeboxSlice'),
  ]);

  setServerType = configSliceModule.setServerType;
  replaceConfigState = configSliceModule.replaceState;
  buildConfigInitialState = configSliceModule.buildInitialState;
  refreshPlayQueueSettingsFields = playQueueSliceModule.refreshSettingsFields;
  buildPlayQueueSettingsDerivedFields = playQueueSliceModule.buildSettingsDerivedFields;
  store = configureStore({
    reducer: {
      player: playerReducer,
      playQueue: playQueueSliceModule.default,
      multiSelect: multiSelectReducer,
      config: configSliceModule.default,
      jukebox: jukeboxReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: true, immutabilityCheck: true }),
    enhancers: (getDefaultEnhancers) => getDefaultEnhancers().concat(stateSyncEnhancer()),
  });
})();

let mainWindow = null;
let tray = null;
let exitFromTray = false;
let forceQuit = false;
let saved = false;
let jukeboxStopped = false;

if (process.env.NODE_ENV === 'production') {
  sourceMapSupport.install();
}

if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
  electronDebug();
}

const installExtensions = async () => {
  const installer = await import('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];
  // webpack CJS interop wraps module.exports as installer.default, so the actual
  // install function may be at installer.default.default (double-nested). esbuild
  // interop puts it directly at installer.default. Handle both.
  const mod = installer.default;
  const install = typeof mod === 'function' ? mod : mod.default;
  return install(
    extensions.map((name) => installer[name]),
    { forceDownload, loadExtensionOptions: { allowFileAccess: true } }
  ).catch(console.log); // eslint-disable-line no-console
};

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../assets');

const getAssetPath = (...paths) => {
  return path.join(RESOURCES_PATH, ...paths);
};

const sendToRenderer = (channel, ...args) => {
  const win = mainWindow;
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
};

const stop = () => {
  sendToRenderer('player-stop');
};

const playPause = () => {
  sendToRenderer('player-play-pause');
};

const nextTrack = () => {
  sendToRenderer('player-next-track');
};

const previousTrack = () => {
  sendToRenderer('player-prev-track');
};

const volumeUp = () => {
  sendToRenderer('player-volume-up');
};

const volumeDown = () => {
  sendToRenderer('player-volume-down');
};

const toggleMute = () => {
  sendToRenderer('player-mute');
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

const registerMediaShortcuts = () => {
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
    globalShortcut.register('MediaStop', () => {
      if (!mainWindow?.isFocused()) return;
      stop();
    });

    globalShortcut.register('MediaPlayPause', () => {
      if (!mainWindow?.isFocused()) return;
      playPause();
    });

    globalShortcut.register('MediaNextTrack', () => {
      if (!mainWindow?.isFocused()) return;
      nextTrack();
    });

    globalShortcut.register('MediaPreviousTrack', () => {
      if (!mainWindow?.isFocused()) return;
      previousTrack();
    });
  }
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
  // Use once so listeners don't accumulate across multiple close events.
  // The timeout is a safety net: if the renderer never sends 'saved-state'
  // (e.g. due to a crash or slow shutdown), we still close the window.
  const timeout = setTimeout(() => {
    ipcMain.removeAllListeners('saved-state');
    callback();
  }, 5000);

  ipcMain.once('saved-state', () => {
    clearTimeout(timeout);
    callback();
  });

  mainWindow.webContents.send('save-queue-state', app.getPath('userData'));
};

const stopJukeboxOnClose = (callback) => {
  const timeout = setTimeout(() => callback(), 2000);
  ipcMain.once('jukebox-stopped', () => {
    clearTimeout(timeout);
    callback();
  });
  mainWindow.webContents.send('stop-jukebox-on-close');
};

const restoreQueue = () => {
  mainWindow.webContents.send('restore-queue-state', app.getPath('userData'));
};

const getWindowBackgroundColor = () => {
  const themeValue = settings.get('theme');
  const allThemes = [...(settings.get('themesDefault') || []), ...(settings.get('themes') || [])];
  const currentTheme = allThemes.find((t) => t.value === themeValue);
  if (currentTheme) {
    return currentTheme.type === 'light' ? '#ffffff' : '#141518';
  }
  if (themeValue === 'followSystem') {
    return nativeTheme.shouldUseDarkColors ? '#141518' : '#ffffff';
  }
  return '#141518'; // default to dark
};

// ─── MPV binary detection ─────────────────────────────────────────────────────
// Checks the user-configured path, then platform-specific install locations,
// then falls back to PATH. Centralises detection in main so Windows package
// manager installs (Winget/Scoop/Chocolatey) are found even when not on PATH.

// Manually resolves `filename` against each directory in PATH, returning a
// fully resolved absolute path (or null if not found anywhere). Used instead
// of handing a bare executable name to child_process.spawn (node-mpv runs it
// with shell:false) and letting it resolve PATH itself — on Windows, that
// internal resolution can fail to correctly launch the binary it finds when
// the matching directory contains a space (e.g. "C:\Program Files\MPV
// Player"), even though the exact same absolute path works fine when passed
// to spawn directly, as the user-configured mpvPath setting already does.
const findOnPath = (filename) => {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

function getMpvBinary() {
  const configured = settings.get('mpvPath');
  if (configured && fs.existsSync(configured)) return configured;

  if (process.platform !== 'win32') {
    if (process.platform === 'darwin') {
      const brewPaths = [
        '/opt/homebrew/bin/mpv', // Apple Silicon
        '/usr/local/bin/mpv', // Intel
      ];
      for (const p of brewPaths) {
        if (fs.existsSync(p)) return p;
      }
    }

    if (process.platform === 'linux') {
      // Electron launched programmatically (e.g. by Playwright) can inherit a
      // stripped-down PATH that omits /usr/bin, so a bare 'mpv' PATH lookup can
      // fail even when the binary is installed. Check common install locations
      // directly before falling back to PATH.
      const linuxPaths = ['/usr/bin/mpv', '/usr/local/bin/mpv', '/snap/bin/mpv'];
      for (const p of linuxPaths) {
        if (fs.existsSync(p)) return p;
      }
    }

    return 'mpv'; // PATH fallback for Linux and macOS
  }

  // Windows: check common package manager installation paths
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const userProfile = process.env.USERPROFILE || '';

  const windowsPaths = [
    // Winget
    path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'mpv.exe'),
    // Scoop
    path.join(userProfile, 'scoop', 'apps', 'mpv', 'current', 'mpv.exe'),
    path.join(userProfile, 'scoop', 'shims', 'mpv.exe'),
    // Chocolatey
    path.join(programFiles, 'mpv', 'mpv.exe'),
    path.join(programFilesX86, 'mpv', 'mpv.exe'),
    'C:\\mpv\\mpv.exe',
  ];

  for (const p of windowsPaths) {
    if (p && fs.existsSync(p)) return p;
  }

  // Final PATH fallback — resolved manually (see findOnPath above) rather
  // than handing child_process.spawn a bare name to resolve on its own.
  return findOnPath('mpv.exe') || 'mpv.exe';
}

// ─── Security constants ───────────────────────────────────────────────────────
// Keys that require the dedicated bridge:settings:setCredentials endpoint.
// The generic bridge:settings:set handler blocks these.
// Note: 'musicFolder' removed — it is server-specific config, not a credential.
//       'allowDevConsole' and 'acceptSelfSigned' removed — user-controlled settings
//       that the renderer must be able to write via the generic endpoint.
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
]);
const SETTINGS_DENY_LIST = new Set([...CREDENTIAL_KEYS]);

// ─── Path validation helpers ──────────────────────────────────────────────────
const getCacheBaseDir = () => settings.get('cachePath') || app.getPath('userData');

// ─── MPV state (module-level so handlers registered once are safe across
// macOS createWindow re-invocations) ──────────────────────────────────────────
let mpvInstance = null;
let mpvSocketCounter = 0;
let mpvQueueLoaded = false;
let mpvLoadingQueue = false;
// The --replaygain=<mode> value the currently-running MPV process was actually
// launched with — set only after a successful (re)start, so callers querying it
// observe the real spawn argument rather than the renderer's (possibly not-yet-
// applied) Redux/settings value. Exposed read-only via player-get-active-replaygain-mode
// for e2e coverage: UI-level assertions alone can't tell "the dropdown changed"
// apart from "MPV was actually relaunched with the new mode".
let activeMpvReplayGainMode = null;

// ─── Discord state ────────────────────────────────────────────────────────────
let discordClient = null;
let discordClientId = null;

// ─── Helpers used by IPC handlers ────────────────────────────────────────────
const debugLog = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log(...args);
    sendToRenderer('mpv-debug-log', args.join(' '));
  }
};

const getMpv = () => mpvInstance;

const destroyDiscordClient = () => {
  if (discordClient) {
    try {
      discordClient.destroy();
    } catch (err) {
      sendToRenderer('bridge:discord:error', `${err}`);
    }
  }
  discordClient = null;
  discordClientId = null;
};

const createMpvInstance = async (binaryPath, extraParameters, properties) => {
  const pid = process.pid;
  mpvSocketCounter += 1;
  const socketPath = isWindows()
    ? `\\\\.\\pipe\\mpvserver-${pid}-${mpvSocketCounter}`
    : path.join(app.getPath('temp'), `node-mpv-${pid}-${mpvSocketCounter}.sock`);

  // GitHub Actions runners have no audio hardware, and MPV's ALSA/PulseAudio
  // output probing can fail the entire start() call on a host with no sink at
  // all. SONIXD_CI_AUDIO is only ever set by the e2e CI workflow, never in a
  // production build, so this can't change real user-facing playback.
  const ciAudioArgs = process.env.SONIXD_CI_AUDIO === 'null' ? ['--ao=null'] : [];

  const { default: MpvAPI } = await import('node-mpv');
  const mpv = new MpvAPI(
    {
      audio_only: true,
      auto_restart: false,
      binary: binaryPath || null,
      socket: socketPath,
      time_update: 0.1,
      // Bypass the exec-based version probe in findIPCCommand. All supported
      // MPV versions (0.17+) use --input-ipc-server; the probe fails on Windows
      // when cmd.exe cannot execute the binary for any reason.
      ipc_command: '--input-ipc-server',
    },
    [
      '--no-config',
      '--load-scripts=no',
      '--prefetch-playlist=yes',
      ...ciAudioArgs,
      ...extraParameters,
    ]
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
    debugLog('[MPV main] MPV event: paused (not forwarded, mpvLoadingQueue:', mpvLoadingQueue, ')')
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

const quitAndReplace = async (binaryPath, extraParameters, properties) => {
  // Capture and immediately null the shared reference so a concurrent player-quit
  // (which may still be awaiting its own quit()) cannot overwrite our new instance.
  const old = mpvInstance;
  mpvInstance = null;
  mpvQueueLoaded = false;
  mpvLoadingQueue = false;
  // Cleared up front, not just set on success — if createMpvInstance below throws,
  // this must reflect "no confirmed mode" rather than linger on a stale value from
  // the previous (possibly different-mode) instance.
  activeMpvReplayGainMode = null;
  try {
    if (old && old.isRunning()) {
      await old.quit();
    }
  } catch {
    /* ignore */
  }
  mpvInstance = await createMpvInstance(binaryPath, extraParameters, properties);
  const rgArg = extraParameters.find((p) => p.startsWith('--replaygain='));
  activeMpvReplayGainMode = rgArg ? rgArg.slice('--replaygain='.length) : null;
};

// ─── IPC handlers (module-level — registered once at startup so macOS
// createWindow re-invocations don't cause "second handler" errors) ─────────────

ipcMain.handle('app-version', () => app.getVersion());

// ─── Settings bridge ─────────────────────────────────────────────────────────
// With contextIsolation: true the renderer can no longer `require('electron-store')`
// directly — these synchronous handlers proxy the same get/set/has/store/path/clear
// surface through IPC, keeping a single Store instance as the source of truth.
ipcMain.on('bridge:settings:get', (event, key) => {
  event.returnValue = settings.get(key);
});

ipcMain.on('bridge:settings:set', (event, key, value) => {
  if (SETTINGS_DENY_LIST.has(key)) {
    event.returnValue = undefined;
    return;
  }
  settings.set(key, value);
  event.returnValue = undefined;
});

ipcMain.on('bridge:settings:has', (event, key) => {
  event.returnValue = settings.has(key);
});

ipcMain.on('bridge:settings:store', (event) => {
  event.returnValue = settings.store;
});

ipcMain.on('bridge:settings:path', (event) => {
  event.returnValue = settings.path;
});

ipcMain.on('bridge:settings:clear', (event) => {
  settings.clear();
  event.returnValue = undefined;
});

// Computes the same `path.dirname(settings.path)` the renderer's CacheConfig
// "reset to default" used to run via direct `path` access.
ipcMain.on('bridge:settings:default-cache-path', (event) => {
  event.returnValue = path.dirname(settings.path);
});

// Dedicated secure endpoint for writing login credentials from the renderer.
// The generic bridge:settings:set blocks all CREDENTIAL_KEYS, so Login.tsx
// must use this channel instead.
ipcMain.handle('bridge:settings:setCredentials', (_event, credentials) => {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) return false;

  const {
    server,
    serverBase64,
    serverType,
    username,
    hash,
    salt,
    userId,
    token,
    deviceId,
    legacyAuth,
    password,
  } = credentials;

  if (typeof server !== 'string' || !server) return false;
  if (typeof username !== 'string' || !username) return false;

  if (server) settings.set('server', server);
  if (serverBase64) settings.set('serverBase64', serverBase64);
  if (serverType) settings.set('serverType', serverType);
  settings.set('username', username);
  if (hash) settings.set('hash', hash);
  if (salt) settings.set('salt', salt);
  if (userId !== undefined) settings.set('userId', userId);
  if (token !== undefined) settings.set('token', token);
  if (deviceId !== undefined) settings.set('deviceId', deviceId);
  if (typeof legacyAuth === 'boolean') settings.set('legacyAuth', legacyAuth);

  // Only store plaintext password for legacy auth — standard Subsonic auth uses
  // hash+salt and must never store the raw password.
  if (legacyAuth === true && typeof password === 'string' && password) {
    settings.set('password', password);
  }

  // The main process's Redux store (electron-redux's stateSyncEnhancer) is created once
  // at app boot and never recomputed afterwards. Without this dispatch, its stale
  // config.serverType gets synced back to the renderer on the next reload, clobbering
  // the value just persisted above and causing API calls to dispatch to the wrong
  // backend (e.g. Subsonic endpoints against a Jellyfin server).
  if (serverType) store.dispatch(setServerType(serverType));

  return true;
});

// Dedicated read endpoint mirroring setCredentials' write surface — returns every
// credential field in a single round trip via invoke (never sendSync), so callers
// that need several fields at once (the axios request interceptors in api.ts and
// jellyfinApi.ts, and their module-level URL-building caches) don't pay for one
// blocking IPC round trip per field. Read-only; CREDENTIAL_KEYS protection doesn't
// apply here since nothing is being written.
ipcMain.handle('bridge:settings:getCredentials', () => {
  return {
    server: settings.get('server'),
    serverBase64: settings.get('serverBase64'),
    serverType: settings.get('serverType'),
    username: settings.get('username'),
    password: settings.get('password'),
    salt: settings.get('salt'),
    hash: settings.get('hash'),
    token: settings.get('token'),
    userId: settings.get('userId'),
    deviceId: settings.get('deviceId'),
    legacyAuth: settings.get('legacyAuth'),
  };
});

// Atomically clears all credential and server-config keys on disconnect.
// DisconnectButton.tsx uses this instead of individual settings.set() calls
// (which are blocked by the deny list).
ipcMain.handle('bridge:settings:disconnect', () => {
  const DISCONNECT_KEYS = [
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
    'deviceId',
    'musicFolder',
  ];
  for (const key of DISCONNECT_KEYS) {
    if (settings.has(key)) {
      settings.delete(key);
    }
  }
  // Keep the main process's long-lived Redux store (see setCredentials above) from
  // re-syncing a stale serverType back to the renderer on the next reload.
  store.dispatch(setServerType(Server.Subsonic));
  return true;
});

// Generic key delete for non-credential keys. Credential keys are still blocked.
ipcMain.handle('bridge:settings:delete', (_event, key) => {
  if (typeof key !== 'string') return false;
  if (SETTINGS_DENY_LIST.has(key)) return false;
  if (settings.has(key)) {
    settings.delete(key);
  }
  return true;
});

// `os.release()` for `isWindows10` — proxied because a sandboxed preload
// cannot load the `os` Node built-in.
ipcMain.on('bridge:os-release', (event) => {
  event.returnValue = os.release();
});

// Returns true once (and resets the flag) if the library cache was migrated on
// this launch. The renderer invokes this on mount so there is no timing race.
ipcMain.handle('check-library-cache-migration', () => {
  const result = libraryCacheWasMigrated;
  libraryCacheWasMigrated = false;
  return result;
});

// ─── Library cache (electron-store) bridge ────────────────────────────────────
ipcMain.on('bridge:library-cache:get', (event, key) => {
  event.returnValue = libraryCache.get(key);
});

ipcMain.on('bridge:library-cache:set', (event, key, value) => {
  libraryCache.set(key, value);
  event.returnValue = undefined;
});

ipcMain.on('bridge:set-default-settings', (event, force) => {
  setDefaultSettings(force);
  // Same staleness problem as import-settings (see that handler's comment) —
  // most concretely an issue for the force=true "Reset to defaults" flow,
  // which writes genuinely different values than whatever the user had
  // customized; dispatched unconditionally anyway since it's cheap and
  // idempotent, and Login.tsx's force=false call after a fresh install
  // shares this same call path.
  try {
    store.dispatch(replaceConfigState(buildConfigInitialState()));
    store.dispatch(refreshPlayQueueSettingsFields(buildPlayQueueSettingsDerivedFields()));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[set-default-settings] redux refresh failed:', err);
  }
  event.returnValue = undefined;
});

// ─── Now-playing export (OBS) ─────────────────────────────────────────────────
// Relocated from the renderer's writeOBSFiles (formerly direct fs.writeFile calls).
// Path is validated against the configured OBS output path to prevent the renderer
// from writing to arbitrary filesystem locations.
ipcMain.on('bridge:write-now-playing', (_event, filePath, data) => {
  const obsPath = settings.get('obs.path');
  if (!obsPath) return;
  try {
    assertUnderDir(filePath, obsPath);
  } catch {
    return;
  }
  const writeText = (fileName, contents) => {
    fs.writeFile(path.join(filePath, path.basename(fileName)), contents, (err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    });
  };

  writeText('album.txt', data.album || '');
  writeText('artists.txt', (data.artists || []).join(', '));
  writeText('duration.txt', String(data.duration) || '0');
  writeText('progress.txt', String(data.progress) || '0');
  writeText('status.txt', data.status || '');
  writeText('title.txt', data.title || '');
  writeText(
    'image.txt',
    data.cover_url?.replace(/&size=\d+|width=\d+&height=\d+&quality=\d+/, '') || ''
  );
});

// ─── Cache existence check ────────────────────────────────────────────────────
// Paths are validated against the configured cache directory to prevent traversal.
ipcMain.handle('bridge:cache:exists', (_event, filePath) => {
  try {
    assertUnderDir(filePath, getCacheBaseDir());
  } catch {
    return false;
  }
  return fs.existsSync(filePath);
});

// ─── Cache download commit sequence ──────────────────────────────────────────
ipcMain.handle('bridge:cache:remove-if-exists', (_event, filePath) => {
  try {
    assertUnderDir(filePath, getCacheBaseDir());
  } catch {
    return;
  }
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  } catch {
    // ignore — another download may have just cleaned it up
  }
});

// Writes the downloaded bytes to the TEMP path, then atomically renames TEMP to
// the final path. ENOENT on the rename means a concurrent call already renamed it.
ipcMain.handle('bridge:cache:commit-download', async (_event, tempPath, finalPath, data) => {
  try {
    assertUnderDir(tempPath, getCacheBaseDir());
  } catch {
    return;
  }
  try {
    assertUnderDir(finalPath, getCacheBaseDir());
  } catch {
    return;
  }
  await fs.promises.writeFile(tempPath, Buffer.from(data));
  try {
    fs.renameSync(tempPath, finalPath);
  } catch (err) {
    if (err.code !== 'ENOENT' || !fs.existsSync(finalPath)) throw err;
  }
});

// ─── Queue save/restore file I/O ─────────────────────────────────────────────
ipcMain.handle('bridge:queue:write', async (_event, filePath, data) => {
  try {
    assertUnderDir(filePath, app.getPath('userData'));
  } catch {
    return;
  }
  await fs.promises.writeFile(filePath, Buffer.from(data));
});

ipcMain.handle('bridge:queue:read', async (_event, filePath) => {
  try {
    assertUnderDir(filePath, app.getPath('userData'));
  } catch {
    return null;
  }
  try {
    const buffer = await fs.promises.readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

// ─── Cache directory management ───────────────────────────────────────────────
// Synchronous — `miscSlice.ts` calls this from inside a Redux `initialState` IIFE.
ipcMain.on('bridge:cache-dir:ensure', (event, dirPath) => {
  try {
    assertUnderDir(dirPath, getCacheBaseDir());
  } catch {
    event.returnValue = undefined;
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
  event.returnValue = undefined;
});

ipcMain.handle('bridge:cache-dir:get-size', async (_event, dirPath) => {
  try {
    assertUnderDir(dirPath, getCacheBaseDir());
  } catch {
    return 0;
  }
  try {
    const files = await fs.promises.readdir(dirPath);
    const sizes = await Promise.all(
      files.map(async (file) => {
        try {
          const stats = await fs.promises.stat(path.join(dirPath, file));
          return stats.isFile() ? stats.size : 0;
        } catch {
          return 0;
        }
      })
    );
    return sizes.reduce((total, size) => total + size, 0);
  } catch {
    return 0;
  }
});

ipcMain.handle('bridge:cache-dir:list', (_event, dirPath) => {
  try {
    assertUnderDir(dirPath, getCacheBaseDir());
  } catch {
    return [];
  }
  return fs.promises.readdir(dirPath);
});

ipcMain.handle('bridge:cache-dir:remove-files', (_event, dirPath, fileNames) => {
  try {
    assertUnderDir(dirPath, getCacheBaseDir());
  } catch {
    return;
  }
  return Promise.all(
    fileNames.map((file) => {
      const fullPath = path.join(dirPath, file);
      try {
        assertUnderDir(fullPath, dirPath);
      } catch {
        return;
      }
      return fs.promises.unlink(fullPath);
    })
  );
});

ipcMain.handle('bridge:cache-dir:evict-if-needed', async (_event, dirPath, limitBytes) => {
  if (typeof limitBytes !== 'number' || !Number.isFinite(limitBytes) || limitBytes <= 0) return;
  try {
    assertUnderDir(dirPath, getCacheBaseDir());
  } catch {
    return;
  }
  try {
    await evictOldestFilesUntilUnderLimit(dirPath, limitBytes);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[cache eviction] error reading cache dir', dirPath, err);
  }
});

// ─── Recovery files ───────────────────────────────────────────────────────────
ipcMain.handle('bridge:recovery:write', async (_event, filePath, data) => {
  try {
    assertUnderDir(filePath, getCacheBaseDir());
  } catch {
    return;
  }
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(filePath, data, 'utf-8');
  } catch {
    // ignore — matches the original createRecoveryFile's swallowed write errors
  }
});

ipcMain.handle('bridge:recovery:read', async (_event, filePath) => {
  try {
    assertUnderDir(filePath, getCacheBaseDir());
  } catch {
    return null;
  }
  try {
    return await fs.promises.readFile(filePath, { encoding: 'utf-8' });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

ipcMain.handle('bridge:recovery:remove', async (_event, filePath) => {
  try {
    assertUnderDir(filePath, getCacheBaseDir());
  } catch {
    return;
  }
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
});

// Only allow http/https URLs — prevents XSS-to-RCE via custom protocol handlers.
ipcMain.handle('bridge:shell:open-external', (_event, url) => {
  if (!/^https?:\/\//i.test(url)) return;
  shell.openExternal(url);
});

// open-path is used to reveal configured directories (cache, OBS) in the file manager.
ipcMain.handle('bridge:shell:open-path', async (_event, filePath) => {
  if (typeof filePath !== 'string') return;
  try {
    let accepted = false;
    try {
      assertUnderDir(filePath, getCacheBaseDir());
      accepted = true;
    } catch {}
    if (!accepted) {
      const obsOutputPath = settings.get('obs.path');
      if (typeof obsOutputPath === 'string' && obsOutputPath) {
        try {
          assertUnderDir(filePath, path.dirname(obsOutputPath));
          accepted = true;
        } catch {}
      }
    }
    if (!accepted) return;
    return await shell.openPath(filePath);
  } catch {
    return;
  }
});

// ─── Discord Rich Presence ────────────────────────────────────────────────────
ipcMain.on('bridge:discord:connect', (_event, clientId) => {
  if (typeof clientId !== 'string' || !/^\d+$/.test(clientId)) return;
  if (discordClient && discordClientId === clientId) return;
  destroyDiscordClient();

  const client = new RPC.Client({ transport: 'ipc' });
  discordClient = client;
  discordClientId = clientId;

  client.once('connected', () => {
    sendToRenderer('bridge:discord:connected');
  });

  client.login({ clientId }).catch((err) => {
    sendToRenderer('bridge:discord:error', `${err}`);
  });
});

ipcMain.on('bridge:discord:disconnect', () => {
  destroyDiscordClient();
});

ipcMain.on('bridge:discord:set-activity', (_event, activity) => {
  discordClient?.setActivity(activity);
});

// ─── MPV backend ──────────────────────────────────────────────────────────────
ipcMain.handle('player-initialize', async (_, { extraParameters = [], properties = {} } = {}) => {
  try {
    await quitAndReplace(getMpvBinary(), extraParameters, properties);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[MPV] player-initialize failed:', err?.message ?? err);
    mpvInstance = null;
    sendToRenderer('renderer-player-fallback', true);
  }
});

ipcMain.handle('player-restart', async (_, { extraParameters = [], properties = {} } = {}) => {
  try {
    await quitAndReplace(getMpvBinary(), extraParameters, properties);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[MPV] player-restart failed:', err?.message ?? err);
    mpvInstance = null;
    sendToRenderer('renderer-player-fallback', true);
  }
});

// Read-only — exposes which --replaygain mode the running MPV process was
// actually spawned with, for e2e assertions that need to verify past the UI
// layer. Returns null if MPV isn't running or was never started with the flag.
ipcMain.handle('player-get-active-replaygain-mode', () => activeMpvReplayGainMode);

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
  // Null immediately so a concurrent player-initialize doesn't see a stale reference.
  const instance = mpvInstance;
  mpvInstance = null;
  if (instance && instance.isRunning()) {
    try {
      await instance.quit();
    } catch {
      /* ignore */
    }
  }
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
  if (mpv && mpv.isRunning()) {
    mpv.goToPosition(time).catch(() => {});
    // Immediately sync the renderer's displayed time — MPV doesn't emit
    // timeposition events while paused, so the progress bar would otherwise
    // stay at the old position until playback resumes.
    sendToRenderer('renderer-player-current-time', time);
  }
});

ipcMain.on('player-volume', (_, value) => {
  const mpv = getMpv();
  if (mpv && mpv.isRunning()) mpv.volume(value).catch(() => {});
});

ipcMain.on('player-mute', (_, mute) => {
  if (typeof mute !== 'boolean') return;
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

// Called after auto-next: MPV advanced from pos 0→1. Remove finished track, append next.
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
// ─── End MPV backend ──────────────────────────────────────────────────────────

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
    delete store.themesDefault;
    delete store.acceptSelfSigned;
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
    const accepted = validateImportedSettings(parsed, settings.store, SETTINGS_DENY_LIST);
    if (!accepted) return { success: false, error: true };
    Object.entries(accepted).forEach(([key, value]) => {
      settings.set(key, value);
    });
    // The settings themselves are already correctly persisted at this point,
    // so a failure in this refresh must not surface as an import failure —
    // it would be misleading (the import did succeed) and there's nothing
    // the user could do differently. Caught separately from the main
    // try/catch below for exactly that reason.
    //
    // The main process's redux store is created once at app boot and never
    // recomputed afterwards, so without this it stays stale relative to the
    // settings just written above — and on the next reload, electron-redux's
    // INIT_STATE handshake re-hydrates the renderer FROM that stale state,
    // silently reverting whatever was just imported. configSlice gets a full
    // rebuild (safe — see buildInitialState's comment); playQueueSlice only
    // gets the settings-derived subset merged in, since the rest of it is
    // live queue state that must survive an import untouched.
    try {
      store.dispatch(replaceConfigState(buildConfigInitialState()));
      store.dispatch(refreshPlayQueueSettingsFields(buildPlayQueueSettingsDerivedFields()));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[import-settings] redux refresh failed (settings were still saved):', err);
    }
    return { success: true };
  } catch {
    return { success: false, error: true };
  }
});

ipcMain.handle('file-path', async () => {
  const filePath = dialog.showOpenDialogSync({
    properties: ['openFile', 'openDirectory'],
  });
  return filePath;
});

ipcMain.on('minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('maximize', () => {
  mainWindow?.maximize();
});

ipcMain.on('unmaximize', () => {
  mainWindow?.unmaximize();
});

ipcMain.on('close', () => {
  mainWindow?.close();
});

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
    backgroundColor: getWindowBackgroundColor(),
    width: windowDimensions[0],
    height: windowDimensions[1],
    center: isCentered,
    x: windowPos[0],
    y: windowPos[1],
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.prod.js'),
    },
    autoHideMenuBar: true,
    minWidth: 768,
    minHeight: 600,
    frame: settings.get('titleBarStyle') === 'native',
  });

  // Dev console gating lives here, not on globalShortcut, because Chromium
  // treats F12/Ctrl+Shift+I as reserved DevTools accelerators that can fire
  // through its own built-in handling even when a globalShortcut is registered
  // for the same combination (this is what let F12 bypass the allowDevConsole
  // gate in packaged builds). before-input-event intercepts the raw keyboard
  // event before Chromium's internal accelerator handling runs, so
  // preventDefault() here reliably stops it. Registered once per window
  // (createWindow runs again on macOS dock-reactivate), not in a standalone
  // function re-invoked from enable/disableGlobalHotkeys — there's nothing to
  // re-register since this isn't a globalShortcut.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // Always a no-op, regardless of the setting.
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      return;
    }

    if (input.key === 'F12') {
      event.preventDefault();
      if (settings.get('allowDevConsole')) {
        mainWindow?.webContents.openDevTools({ mode: 'undocked' });
      }
    }
  });

  mainWindow.loadURL(`file://${__dirname}/index.html#${settings.get('startPage')}`);

  mainWindow.once('ready-to-show', () => {
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

    // Stop the jukebox server before closing so music doesn't keep playing after the app exits.
    // Skipped when hiding to tray (event.defaultPrevented is true in that case).
    if (!jukeboxStopped && store.getState().jukebox?.enabled && !event.defaultPrevented) {
      event.preventDefault();
      jukeboxStopped = true;
      saved = true; // jukebox clears the local queue on enable, nothing useful to save
      stopJukeboxOnClose(() => {
        mainWindow.close();
        if (forceQuit) app.exit();
      });
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

  // Open urls in the user's browser — only allow http/https to prevent protocol injection
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
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
        if (mainWindow) {
          mainWindow.show();
          createWinThumbarButtons();
        } else {
          createWindow();
        }
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
    if (mainWindow) {
      mainWindow.show();
      createWinThumbarButtons();
    } else {
      createWindow();
    }
  });

  tray.setToolTip('Sonixd Redux');
  tray.setContextMenu(contextMenu);
};

const gotProcessLock = app.requestSingleInstanceLock();
if (!gotProcessLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
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

app.on('will-quit', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('before-quit', () => {
  sendToRenderer('flush-cache-now');
});

// Re-verify certificates that Chromium rejects using Node.js TLS against the
// system CA bundle loaded above. This lets user-trusted CAs (e.g. a home router
// or OPNsense CA) work on Linux without any manual NSS database manipulation.
// Node.js and Chromium use independent TLS stacks, so this request will not
// re-trigger the certificate-error event.
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (settings.get('acceptSelfSigned')) {
    event.preventDefault();
    callback(true);
    return;
  }

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

// Chromium's default autoplay policy requires "user activation" on the document
// before allowing <audio>.play() to succeed. A double-click dispatched through
// Electron/Playwright's input pipeline normally satisfies this, but under a
// virtual display (Xvfb, no real window manager to establish focus/activation
// state the way a real desktop does) it can still be silently blocked — playback
// never starts, with no thrown error since the rejected play() promise isn't
// surfaced anywhere. This is a desktop app the user explicitly launched and
// clicked inside of, not a website serving unsolicited audio, so the policy
// this switch relaxes doesn't protect anything meaningful here.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app
  .whenReady()
  .then(async () => {
    // Renderer must not load (and start sending IPC) before the main process's
    // redux store exists — see initStore() above.
    await storeReadyPromise;
    createWindow();
    createTray();
    registerMediaShortcuts();
    if (settings.get('globalShortcuts')) {
      registerCustomShortcutsFromSettings();
    }
    return null;
  })
  .catch(console.log); // eslint-disable-line no-console

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
    // Re-register shortcuts after window-all-closed unregistered them all.
    registerMediaShortcuts();
    if (settings.get('globalShortcuts')) {
      registerCustomShortcutsFromSettings();
    }
  } else {
    mainWindow.show();
  }
});

// These handlers are registered once at module level (not inside createWindow) to
// prevent accumulation on macOS where createWindow() is called again on dock re-open.
ipcMain.on('enable-global-shortcuts', () => {
  registerCustomShortcutsFromSettings();
});

ipcMain.on('disable-global-shortcuts', () => {
  unregisterCustomShortcuts();
});

ipcMain.on('update-local-shortcut', (_event, { action, oldKey, newKey }) => {
  const actions = {
    playPause: () => playPause(),
    nextTrack: () => nextTrack(),
    prevTrack: () => previousTrack(),
    volumeUp: () => volumeUp(),
    volumeDown: () => volumeDown(),
    mute: () => toggleMute(),
  };
  const handler = actions[action];
  if (!handler) return;
  if (oldKey) {
    const oldAcc = toAccelerator(oldKey);
    try {
      globalShortcut.unregister(oldAcc);
    } catch {
      // already unregistered — no-op
    }
    customShortcutKeys = customShortcutKeys.filter((k) => k !== oldAcc);
  }
  if (newKey) {
    const newAcc = toAccelerator(newKey);
    try {
      if (
        globalShortcut.register(newAcc, () => {
          if (!mainWindow?.isFocused()) return;
          handler();
        })
      ) {
        customShortcutKeys.push(newAcc);
      }
    } catch {
      // invalid accelerator — skip
    }
  }
});

ipcMain.on('quicksave', () => {
  quickSave();
});

ipcMain.on('enableGlobalHotkeys', () => {
  globalShortcut.unregister('MediaStop');
  globalShortcut.unregister('MediaPlayPause');
  globalShortcut.unregister('MediaNextTrack');
  globalShortcut.unregister('MediaPreviousTrack');

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

  if (settings.get('globalShortcuts')) {
    registerCustomShortcutsFromSettings();
  }
});

ipcMain.on('disableGlobalHotkeys', () => {
  globalShortcut.unregisterAll();
  customShortcutKeys = [];

  if (settings.get('globalShortcuts')) {
    registerCustomShortcutsFromSettings();
  }

  if (mainWindow && !settings.get('systemMediaTransportControls')) {
    globalShortcut.register('MediaStop', () => {
      if (!mainWindow?.isFocused()) return;
      stop();
    });

    globalShortcut.register('MediaPlayPause', () => {
      if (!mainWindow?.isFocused()) return;
      playPause();
    });

    globalShortcut.register('MediaNextTrack', () => {
      if (!mainWindow?.isFocused()) return;
      nextTrack();
    });

    globalShortcut.register('MediaPreviousTrack', () => {
      if (!mainWindow?.isFocused()) return;
      previousTrack();
    });
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
