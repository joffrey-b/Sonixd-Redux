import { isCachedLocally } from '../redux/cachedSongsSlice';
import { isSongDownloaded } from '../redux/downloadedSongsSlice';

// Phase 4: real lookup against the downloads index (ADR Section 8). Signature
// grew a second parameter (mirrors isCachedLocally's shape) to accept the
// downloaded-songs Set -- this is the only change made to this file's
// interface; the combination/precedence logic below is untouched.
export const isDownloaded = (songId: string, downloadedSongIds: ReadonlySet<string>): boolean =>
  isSongDownloaded(songId, downloadedSongIds);

// ADR Section 5.3: the single shared "can this song actually be played right
// now without a network round-trip" check, used by both the offline-status
// column and the skip-unavailable-songs queue filter -- not reimplemented in
// either place.
export const isAvailableOffline = (
  songId: string,
  cachedSongIds: ReadonlySet<string>,
  downloadedSongIds: ReadonlySet<string>
): boolean => isCachedLocally(songId, cachedSongIds) || isDownloaded(songId, downloadedSongIds);

export type OfflineStatusIconState = 'none' | 'cached' | 'downloaded';

// ADR Section 6: downloaded takes precedence over cached when a song happens
// to be both -- the stronger guarantee is the only one shown. Directories
// never show an icon (this column is track-row only).
export const getOfflineStatusIconState = (
  songId: string,
  isDir: boolean | undefined,
  cachedSongIds: ReadonlySet<string>,
  downloadedSongIds: ReadonlySet<string>
): OfflineStatusIconState => {
  if (isDir) return 'none';
  if (isDownloaded(songId, downloadedSongIds)) return 'downloaded';
  if (isCachedLocally(songId, cachedSongIds)) return 'cached';
  return 'none';
};
