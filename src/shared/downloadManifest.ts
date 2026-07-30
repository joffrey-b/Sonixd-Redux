// ADR Section 8.2/8.3, Lesson #10: the persistent songId -> file path manifest
// is the source of truth for downloads (unlike Phase 3's opportunistic-cache
// index, whose opaque `{songId}.{ext}` filenames make a directory listing
// alone sufficient -- this feature's sanitized `{Artist}/{Album}/NN - Title.ext`
// names are not derivable back to a song id from the path alone).
//
// Storage primitive: the `recovery` bridge (async invoke, already validated by
// main.dev.mjs against getCacheBaseDir() -- zero new main-process surface
// needed for the manifest itself). Deliberately NOT a new `library-cache`
// electron-store key: that store's bridge (bridge:library-cache:get/set) is
// synchronous (sendSync), and this manifest is written once per song during a
// potentially large batch download -- reusing it would reintroduce the exact
// hot-path blocking-IPC problem Lesson #1 warns about. `recovery` is already
// async and already the project's established "reusable storage primitive."
//
// Read/write functions are dependency-injected (mirrors offlineActionQueue.ts
// and resolveSongPlaybackSource.ts) so this module stays testable without the
// real bridge.
import { getRootCachePath, joinPath } from './utils';
import { createAsyncLock } from './asyncLock';

export interface DownloadManifestEntry {
  path: string; // absolute file path under the current download root
  artist: string; // sanitized folder segment actually used on disk
  album: string; // sanitized folder segment actually used on disk
  albumId?: string;
  title: string;
  ext: string;
  size: number; // bytes, captured at download time -- source of the overview screen's total
}

export type DownloadManifest = Record<string, DownloadManifestEntry>;

export type ReadManifestFn = (path: string) => Promise<string | null>;
export type WriteManifestFn = (path: string, data: string) => Promise<void>;

// Per-server nested (unlike Phase 1's offline-action-queue, which is
// deliberately global) -- download entries are only meaningful within one
// server's song-id namespace, matching getSongCachePath()/getRecoveryPath()'s
// existing per-server convention.
export const getDownloadManifestPath = (): string =>
  joinPath(getRootCachePath(), 'download-manifest.json');

const parseManifest = (raw: string | null): DownloadManifest => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as DownloadManifest)
      : {};
  } catch {
    return {};
  }
};

export const readManifest = async (
  manifestPath: string,
  readFn: ReadManifestFn
): Promise<DownloadManifest> => parseManifest(await readFn(manifestPath));

export const writeManifest = async (
  manifestPath: string,
  manifest: DownloadManifest,
  writeFn: WriteManifestFn
): Promise<void> => {
  await writeFn(manifestPath, JSON.stringify(manifest));
};

// Read-modify-write lock, sharing offlineActionQueue.ts's withQueueLock
// implementation (its own, independent instance -- a manifest mutation never
// contends with a queue mutation) -- concurrent per-song writes during a
// batch download (or a deletion racing a download) would otherwise clobber
// each other.
const withManifestLock = createAsyncLock();

export const addManifestEntry = (
  songId: string,
  entry: DownloadManifestEntry,
  manifestPath: string,
  readFn: ReadManifestFn,
  writeFn: WriteManifestFn
): Promise<void> =>
  withManifestLock(async () => {
    const manifest = await readManifest(manifestPath, readFn);
    manifest[songId] = entry;
    await writeManifest(manifestPath, manifest, writeFn);
  });

export const removeManifestEntries = (
  songIds: string[],
  manifestPath: string,
  readFn: ReadManifestFn,
  writeFn: WriteManifestFn
): Promise<void> =>
  withManifestLock(async () => {
    if (songIds.length === 0) return;
    const manifest = await readManifest(manifestPath, readFn);
    let changed = false;
    songIds.forEach((id) => {
      if (manifest[id]) {
        delete manifest[id];
        changed = true;
      }
    });
    if (changed) await writeManifest(manifestPath, manifest, writeFn);
  });
