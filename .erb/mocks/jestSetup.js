// Polyfills for jsdom test environment
// react-router-dom v7 requires TextEncoder/TextDecoder
const { TextEncoder, TextDecoder } = require('util');
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

// Stub window.bridge so bridge.ts proxies don't crash on module load in jsdom.
// api.ts calls settings.get() at the top level when building the auth object;
// returning undefined for all keys is fine — the test guard in api.ts already
// substitutes mockSettings for legacyAuth, and auth values don't matter in tests.
const noop = () => {};
const asyncNoop = () => Promise.resolve();

global.window.bridge = {
  settings: {
    get: () => undefined,
    set: noop,
    has: () => false,
    clear: noop,
    getStore: () => ({}),
    getPath: () => '',
    getDefaultCachePath: () => '',
    getCredentials: () => Promise.resolve({}),
  },
  osRelease: '',
  setDefaultSettings: noop,
  nowPlaying: { write: noop },
  cache: {
    exists: () => Promise.resolve(false),
    removeIfExists: asyncNoop,
    commitDownload: asyncNoop,
  },
  queue: {
    write: asyncNoop,
    read: () => Promise.resolve(null),
  },
  cacheDir: {
    ensure: noop,
    getSize: () => Promise.resolve(0),
    list: () => Promise.resolve([]),
    removeFiles: asyncNoop,
    evictIfNeeded: asyncNoop,
  },
  recovery: {
    write: asyncNoop,
    read: () => Promise.resolve(null),
    remove: asyncNoop,
  },
  libraryCache: { get: () => undefined, set: noop },
  ipcRenderer: {
    send: noop,
    invoke: () => Promise.resolve(),
    on: noop,
    removeListener: noop,
    removeAllListeners: noop,
  },
  shell: { openExternal: noop, openPath: noop },
  clipboard: { writeText: noop },
  webFrame: { setZoomFactor: noop },
};

