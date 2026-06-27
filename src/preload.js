/**
 * electron-redux preload — runs before the renderer, injects the state-sync
 * bridge into the renderer window so that electron-redux/renderer can forward
 * actions to the main process without the renderer bundle needing direct IPC
 * access.  With contextIsolation: false the bridge is set on window directly;
 * with contextIsolation: true it is exposed via contextBridge.
 */
import { contextBridge, ipcRenderer, clipboard, webFrame } from 'electron';
// electron-redux/preload calls preload() automatically at module evaluation time
// (see its line: `preload();`). Importing for side effects only avoids a second
// invocation that would cause contextBridge.exposeInMainWorld to throw on the
// already-registered '__ElectronReduxBridge' key.
import 'electron-redux/preload';

// index.html's inline bootstrap scripts read process.env.NODE_ENV/PORT to decide
// which bundle to load, and a handful of renderer modules read process.platform /
// process.versions.{node,chrome,electron} (OS-detection helpers, the About panel).
// With contextIsolation: true the renderer's main world has no direct access to
// Node's `process`, so we expose a minimal, whitelisted shim — exactly the fields
// actually consumed, never the full `process` object (which would additionally leak
// process.binding/env/cwd/etc. and reopen the access contextIsolation closes).
const processEnv = {
  env: {
    // __DEV__ is injected by webpack.config.preload.mjs via DefinePlugin.
    // APP_NODE_ENV=development sets it true; production builds leave it false.
    // This decouples the webpack build mode (always 'production') from what the
    // renderer window sees as NODE_ENV, which controls bundle selection in index.html.
    NODE_ENV: __DEV__ ? 'development' : 'production',
    PORT: process.env.PORT,
  },
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
};

contextBridge.exposeInMainWorld('process', processEnv);

// `isWindows10` needs `os.release()` to distinguish Windows 10 from other win32
// versions. Electron 20+ defaults `sandbox: true` whenever `webPreferences`
// doesn't explicitly opt out (this project doesn't), and a sandboxed preload's
// Node built-ins are loaded through a small allowlisted shim that does NOT
// include `os` (`import os from 'os'` throws `module not found: os`, aborting
// this entire script before any `contextBridge.exposeInMainWorld` call runs —
// confirmed live via CDP console capture). `os` is a real, unrestricted Node
// built-in in the main process (never sandboxed), so — exactly like every other
// Node-API access this bridge relocates — we proxy it through a synchronous IPC
// call alongside `bridge:settings:*` (see `bridge:os-release` in main.dev.mjs);
// computed once here as a plain string, not a function, since it never changes
// during a run.
const osRelease = ipcRenderer.sendSync('bridge:os-release');

// ─── C1 bridge: replaces direct nodeIntegration access with a minimal,
// whitelisted surface so `nodeIntegration` can eventually be set to false.
// Only the exact methods/channels the renderer actually uses are exposed —
// never raw `ipcRenderer`/`shell`/`clipboard`/`require`, which would let a
// compromised renderer reach arbitrary main-process behaviour again.

// Every IPC channel name the renderer sends/listens on. Keeping this as an
// explicit whitelist means a renderer can never address a channel it wasn't
// already wired to use — channel names are a contract enforced here too.
const IPC_CHANNELS = new Set([
  'app-version',
  'export-settings',
  'import-settings',
  'player-get-audio-devices',
  'player-get-active-replaygain-mode',
  'player-set-audio-device',
  'minimize',
  'maximize',
  'unmaximize',
  'close',
  'player-mute',
  'player-next-track',
  'player-play-pause',
  'player-prev-track',
  'player-stop',
  'player-volume-down',
  'player-volume-up',
  'player-auto-next',
  'player-initialize',
  'player-pause',
  'player-play',
  'player-quit',
  'player-restart',
  'player-seek-to',
  'player-set-af',
  'player-set-queue',
  'player-set-queue-next',
  'player-volume',
  'renderer-player-auto-next',
  'renderer-player-current-time',
  'renderer-player-fallback',
  'renderer-player-play',
  'renderer-player-stop',
  'restore-queue-state',
  'save-queue-state',
  'saved-state',
  'stop-jukebox-on-close',
  'jukebox-stopped',
  'quicksave',
  'reload',
  'enable-global-shortcuts',
  'disable-global-shortcuts',
  'enableGlobalHotkeys',
  'disableGlobalHotkeys',
  'bridge:discord:connect',
  'bridge:discord:disconnect',
  'bridge:discord:set-activity',
  'bridge:discord:connected',
  'bridge:discord:error',
  'file-path',
  'mpv-debug-log',
  'update-local-shortcut',
  'flush-cache-now',
  'check-library-cache-migration',
]);

function assertChannel(channel) {
  if (!IPC_CHANNELS.has(channel)) {
    throw new Error(`bridge.ipcRenderer: channel "${channel}" is not whitelisted`);
  }
}

