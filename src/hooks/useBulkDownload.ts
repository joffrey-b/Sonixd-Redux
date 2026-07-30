// ADR Section 8.4: the Album/Artist/Playlist Download/Delete buttons' bulk
// fan-out (Fix 5), reused by Fix 7's overview screen "clear all downloads".
// CONCURRENCY = 5 + per-item error isolation, matching the established
// precedent (api.ts's getArtistSongs, offlineQueueFlush.ts's
// FLUSH_CONCURRENCY, usePlaylistsCache.ts's Fix J) -- one song/deletion
// failing must never abort the rest of the batch.
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { notifyToast } from '../components/shared/toast';
import { recovery } from '../components/shared/bridge';
import { isDownloadFolderConfigured } from '../shared/downloadPath';
import {
  getDownloadManifestPath,
  readManifest,
  removeManifestEntries,
} from '../shared/downloadManifest';
import { downloadAlbumArtForAlbums, cleanupEmptyAlbumFolders } from '../shared/downloadSong';
import { mapWithConcurrency } from '../shared/mapWithConcurrency';
import {
  startDownloadBatch,
  incrementDownloadProgress,
  finishDownloadBatch,
  selectDownloadProgress,
} from '../redux/downloadProgressSlice';
import useDownloadSong, { DownloadableSongInput } from './useDownloadSong';

const CONCURRENCY = 5;

export interface BulkResult {
  succeeded: number;
  failed: number;
}

