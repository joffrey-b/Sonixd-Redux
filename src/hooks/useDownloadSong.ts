// ADR Section 8: the React-facing wrapper around shared/downloadSong.ts's
// pure mechanism -- adds Redux dispatch (the downloaded-songs index) and
// apiController (the per-server getDownloadUrl endpoint) on top. Used
// directly by Fix 4's right-click single-song trigger, and as the per-song
// unit Fix 5's bulk Album/Artist/Playlist fan-out calls repeatedly.
import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { apiController } from '../api/controller';
import { recovery, downloadDir } from '../components/shared/bridge';
import { joinPath } from '../shared/baseCachePath';
import { getCachedDownloadPath } from '../shared/downloadPath';
import {
  getDownloadManifestPath,
  readManifest,
  addManifestEntry,
  removeManifestEntries,
  DownloadManifest,
} from '../shared/downloadManifest';
import {
  resolveAlbumFolder,
  downloadSongFile,
  downloadAlbumArt,
  cleanupEmptyAlbumFolders,
} from '../shared/downloadSong';
import { setDownloadedPathEntry, removeDownloadedPathEntries } from '../shared/downloadedPathIndex';
import { addDownloadedSongId, removeDownloadedSongIds } from '../redux/downloadedSongsSlice';
import { Song } from '../types';

export interface DownloadableSongInput extends Pick<
  Song,
  'id' | 'title' | 'suffix' | 'track' | 'album' | 'albumId' | 'albumArtist'
> {
  image?: string;
}

