// Populates the downloaded-songs index (ADR Section 8) once at startup by
// reading the persistent manifest (shared/downloadManifest.ts) via the async
// `recovery` bridge -- never a per-song IPC check (Lesson #1). Mounted once at
// the App root, next to useCachedSongsIndex, mirroring its "no visible UI,
// runs for the app's lifetime" shape.
import { useEffect } from 'react';
import { useAppDispatch } from '../redux/hooks';
import { setDownloadedSongIds } from '../redux/downloadedSongsSlice';
import { recovery, settings } from '../components/shared/bridge';
import { getDownloadManifestPath, readManifest } from '../shared/downloadManifest';
import { setDownloadedPathIndex } from '../shared/downloadedPathIndex';

const useDownloadedSongsIndex = (enabled: boolean = true): void => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!enabled) return;

    // No server configured yet (pre-login) -- getDownloadManifestPath() depends
    // on serverBase64, so reading before login would target a bogus path.
    if (!settings.get('server') || !settings.get('serverBase64')) return;

    readManifest(getDownloadManifestPath(), recovery.read)
      .then((manifest) => {
        const pathsBySongId: Record<string, string> = {};
        Object.entries(manifest).forEach(([songId, entry]) => {
          pathsBySongId[songId] = entry.path;
        });
        setDownloadedPathIndex(pathsBySongId);
        dispatch(setDownloadedSongIds(Object.keys(manifest)));
        return undefined;
      })
      .catch(() => {
        // No manifest yet / read failed -- fail safe as "nothing downloaded".
        setDownloadedPathIndex({});
        dispatch(setDownloadedSongIds([]));
      });
  }, [enabled, dispatch]);
};

export default useDownloadedSongsIndex;
