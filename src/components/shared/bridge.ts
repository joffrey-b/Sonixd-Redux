/**
 * Renderer-side proxy for the `window.bridge` surface exposed by `preload.js`.
 *
 * With `contextIsolation: true` the renderer can no longer `require('electron')`
 * or `require('electron-store')` directly — these wrappers preserve the exact
 * call signatures the renderer already used (`settings.get/set/has/store/path/clear`,
 * `ipcRenderer.send/invoke/on/...`, `shell.openExternal`, etc.) so call sites can
 * switch their import without any logic changes.
 */

import type { Settings } from './setDefaultSettings';

type GetSettingsFn = {
  <K extends keyof Settings>(key: K): Settings[K] | undefined;
  (key: 'pagination.music.serverSide'): boolean | undefined;
  (key: 'pagination.album.serverSide'): boolean | undefined;
  (key: string): unknown;
};

type SetSettingsFn = {
  <K extends keyof Settings>(key: K, value: Settings[K]): void;
  (key: string, value: unknown): void;
};

declare global {
  interface Window {
    bridge: {
      settings: {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
        has: (key: string) => boolean;
        clear: () => void;
        getStore: () => unknown;
        getPath: () => string;
        getDefaultCachePath: () => string;
        setCredentials: (credentials: {
          server: string;
          serverBase64: string;
          serverType: string;
          username: string;
          hash?: string;
          salt?: string;
          userId?: string;
          token?: string;
          deviceId?: string;
          legacyAuth?: boolean;
          password?: string;
        }) => Promise<boolean>;
        disconnect: () => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        getCredentials: () => Promise<{
          server?: string;
          serverBase64?: string;
          serverType?: string;
          username?: string;
          password?: string;
          salt?: string;
          hash?: string;
          token?: string;
          userId?: string;
          deviceId?: string;
          legacyAuth?: boolean;
        }>;
      };
      osRelease: string;
      setDefaultSettings: (force: boolean) => void;
      nowPlaying: {
        write: (filePath: string, data: unknown) => void;
      };
      cache: {
        exists: (filePath: string) => Promise<boolean>;
        removeIfExists: (filePath: string) => Promise<void>;
        commitDownload: (tempPath: string, finalPath: string, data: ArrayBuffer) => Promise<void>;
      };
      queue: {
        write: (filePath: string, data: ArrayBuffer) => Promise<void>;
        read: (filePath: string) => Promise<ArrayBuffer | null>;
      };
      cacheDir: {
        ensure: (dirPath: string) => void;
        getSize: (dirPath: string) => Promise<number>;
        list: (dirPath: string) => Promise<string[]>;
        removeFiles: (dirPath: string, fileNames: string[]) => Promise<void>;
        evictIfNeeded: (dirPath: string, limitBytes: number) => Promise<void>;
      };
      recovery: {
        write: (filePath: string, data: string) => Promise<void>;
        read: (filePath: string) => Promise<string | null>;
        remove: (filePath: string) => Promise<void>;
      };
      libraryCache: {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
      };
      ipcRenderer: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC channels carry heterogeneous payloads; typed at each call site
        send: (channel: string, ...args: any[]) => void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC return type is channel-dependent; callers assert the specific type
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- listener args depend on the channel; callers type their own handler params
        on: (channel: string, listener: (...args: any[]) => void) => void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- listener args depend on the channel; callers type their own handler params
        removeListener: (channel: string, listener: (...args: any[]) => void) => void;
        removeAllListeners: (channel: string) => void;
      };
      shell: {
        openExternal: (url: string) => void;
        openPath: (path: string) => void;
      };
      clipboard: {
        writeText: (text: string) => void;
      };
      webFrame: {
        setZoomFactor: (factor: number) => void;
      };
    };
  }
}

