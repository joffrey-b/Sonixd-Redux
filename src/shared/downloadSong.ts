// ADR Section 8.3: the actual download-and-write mechanism. Reuses
// cacheSong.ts's fetch-and-commit shape (renderer fetch() -> bridge commit,
// temp-path-then-atomic-rename) with a new destination (the user's download
// root, not the cache dir) -- the renderer's own downloadFile() below is a
// deliberate duplicate of cacheSong.ts's/cacheImage.ts's identical private
// helper, matching this project's own established precedent of not sharing
// that specific one across modules (both of those already independently
// duplicate it).
//
// URL source: apiController's 'getDownloadUrl' endpoint (already correct,
// already shipped, per-server-specific), NOT cacheSong.ts's call sites'
// `streamUrl.replace('stream', 'download')` trick -- that trick is a no-op
// under Jellyfin transcode mode (the transcoded streamUrl contains no
// "stream" substring) and produces the wrong path shape for Jellyfin even
// when it does match (`/audio/{id}/download` vs. the real
// `/items/{id}/download`). Confirmed by reading both cacheSong.ts's call
// sites and jellyfinApi.ts's getDownloadUrl directly (BEFORE YOU START).
//
// Every write below goes through the bridge's downloadDir.* methods, each of
// which is validated main-process-side via assertUnderDir against
// getDownloadBaseDir() (read fresh from trusted settings storage) -- this
// module never re-implements that check itself, matching the existing
// cache/recovery bridges' trust boundary exactly.
import { downloadDir } from '../components/shared/bridge';
import { joinPath } from './baseCachePath';
import {
  sanitizeArtistSegment,
  sanitizeAlbumSegment,
  buildDownloadFileName,
  withDisambiguatingSuffix,
} from './sanitizeDownloadPath';
import { mapWithConcurrency } from './mapWithConcurrency';
import type { DownloadManifest } from './downloadManifest';

const CONCURRENCY = 5;

const downloadFile = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.arrayBuffer();
};

interface ResolvedAlbumFolder {
  artistSegment: string;
  albumSegment: string;
}

// Determines the actual Artist/Album folder to use for a song's album.
// Reuses whatever folder this exact albumId has already been downloaded into
// (Download is additive/"fill in the remainder" -- must target the same
// folder consistently even if it originally got a disambiguating suffix).
// Only appends a suffix when a genuine collision is actually detected: an
// existing folder at the clean sanitized path that isn't already this same
// albumId's folder (ADR 8.2 -- never a hidden suffix always present).
export const resolveAlbumFolder = async (
  downloadRoot: string,
  albumArtist: string | undefined,
  album: string | undefined,
  albumId: string | undefined,
  manifest: DownloadManifest,
  pathExists: (path: string) => Promise<boolean>
): Promise<ResolvedAlbumFolder> => {
  const artistSegment = sanitizeArtistSegment(albumArtist);
  const baseAlbumSegment = sanitizeAlbumSegment(album);

  // Audit fix: a song with no albumId (a loose/single track server-side)
  // used to skip reuse-matching entirely, so every subsequent download
  // attempt for the exact same song/bucket -- including a plain re-run of
  // Download to fill in a remainder -- found its own previously-created
  // folder via the pathExists check below and misdetected it as a genuine
  // collision, since nothing had been checked yet to rule that out. Falls
  // back to matching by the sanitized (artist, album) pair among other
  // albumId-less entries, so repeated downloads into the same "unknown
  // album" bucket reuse the same folder instead of each spawning a new
  // disambiguated one.
  const existingEntry = albumId
    ? Object.values(manifest).find((entry) => entry.albumId === albumId)
    : Object.values(manifest).find(
        (entry) =>
          !entry.albumId && entry.artist === artistSegment && entry.album === baseAlbumSegment
      );
  if (existingEntry) {
    return { artistSegment: existingEntry.artist, albumSegment: existingEntry.album };
  }

  const baseAlbumDir = joinPath(downloadRoot, artistSegment, baseAlbumSegment);
  if (!(await pathExists(baseAlbumDir))) {
    return { artistSegment, albumSegment: baseAlbumSegment };
  }

  // A folder with this exact sanitized name already exists, and this is the
  // first entry for this albumId (checked above) -- since this feature is the
  // only thing that creates these folders, this is a genuine collision (two
  // different albums sanitizing to the same name, or a foreign/manually
  // created folder). Find the next free disambiguated name.
  let attempt = 2;
  let candidate = withDisambiguatingSuffix(baseAlbumSegment, attempt);
  while (attempt < 1000 && (await pathExists(joinPath(downloadRoot, artistSegment, candidate)))) {
    attempt += 1;
    candidate = withDisambiguatingSuffix(baseAlbumSegment, attempt);
  }
  return { artistSegment, albumSegment: candidate };
};

interface DownloadableSong {
  id: string;
  title: string;
  suffix?: string;
  track?: number;
}

interface DownloadSongFileResult {
  success: boolean;
  path?: string;
  size?: number;
}