const bridge = {
  // Synchronous settings proxy — electron-store is file-backed, so the single
  // Store instance stays in main (avoids two processes writing the same file).
  // `getStore`/`getPath` are exposed as functions, not getters: contextBridge
  // can only proxy function-valued members across the isolation boundary.
  settings: {
    get: (key) => ipcRenderer.sendSync('bridge:settings:get', key),
    set: (key, value) => ipcRenderer.sendSync('bridge:settings:set', key, value),
    has: (key) => ipcRenderer.sendSync('bridge:settings:has', key),
    clear: () => ipcRenderer.sendSync('bridge:settings:clear'),
    getStore: () => ipcRenderer.sendSync('bridge:settings:store'),
    getPath: () => ipcRenderer.sendSync('bridge:settings:path'),
    getDefaultCachePath: () => ipcRenderer.sendSync('bridge:settings:default-cache-path'),
    setCredentials: (credentials) =>
      ipcRenderer.invoke('bridge:settings:setCredentials', credentials),
    disconnect: () => ipcRenderer.invoke('bridge:settings:disconnect'),
    delete: (key) => ipcRenderer.invoke('bridge:settings:delete', key),
    getCredentials: () => ipcRenderer.invoke('bridge:settings:getCredentials'),
  },

  // Computed once in preload (see `osRelease` above) — exposed as a plain string,
  // not a function, since contextBridge can clone primitives directly and the
  // value is immutable for the lifetime of the process.
  osRelease,

  setDefaultSettings: (force) => ipcRenderer.sendSync('bridge:set-default-settings', force),

  // Batches the OBS now-playing export's 6 file writes into one fire-and-forget
  // message — this fires on a poll timer (as fast as every 100ms), so round-tripping
  // each write individually would be a hot-path performance regression.
  nowPlaying: {
    write: (filePath, data) => ipcRenderer.send('bridge:write-now-playing', filePath, data),
  },

  // Replaces the renderer's direct fs.existsSync/.rmSync/.renameSync/.promises.writeFile
  // calls in cacheImage/cacheSong's download-commit sequence. fetch() itself stays in
  // the renderer (Chromium network stack — OS cert store, redirects, acceptSelfSigned
  // all depend on it); only the filesystem half of the sequence moves to main.
  cache: {
    exists: (filePath) => ipcRenderer.invoke('bridge:cache:exists', filePath),
    removeIfExists: (filePath) => ipcRenderer.invoke('bridge:cache:remove-if-exists', filePath),
    commitDownload: (tempPath, finalPath, data) =>
      ipcRenderer.invoke('bridge:cache:commit-download', tempPath, finalPath, data),
  },

  // Replaces the renderer's direct fs.access/.readFile/.writeFile calls in
  // usePlayerControls' handleSaveQueue/handleRestoreQueue. zlib deflate/inflate
  // (pure CPU, no fs access) and path.join (pure string manipulation) stay in
  // the renderer; only the actual file I/O moves to main.
  queue: {
    write: (filePath, data) => ipcRenderer.invoke('bridge:queue:write', filePath, data),
    read: (filePath) => ipcRenderer.invoke('bridge:queue:read', filePath),
  },

  // Replaces the renderer's direct fs.existsSync/.mkdirSync/.promises.readdir/.stat/.unlink
  // calls in CacheConfig's directory-management UI. Only the fs primitives relocate to
  // main — which files to delete is still decided in the renderer with the exact same
  // pure-string filters the original code used (regex/split/extension checks need no fs
  // access). `ensure` is exposed synchronously (sendSync, mirroring `bridge.settings`)
  // because `miscSlice.ts` calls it from inside a Redux `initialState` IIFE — evaluated
  // once at store-creation time, before any `await` is possible — so every other mkdir
  // call site reuses the same sync method rather than maintaining two parallel variants.
  cacheDir: {
    ensure: (dirPath) => ipcRenderer.sendSync('bridge:cache-dir:ensure', dirPath),
    getSize: (dirPath) => ipcRenderer.invoke('bridge:cache-dir:get-size', dirPath),
    list: (dirPath) => ipcRenderer.invoke('bridge:cache-dir:list', dirPath),
    removeFiles: (dirPath, fileNames) =>
      ipcRenderer.invoke('bridge:cache-dir:remove-files', dirPath, fileNames),
    evictIfNeeded: (dirPath, limitBytes) =>
      ipcRenderer.invoke('bridge:cache-dir:evict-if-needed', dirPath, limitBytes),
  },

  // Replaces the renderer's direct fs.existsSync/.readFileSync/.unlinkSync calls in
  // PlaylistView's recovery-file flow (and the fs.existsSync/.mkdirSync/.promises.writeFile
  // sequence in `createRecoveryFile`). `cache.exists` (a generic fs.existsSync passthrough)
  // is reused for the existence check rather than adding a redundant channel.
  recovery: {
    write: (filePath, data) => ipcRenderer.invoke('bridge:recovery:write', filePath, data),
    read: (filePath) => ipcRenderer.invoke('bridge:recovery:read', filePath),
    remove: (filePath) => ipcRenderer.invoke('bridge:recovery:remove', filePath),
  },

  // Replaces the renderer's direct `new Store(...)` instance in libraryCache.ts —
  // electron-store is file-backed, so (exactly like `bridge.settings`) the single
  // instance stays in main and the renderer gets a synchronous proxy preserving the
  // exact get/set call signatures `useLibraryCache.ts`'s 13 call sites already use.
  libraryCache: {
    get: (key) => ipcRenderer.sendSync('bridge:library-cache:get', key),
    set: (key, value) => ipcRenderer.sendSync('bridge:library-cache:set', key, value),
  },

  ipcRenderer: {
    send: (channel, ...args) => {
      assertChannel(channel);
      ipcRenderer.send(channel, ...args);
    },
    invoke: (channel, ...args) => {
      assertChannel(channel);
      return ipcRenderer.invoke(channel, ...args);
    },
    on: (channel, listener) => {
      assertChannel(channel);
      ipcRenderer.on(channel, listener);
    },
    removeListener: (channel, listener) => {
      assertChannel(channel);
      ipcRenderer.removeListener(channel, listener);
    },
    removeAllListeners: (channel) => {
      assertChannel(channel);
      ipcRenderer.removeAllListeners(channel);
    },
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke('bridge:shell:open-external', url),
    openPath: (path) => ipcRenderer.invoke('bridge:shell:open-path', path),
  },

  clipboard: {
    writeText: (text) => clipboard.writeText(text),
  },

  webFrame: {
    setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  },
};

contextBridge.exposeInMainWorld('bridge', bridge);