export const settings = {
  get: ((key: string) => window.bridge.settings.get(key)) as GetSettingsFn,
  set: ((key: string, value: unknown) => window.bridge.settings.set(key, value)) as SetSettingsFn,
  has: (key: string): boolean => window.bridge.settings.has(key),
  clear: (): void => window.bridge.settings.clear(),
  get store(): Partial<Settings> {
    return window.bridge.settings.getStore() as Partial<Settings>;
  },
  get path(): string {
    return window.bridge.settings.getPath();
  },
  getDefaultCachePath: (): string => window.bridge.settings.getDefaultCachePath(),
  setCredentials: (
    credentials: Parameters<typeof window.bridge.settings.setCredentials>[0]
  ): Promise<boolean> => window.bridge.settings.setCredentials(credentials),
  disconnect: (): Promise<boolean> => window.bridge.settings.disconnect(),
  delete: (key: string): Promise<boolean> => window.bridge.settings.delete(key),
  getCredentials: (): ReturnType<typeof window.bridge.settings.getCredentials> =>
    window.bridge.settings.getCredentials(),
};

// Computed once in preload (always a real Node context) and exposed as a plain
// string — used by `isWindows10` in place of the renderer-side `os.release()`,
// which would otherwise compile to a runtime `require("os")` that breaks post-flip.
export const osRelease = (): string => window.bridge.osRelease;

export const setDefaultSettings = (force: boolean): void => window.bridge.setDefaultSettings(force);

export const nowPlaying = {
  write: (filePath: string, data: unknown): void => window.bridge.nowPlaying.write(filePath, data),
};

export const cache = {
  exists: (filePath: string): Promise<boolean> => window.bridge.cache.exists(filePath),
  removeIfExists: (filePath: string): Promise<void> => window.bridge.cache.removeIfExists(filePath),
  commitDownload: (tempPath: string, finalPath: string, data: ArrayBuffer): Promise<void> =>
    window.bridge.cache.commitDownload(tempPath, finalPath, data),
};

export const queue = {
  write: (filePath: string, data: ArrayBuffer): Promise<void> =>
    window.bridge.queue.write(filePath, data),
  read: (filePath: string): Promise<ArrayBuffer | null> => window.bridge.queue.read(filePath),
};

export const cacheDir = {
  ensure: (dirPath: string): void => window.bridge.cacheDir.ensure(dirPath),
  getSize: (dirPath: string): Promise<number> => window.bridge.cacheDir.getSize(dirPath),
  list: (dirPath: string): Promise<string[]> => window.bridge.cacheDir.list(dirPath),
  removeFiles: (dirPath: string, fileNames: string[]): Promise<void> =>
    window.bridge.cacheDir.removeFiles(dirPath, fileNames),
  evictIfNeeded: (dirPath: string, limitBytes: number): Promise<void> =>
    window.bridge.cacheDir.evictIfNeeded(dirPath, limitBytes),
};

export const recovery = {
  write: (filePath: string, data: string): Promise<void> =>
    window.bridge.recovery.write(filePath, data),
  read: (filePath: string): Promise<string | null> => window.bridge.recovery.read(filePath),
  remove: (filePath: string): Promise<void> => window.bridge.recovery.remove(filePath),
};

export const libraryCacheStore = {
  get: (key: string): unknown => window.bridge.libraryCache.get(key),
  set: (key: string, value: unknown): void => window.bridge.libraryCache.set(key, value),
};

export const ipcRenderer = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC channels carry heterogeneous payloads; typed at each call site
  send: (channel: string, ...args: any[]): void => window.bridge.ipcRenderer.send(channel, ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC return type is channel-dependent; callers assert the specific type
  invoke: (channel: string, ...args: any[]): Promise<any> =>
    window.bridge.ipcRenderer.invoke(channel, ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- listener args depend on the channel; callers type their own handler params
  on: (channel: string, listener: (...args: any[]) => void): void =>
    window.bridge.ipcRenderer.on(channel, listener),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- listener args depend on the channel; callers type their own handler params
  removeListener: (channel: string, listener: (...args: any[]) => void): void =>
    window.bridge.ipcRenderer.removeListener(channel, listener),
  removeAllListeners: (channel: string): void =>
    window.bridge.ipcRenderer.removeAllListeners(channel),
};

export const shell = {
  openExternal: (url: string): void => window.bridge.shell.openExternal(url),
  openPath: (path: string): void => window.bridge.shell.openPath(path),
};

export const clipboard = {
  writeText: (text: string): void => window.bridge.clipboard.writeText(text),
};

export const webFrame = {
  setZoomFactor: (factor: number): void => window.bridge.webFrame.setZoomFactor(factor),
};