const useBulkDownload = () => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { downloadSong, removeDownloadedFileOnly, resolveDestDir } = useDownloadSong();

  // Audit fix (finding 1.3): tracks the CURRENT downloadProgress.inProgress
  // value via a ref, not a value captured directly in downloadSongs'/
  // removeDownloadedSongs' own useCallback closures -- mirrors
  // useConnectivityMonitor.ts's established pingConfirmedUnreachableRef
  // pattern for the identical problem (an async function needs the value as
  // of the moment it actually runs, not as of whatever render created its
  // closure). Deliberately reads through useAppSelector (React-Redux's own
  // subscription, already safe in every existing test's plain
  // configureStore + <Provider> setup) rather than importing redux/store.ts's
  // real store directly, which would eagerly evaluate its
  // electron-redux stateSyncEnhancer() (needs a real __ElectronReduxBridge
  // global) for every test that transitively imports this widely-used hook.
  const downloadProgress = useAppSelector(selectDownloadProgress);
  const downloadProgressRef = useRef(downloadProgress);
  useEffect(() => {
    downloadProgressRef.current = downloadProgress;
  }, [downloadProgress]);

  const downloadSongs = useCallback(
    async (songs: DownloadableSongInput[]): Promise<BulkResult> => {
      if (songs.length === 0) return { succeeded: 0, failed: 0 };

      // Audit fix (finding 1.3): the UI already disables the Download/Remove
      // buttons while downloadProgress.inProgress is true (see AlbumView.tsx/
      // ArtistView.tsx/PlaylistView.tsx), but that alone doesn't stop a
      // right-click multi-select trigger, a second window, or any other
      // caller that doesn't go through those specific buttons. This is a
      // defense-in-depth backend guard: a second bulk operation started while
      // one is already running would otherwise both write into the same
      // single global downloadProgress state (dispatch(startDownloadBatch(..))
      // resetting completed/total out from under the other's still-firing
      // increments), and could race each other's manifest/index writes for
      // overlapping songs.
      if (downloadProgressRef.current.inProgress) {
        notifyToast(
          'warning',
          t('A download or delete is already in progress. Please wait for it to finish.')
        );
        return { succeeded: 0, failed: songs.length };
      }

      if (!isDownloadFolderConfigured()) {
        notifyToast('warning', t('Set a download folder in Settings before downloading.'));
        return { succeeded: 0, failed: songs.length };
      }

      // Resolve each DISTINCT album's destination folder exactly once, up
      // front, from one shared manifest snapshot -- grouped by albumId (or a
      // fallback artist+album key for albumId-less songs) and resolved
      // SEQUENTIALLY across groups, not concurrently.
      //
      // Audit fix: the original version resolved every SONG's folder
      // independently and concurrently. Two different albums that sanitize
      // to the same folder name (a real, if narrow, case -- e.g. two
      // "Greatest Hits" albums by the same artist) could both see "no
      // collision yet" and race into the same not-yet-created directory,
      // silently merging their songs. Resolving once per unique album group,
      // sequentially, means every pathExists() check sees a fully-settled
      // view of what earlier groups in this same batch already decided.
      // This also means every song's folder is resolved exactly once (not
      // once here and again inside downloadSong), and guarantees a song's
      // own destDir always matches where its album's art was fetched to.
      const manifestPath = getDownloadManifestPath();
      const manifest = await readManifest(manifestPath, recovery.read);

      const albumGroupKey = (song: DownloadableSongInput): string =>
        song.albumId || `${song.albumArtist ?? ''}::${song.album ?? ''}`;

      const resolvedByGroupKey = new Map<
        string,
        { destDir: string; artistSegment: string; albumSegment: string } | undefined
      >();
      const coverArtByGroupKey = new Map<string, string | undefined>();

      for (const song of songs) {
        const key = albumGroupKey(song);
        if (!resolvedByGroupKey.has(key)) {
          // Per-item isolation (Lesson #4): one album's resolution failing
          // (e.g. a transient IPC error from the pathExists check) must not
          // abort resolution for the rest of the batch -- every song in that
          // one group is simply treated as unresolved, and downloadSong will
          // itself fail gracefully (falling back to its own resolution
          // attempt) for each of them in the fan-out below.
          try {
            resolvedByGroupKey.set(key, await resolveDestDir(song, manifest));
          } catch {
            resolvedByGroupKey.set(key, undefined);
          }
          coverArtByGroupKey.set(key, song.image);
        }
      }

      const albumArtTargets = Array.from(resolvedByGroupKey.entries())
        .map(([key, resolved]) =>
          resolved ? { destDir: resolved.destDir, coverArtUrl: coverArtByGroupKey.get(key) } : null
        )
        .filter(
          (target): target is { destDir: string; coverArtUrl: string | undefined } =>
            target !== null
        );
      // Started here (concurrently with the song downloads below, not
      // serialized before them), but awaited after the song loop rather than
      // left fire-and-forget -- a live bug report traced back to exactly
      // this: if the batch was considered "finished" (buttons re-enabled)
      // while this was still in flight, a "Remove from offline"/"Clear all
      // downloads" run moments later could clean up and remove the album
      // folder before this fetch's own `downloadDir.ensureDir` + write
      // landed, resurrecting the just-deleted folder with an orphaned
      // cover.jpg left behind -- which then made the next re-download of
      // that same album see a false collision and create a "(2)"-suffixed
      // folder instead of reusing the original.
      const albumArtPromise = downloadAlbumArtForAlbums(albumArtTargets).catch(() => {});

      dispatch(startDownloadBatch(songs.length));

      const outcomes = await mapWithConcurrency(songs, CONCURRENCY, async (song) => {
        try {
          return await downloadSong(song, {
            skipAlbumArt: true,
            resolved: resolvedByGroupKey.get(albumGroupKey(song)),
          });
        } catch {
          return false;
        } finally {
          dispatch(incrementDownloadProgress());
        }
      });

      await albumArtPromise;

      dispatch(finishDownloadBatch());

      const succeeded = outcomes.filter(Boolean).length;
      const failed = outcomes.length - succeeded;

      if (failed > 0) {
        notifyToast(
          'warning',
          t('{{failed}} of {{total}} songs could not be downloaded.', {
            failed,
            total: songs.length,
          })
        );
      }

      return { succeeded, failed };
    },
    [dispatch, downloadSong, resolveDestDir, t]
  );

  const removeDownloadedSongs = useCallback(
    async (songIds: string[]): Promise<BulkResult> => {
      if (songIds.length === 0) return { succeeded: 0, failed: 0 };

      // Audit fix (finding 1.3): see the identical guard in downloadSongs
      // above -- the same single global downloadProgress state is shared by
      // both bulk operations, so a delete started while a download is still
      // running (or vice versa) is exactly as unsafe as two downloads
      // overlapping.
      if (downloadProgressRef.current.inProgress) {
        notifyToast(
          'warning',
          t('A download or delete is already in progress. Please wait for it to finish.')
        );
        return { succeeded: 0, failed: songIds.length };
      }

      // Audit fix: the file-removal/cleanup work per song is genuinely
      // parallelizable (CONCURRENCY-chunked below), but the persistent
      // manifest's single serializing lock (downloadManifest.ts's
      // withManifestLock) made calling removeDownloadedSong once per song
      // fully sequential anyway -- N songs meant N lock-serialized
      // read-modify-write IPC round trips. Reading the manifest once up
      // front and removing every succeeded id in ONE batched call at the end
      // (removeManifestEntries already accepts an array) turns that into a
      // single read + a single write for the whole batch.
      const manifestPath = getDownloadManifestPath();
      const manifest = await readManifest(manifestPath, recovery.read);

      // Audit fix (caught by a live e2e run): calling removeDownloadedFileForEntry
      // (file removal + folder cleanup together) per song, CONCURRENCY-chunked,
      // meant every song sharing an album folder ran its OWN cleanupEmptyAlbumFolders
      // check concurrently with its siblings' removeFile calls -- a real race
      // where no single call was guaranteed to observe the folder in its final,
      // truly-empty state (a 3-song album's Artist folder was left behind after
      // "Remove from offline" removed all 3). Cleanup now runs exactly once per
      // distinct album folder, only after every file removal in the whole batch
      // has settled -- mirrors downloadAlbumArtForAlbums' dedup-by-destDir pattern.
      const albumDirToRepresentativePath = new Map<string, string>();

      const outcomes = await mapWithConcurrency(songIds, CONCURRENCY, async (songId) => {
        try {
          const entryPath = manifest[songId]?.path;
          await removeDownloadedFileOnly(songId, entryPath);
          if (entryPath) {
            const albumDir = entryPath.split('/').slice(0, -1).join('/');
            if (!albumDirToRepresentativePath.has(albumDir)) {
              albumDirToRepresentativePath.set(albumDir, entryPath);
            }
          }
          return true;
        } catch {
          return false;
        }
      });
      const succeededIds = songIds.filter((_songId, idx) => outcomes[idx]);

      await mapWithConcurrency(
        Array.from(albumDirToRepresentativePath.values()),
        CONCURRENCY,
        (entryPath) => cleanupEmptyAlbumFolders(entryPath).catch(() => {})
      );

      if (succeededIds.length > 0) {
        await removeManifestEntries(succeededIds, manifestPath, recovery.read, recovery.write);
      }

      const succeeded = outcomes.filter(Boolean).length;
      const failed = outcomes.length - succeeded;

      if (failed > 0) {
        notifyToast(
          'warning',
          t('{{failed}} of {{total}} downloads could not be removed.', {
            failed,
            total: songIds.length,
          })
        );
      }

      return { succeeded, failed };
    },
    [removeDownloadedFileOnly, t]
  );

  return { downloadSongs, removeDownloadedSongs };
};

export default useBulkDownload;