const useDownloadSong = () => {
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);

  // Resolves (and caches for this call only) the manifest + destination
  // folder for a song -- shared by downloadSong/removeDownloadedSong below.
  const resolveDestDir = useCallback(
    async (
      song: DownloadableSongInput,
      manifest: DownloadManifest
    ): Promise<{ destDir: string; artistSegment: string; albumSegment: string } | undefined> => {
      const downloadRoot = getCachedDownloadPath();
      if (!downloadRoot) return undefined;

      const { artistSegment, albumSegment } = await resolveAlbumFolder(
        downloadRoot,
        song.albumArtist,
        song.album,
        song.albumId,
        manifest,
        downloadDir.exists
      );
      return {
        destDir: joinPath(downloadRoot, artistSegment, albumSegment),
        artistSegment,
        albumSegment,
      };
    },
    []
  );

  const downloadSong = useCallback(
    async (
      song: DownloadableSongInput,
      options?: {
        skipAlbumArt?: boolean;
        // Audit fix: lets a bulk caller (useBulkDownload.ts) pass in a
        // folder already resolved once for this song's whole album, instead
        // of every song independently re-reading the manifest and
        // re-running collision detection. Beyond the redundant IPC/parse
        // work, independent per-song resolution let two different albums
        // that sanitize to the same folder name race on the same
        // not-yet-created directory within one CONCURRENCY=5 chunk and get
        // silently merged -- and let a song's own destDir disagree with
        // where its album's art was actually fetched to. Falls back to
        // resolving fresh when not provided (the single-song right-click
        // trigger, Fix 4, has no such batch context).
        resolved?: { destDir: string; artistSegment: string; albumSegment: string };
      }
    ): Promise<boolean> => {
      const manifestPath = getDownloadManifestPath();

      let resolved = options?.resolved;
      if (!resolved) {
        const manifest = await readManifest(manifestPath, recovery.read);
        resolved = await resolveDestDir(song, manifest);
      }
      if (!resolved) return false;
      const { destDir, artistSegment, albumSegment } = resolved;

      const result = await downloadSongFile(song, destDir, () =>
        apiController({
          serverType: config.serverType,
          endpoint: 'getDownloadUrl',
          args: { id: song.id },
        })
      );

      if (!result.success || !result.path) return false;

      // Fix 5's bulk fan-out fetches art once per album upfront (via
      // downloadAlbumArtForAlbums) and passes skipAlbumArt here to avoid
      // every song in the same album racing its own idempotent-but-networked
      // fetch attempt. The single-song trigger (Fix 4) has no such batch
      // context, so it fetches its own song's album art directly -- trivially
      // "once per album" already, since there's only one song.
      //
      // Awaited (not fire-and-forget) for the same reason as
      // useBulkDownload.ts's identical fix: leaving this unawaited let the
      // function return (and the caller consider the download "done") while
      // the art fetch was still in flight, so a "Remove from offline" run
      // moments later could delete the just-created folder before this
      // fetch's own ensureDir+commit landed, resurrecting it with an
      // orphaned cover.jpg and causing the next re-download to see a false
      // collision and create a "(2)"-suffixed folder.
      if (!options?.skipAlbumArt) {
        await downloadAlbumArt(destDir, song.image).catch(() => {});
      }

      await addManifestEntry(
        song.id,
        {
          path: result.path,
          artist: artistSegment,
          album: albumSegment,
          albumId: song.albumId,
          title: song.title,
          ext: song.suffix || 'mp3',
          size: result.size ?? 0,
        },
        manifestPath,
        recovery.read,
        recovery.write
      );

      setDownloadedPathEntry(song.id, result.path);
      dispatch(addDownloadedSongId(song.id));
      return true;
    },
    [config.serverType, dispatch, resolveDestDir]
  );

  // Removes the downloaded file + in-memory index updates for one song, given
  // an already-known file path -- deliberately does NOT touch the persistent
  // manifest, and deliberately does NOT run folder cleanup (see
  // removeDownloadedFileForEntry below for why that's a separate step).
  // Exposed so a bulk caller (useBulkDownload.ts) can fan this out per-item
  // (CONCURRENCY-chunked, per-item isolated).
  const removeDownloadedFileOnly = useCallback(
    async (songId: string, entryPath: string | undefined): Promise<void> => {
      if (entryPath) {
        await downloadDir.removeFile(entryPath);
      }
      removeDownloadedPathEntries([songId]);
      dispatch(removeDownloadedSongIds([songId]));
    },
    [dispatch]
  );

  // Removes the file + empty-folder cleanup + in-memory index updates for one
  // song -- the single-song (right-click) delete path, where there's exactly
  // one file being removed from its album folder, so cleanup can safely run
  // right after the removal.
  //
  // Audit fix: useBulkDownload.ts's bulk delete used to call this same
  // function per-song, CONCURRENCY-chunked -- when N songs from the SAME
  // album folder were removed in the same batch, each song's own
  // cleanupEmptyAlbumFolders call raced the others' removeFile calls
  // (listEntries could see sibling files not-yet-removed, or cover.jpg
  // not-yet-removed, at unpredictable points), and there was no guarantee
  // any single call ever observed the folder in its final, truly-empty
  // state -- a live e2e run caught this directly (a 3-song album's Artist
  // folder was left behind after "Remove from offline" removed all 3).
  // useBulkDownload.ts now calls removeDownloadedFileOnly per-item instead,
  // and runs cleanupEmptyAlbumFolders exactly once per distinct album folder
  // after every removal in the whole batch has settled.
  const removeDownloadedFileForEntry = useCallback(
    async (songId: string, entryPath: string | undefined): Promise<void> => {
      await removeDownloadedFileOnly(songId, entryPath);
      if (entryPath) {
        await cleanupEmptyAlbumFolders(entryPath);
      }
    },
    [removeDownloadedFileOnly]
  );

  const removeDownloadedSong = useCallback(
    async (songId: string): Promise<void> => {
      const manifestPath = getDownloadManifestPath();
      const manifest = await readManifest(manifestPath, recovery.read);
      await removeDownloadedFileForEntry(songId, manifest[songId]?.path);
      await removeManifestEntries([songId], manifestPath, recovery.read, recovery.write);
    },
    [removeDownloadedFileForEntry]
  );

  // Exposed for Fix 5's bulk fan-out, which needs to group songs by resolved
  // album folder upfront (to fetch art once per album, not once per song),
  // to batch its manifest removal into one call, and (removeDownloadedFileOnly)
  // to defer folder cleanup until every removal in the batch has settled.
  return {
    downloadSong,
    removeDownloadedSong,
    removeDownloadedFileForEntry,
    removeDownloadedFileOnly,
    resolveDestDir,
  };
};

export default useDownloadSong;
