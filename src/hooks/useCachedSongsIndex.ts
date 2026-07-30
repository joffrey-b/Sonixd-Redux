// Populates the cached-songs index (ADR Section 5.3/6) once at startup via a
// single cacheDir.list() IPC call -- never a per-song IPC check (Lesson #1).
// Mounted once at the App root, mirroring useConnectivityMonitor's/
// useCheckForUpdates's "no visible UI, runs for the app's lifetime" shape.
//
// enabled is an injectable parameter (matches useConnectivityMonitor's Fix 5
// precedent) rather than a hardcoded process.env.NODE_ENV check.
import { useEffect } from 'react';
import { useAppDispatch } from '../redux/hooks';
import { setCachedSongIds, removeCachedSongIds } from '../redux/cachedSongsSlice';
import { cacheDir, ipcRenderer } from '../components/shared/bridge';
import { getSongCachePath } from '../shared/utils';
import { settings } from '../components/shared/bridge';

// Song cache filenames are `${songId}.${suffix}` (System 3a) with an
// in-progress download prefixed `TEMP_` -- both need to be accounted for
// when turning a directory listing back into a set of cached song ids.
export const fileNamesToSongIds = (fileNames: string[]): string[] => {
  return fileNames
    .filter((name) => !name.startsWith('TEMP_'))
    .map((name) => name.replace(/\.[^.]+$/, ''))
    .filter((id) => id.length > 0);
};

const useCachedSongsIndex = (enabled: boolean = true): void => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!enabled) return;

    // No server configured yet (pre-login) -- getSongCachePath() depends on
    // serverBase64, so listing before login would target a bogus path.
    if (!settings.get('server') || !settings.get('serverBase64')) return;

    cacheDir
      .list(getSongCachePath())
      .then((fileNames) => {
        dispatch(setCachedSongIds(fileNamesToSongIds(fileNames)));
        return undefined;
      })
      .catch(() => {
        // No cache directory yet / listing failed -- fail safe as "nothing cached".
        dispatch(setCachedSongIds([]));
      });
  }, [enabled, dispatch]);

  // Fix D: live-tracks cache eviction, not just additions. main.dev.mjs pushes
  // this the moment bridge:cache-dir:evict-if-needed actually deletes files --
  // eviction only ever runs mid-session (as a side effect of caching a new
  // song), well after this listener is registered, so there's no startup-mount
  // race to worry about here (unlike 'check-library-cache-migration', which is
  // pull-based specifically because of one).
  useEffect(() => {
    if (!enabled) return undefined;

    const onCacheFilesEvicted = (_event: unknown, fileNames: string[]) => {
      const songIds = fileNamesToSongIds(fileNames);
      if (songIds.length > 0) dispatch(removeCachedSongIds(songIds));
    };

    ipcRenderer.on('cache-files-evicted', onCacheFilesEvicted);
    return () => {
      ipcRenderer.removeListener('cache-files-evicted', onCacheFilesEvicted);
    };
  }, [enabled, dispatch]);
};

export default useCachedSongsIndex;
