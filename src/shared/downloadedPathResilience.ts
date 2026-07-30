// ADR Section 8.5: resilience for the downloads index. Unlike the
// opportunistic cache (opaque filenames nobody would think to touch by
// hand), downloaded files are real, user-visible files a user might delete
// manually outside the app -- the index/manifest cannot blindly trust its
// own records forever. Verifies file existence at the moment a downloaded
// path is actually needed for playback, and self-corrects (removes the
// stale entry from the in-memory path index, the Redux index, and the
// persistent manifest) rather than erroring or silently continuing to claim
// availability.
//
// This turns resolveSongPlaybackSource's downloaded-path check from a
// synchronous in-memory lookup (Fix 1) into an async existence-checked one --
// not a new category of hot-path cost, since the cache tier it sits
// alongside already does the same kind of IPC-based existence check on every
// single resolution (cacheExists).
import { downloadDir, recovery } from '../components/shared/bridge';
import { getDownloadedPath, removeDownloadedPathEntries } from './downloadedPathIndex';
import { removeDownloadedSongIds } from '../redux/downloadedSongsSlice';

// Loosely typed rather than importing AppDispatch from redux/store.ts --
// that would eagerly evaluate the whole store (electron-redux's
// stateSyncEnhancer()) for every module that transitively imports this one,
// mirroring the same concern offlineQueueFlush.ts's loadDefaultDispatch
// already documents for the exact same reason.
export type GenericDispatch = (action: { type: string; payload?: unknown }) => void;

// This module is imported by Player.tsx/MpvPlayer.tsx, neither of which
// previously imported shared/utils.ts (confirmed by grep) -- downloadManifest.ts
// (needed only for the rare self-correction branch below) eagerly imports
// utils.ts for getRootCachePath, which eagerly runs i18n.js at module scope
// (the same transitive-i18n trap Phase 1's Fix 9 and Phase 2's
// applyMutationSuccess.ts already hit once each). Deferred via a dynamic
// import, exactly like offlineQueueFlush.ts's own applyMutationSuccess
// import, so the common "file still exists" path -- every single playback
// resolution -- never reaches it; only an actual stale-entry correction does.
// bridge.ts itself carries no such risk (confirmed i18n-free), so `recovery`
// stays a plain static import above.
export const resolveDownloadedPathWithResilience = async (
  songId: string,
  dispatch: GenericDispatch
): Promise<string | undefined> => {
  const path = getDownloadedPath(songId);
  if (!path) return undefined;

  // Audit fix: downloadDir.exists now rejects (rather than silently resolving
  // false) when the path falls outside the *current* download root -- a real
  // case here, not just a defensive worst-case, since a manifest entry's path
  // was captured under whatever folder was configured at download time, and
  // nothing migrates those entries if the user later changes or clears the
  // setting. Treated identically to "file doesn't exist": this function's own
  // job is exactly to self-correct rather than trust a stale record, and a
  // download root that moved out from under an entry is just as much a reason
  // to no longer claim availability as the file itself being gone.
  let stillExists: boolean;
  try {
    stillExists = await downloadDir.exists(path);
  } catch {
    stillExists = false;
  }
  if (stillExists) return path;

  removeDownloadedPathEntries([songId]);
  dispatch(removeDownloadedSongIds([songId]));
  import('./downloadManifest')
    .then(({ getDownloadManifestPath, removeManifestEntries }) =>
      removeManifestEntries([songId], getDownloadManifestPath(), recovery.read, recovery.write)
    )
    .catch(() => {});
  return undefined;
};
