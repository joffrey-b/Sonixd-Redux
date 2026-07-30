// Downloads (ADR Section 8.1): the user-chosen download folder path, resolved
// via the same async-cache-with-invalidation pattern as api.ts's
// credentialCache and offlineActionQueue.ts's getCachedBaseCachePath (Lesson
// #1) -- resolved once via settings.getDownloadPath() (invoke, never the sync
// sendSync-backed settings.get()), cached in memory, invalidated explicitly by
// clearDownloadPathCache() on login/disconnect (called from the same spots
// clearCredentialCache()/clearOfflineQueuePathCache() already are). Before the
// first async resolution completes, falls back to one sync settings.get()
// call, matching both existing caches' documented first-call tradeoff.
import { settings, ipcRenderer } from '../components/shared/bridge';
import { createAsyncCachedValue } from './createAsyncCachedValue';

const downloadPathCache = createAsyncCachedValue(
  async () => String((await settings.getDownloadPath()) || ''),
  () => String(settings.get('downloadPath') || '')
);

export const clearDownloadPathCache = (): void => downloadPathCache.clear();

const testMockSettings = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require is intentional: avoids bundling mockSettings in production
  return process.env.NODE_ENV === 'test' ? require('./mockSettings').mockSettings : null;
};

// Empty string means "not configured yet" -- every caller must treat that as
// "downloads are unavailable", not attempt a write against an empty base path.
export const getCachedDownloadPath = (): string => {
  const ms = testMockSettings();
  if (ms) return String(ms.downloadPath || '');
  return downloadPathCache.get();
};

export const isDownloadFolderConfigured = (): boolean => getCachedDownloadPath().length > 0;

// ADR Section 8.1: the real folder-picker dialog. Audit fix: downloadPath is
// now on main.dev.mjs's SETTINGS_DENY_LIST, so the main process persists the
// setting itself directly from the real dialog result -- this no longer
// returns an unpersisted value for the caller to write back via the generic
// settings.set channel. Callers still need to call clearDownloadPathCache()
// so the in-memory cache doesn't go stale relative to the new setting.
export const selectDownloadFolder = async (): Promise<string | undefined> => {
  const result = await ipcRenderer.invoke('select-download-folder');
  return result?.success ? (result.path as string) : undefined;
};

// Audit fix: the dedicated counterpart to selectDownloadFolder for clearing
// the setting, now that the generic settings.set channel is blocked for this
// key. Also invalidates the in-memory cache so the next getCachedDownloadPath()
// call doesn't keep returning the just-cleared value.
export const clearDownloadPath = async (): Promise<void> => {
  await ipcRenderer.invoke('bridge:settings:clear-download-path');
  clearDownloadPathCache();
};