// The per-song fetch-and-commit. destDir is the already-resolved, sanitized
// Artist/Album directory (absolute path under the download root). getUrl is
// injected so this module never itself decides how to build the download
// URL (Subsonic vs. Jellyfin, legacy auth, etc. -- the caller's concern via
// apiController's existing 'getDownloadUrl' endpoint).
export const downloadSongFile = async (
  song: DownloadableSong,
  destDir: string,
  getUrl: () => Promise<string>
): Promise<DownloadSongFileResult> => {
  const fileName = buildDownloadFileName(song.track, song.title, song.suffix);
  const finalPath = joinPath(destDir, fileName);
  const tempPath = joinPath(destDir, `TEMP_${fileName}`);

  await downloadDir.ensureDir(destDir);
  await downloadDir.removeIfExists(tempPath);

  if (await downloadDir.exists(finalPath)) {
    // Already downloaded -- e.g. re-running Download to fill in the rest of
    // a partially-downloaded album. Additive, never re-fetched.
    return { success: true, path: finalPath };
  }

  try {
    const url = await getUrl();
    const buffer = await downloadFile(url);
    await downloadDir.commit(tempPath, finalPath, buffer);
    return { success: true, path: finalPath, size: buffer.byteLength };
  } catch {
    await downloadDir.removeIfExists(tempPath);
    return { success: false };
  }
};

// Force-fetches album art once, into the album's own download folder.
// Idempotent (checks existence first), but callers must still dedupe by
// destDir themselves (see downloadAlbumArtForAlbums) rather than relying on
// this alone -- concurrent calls for the same album would otherwise still
// each attempt the network fetch before either one's exists-check would see
// the other's result.
// The entire body is wrapped in try/catch (including ensureDir/exists, not
// just the fetch) so this can never reject -- downloadAlbumArtForAlbums'
// fan-out below relies on that to isolate one album's failure (a permissions
// error, a mid-batch IPC hiccup) from the others, matching this phase's
// established per-item isolation pattern (Lesson #4) everywhere else.
export const downloadAlbumArt = async (
  destDir: string,
  coverArtUrl: string | undefined
): Promise<void> => {
  if (!coverArtUrl || coverArtUrl.includes('placeholder')) return;

  const finalPath = joinPath(destDir, 'cover.jpg');
  const tempPath = joinPath(destDir, 'TEMP_cover.jpg');

  try {
    await downloadDir.ensureDir(destDir);
    if (await downloadDir.exists(finalPath)) return;
    const buffer = await downloadFile(coverArtUrl);
    await downloadDir.commit(tempPath, finalPath, buffer);
  } catch {
    await downloadDir.removeIfExists(tempPath).catch(() => {});
  }
};

// Fetches album art once per distinct album folder, not once per song in a
// batch (ADR Section 8.3) -- dedupes by destDir before fanning out. Per-item
// isolation (Lesson #4) is guaranteed by downloadAlbumArt itself never
// rejecting (see above), matching the same "catch inside each fan-out
// member" discipline used everywhere else in this phase, even though the
// isolation lives inside the leaf function here rather than the map callback.
// Audit fix (Section 5/3 findings): used to run every album's fetch via one
// unbounded Promise.all rather than the CONCURRENCY=5 convention used
// everywhere else in this phase -- harmless with isolation intact, but
// inconsistent, and would fire unbounded concurrent IPC/network calls for a
// batch spanning many albums (e.g. a large artist download).
export const downloadAlbumArtForAlbums = async (
  albums: { destDir: string; coverArtUrl: string | undefined }[]
): Promise<void> => {
  const seen = new Set<string>();
  const uniqueAlbums = albums.filter((album) => {
    if (seen.has(album.destDir)) return false;
    seen.add(album.destDir);
    return true;
  });
  await mapWithConcurrency(uniqueAlbums, CONCURRENCY, (album) =>
    downloadAlbumArt(album.destDir, album.coverArtUrl)
  );
};

// ADR Section 8.5: after removing a song, delete the now-empty Album folder
// (and then the Artist folder, if that's now empty too) -- but only after a
// real readdir confirms it's genuinely empty (removeDirIfEmpty's own
// contract), never assumed. Walks up at most two levels, matching the folder
// depth this feature itself creates ({DownloadRoot}/{Artist}/{Album}/{file}).
//
// Audit fix: if this was the last SONG in the folder, the only thing left
// behind is often cover.jpg -- a file this feature itself wrote (Fix 2's
// once-per-album art fetch), never something a user placed there. Left in
// place, removeDirIfEmpty's honest readdir check would see it forever and
// the folder would never be recognized as empty, contradicting ADR 8.5's
// "delete the now-empty folder" requirement. Safe to remove unconditionally
// as part of this check specifically because it's the one file this feature
// is certain it authored -- anything else present still correctly blocks
// cleanup, matching "never force-delete if something unexpected is present."
export const cleanupEmptyAlbumFolders = async (songFilePath: string): Promise<void> => {
  const albumDir = songFilePath.split('/').slice(0, -1).join('/');
  const entries = await downloadDir.listEntries(albumDir);
  const remainingFiles = entries.filter((entry) => !entry.isDirectory);
  if (remainingFiles.length === 1 && remainingFiles[0].name === 'cover.jpg') {
    await downloadDir.removeIfExists(joinPath(albumDir, 'cover.jpg'));
  }

  const albumRemoved = await downloadDir.removeDirIfEmpty(albumDir);
  if (!albumRemoved) return;
  const artistDir = albumDir.split('/').slice(0, -1).join('/');
  await downloadDir.removeDirIfEmpty(artistDir);
};
