import { useCallback } from 'react';
import { useAppSelector } from '../redux/hooks';
import { settings, libraryCacheStore } from '../components/shared/bridge';
import { apiController } from '../api/controller';
import { mapWithConcurrency } from '../shared/mapWithConcurrency';
import { Playlist, Song } from '../types';

// Song ID references only -- never full song copies (ADR Section 5.2).
// Playlist contents are reconstructed by looking each id up against the
// existing song snapshot at render time, so they never go stale relative to
// it. `type`/`uniqueId` are regenerated at read time, same convention as
// LibraryCacheSong.
export interface PlaylistCacheEntry {
  id: string;
  title: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount?: number;
  duration: number;
  created?: string;
  changed?: string;
  image: string;
  songIds: string[];
}

interface PlaylistsSnapshot {
  playlists?: PlaylistCacheEntry[];
  lastSyncedAt?: string | null;
  serverUrl?: string | null;
}

const toPlaylistCacheEntry = (playlist: Playlist, songIds: string[]): PlaylistCacheEntry => ({
  id: playlist.id,
  title: playlist.title,
  comment: playlist.comment,
  owner: playlist.owner,
  public: playlist.public,
  songCount: playlist.songCount,
  duration: playlist.duration,
  created: playlist.created,
  changed: playlist.changed,
  image: playlist.image,
  songIds,
});

const getSnapshot = (): {
  playlists: PlaylistCacheEntry[];
  lastSyncedAt: string | null;
  serverUrl: string | null;
} => {
  const raw = (libraryCacheStore.get('playlistsSnapshot') as unknown as PlaylistsSnapshot) || {};
  return {
    playlists: raw.playlists || [],
    lastSyncedAt: raw.lastSyncedAt || null,
    serverUrl: raw.serverUrl || null,
  };
};

// Module-level (not per-hook-instance), mirroring useLibraryCache's
// syncInFlight -- so App.tsx's automatic launch-time sync and any future
// manual "sync now" trigger can't both run the N+1 fan-out simultaneously.
let syncInFlight: Promise<number> | null = null;

const usePlaylistsCache = () => {
  const config = useAppSelector((state) => state.config);

  const syncPlaylists = useCallback((): Promise<number> => {
    if (!syncInFlight) {
      syncInFlight = (async () => {
        try {
          const serverUrl = String(settings.get('server') || '');
          const playlists: Playlist[] = await apiController({
            serverType: config.serverType,
            endpoint: 'getPlaylists',
          });

          // Fix J: fetched in chunks of CONCURRENCY (matching api.ts's
          // getArtistSongs / offlineQueueFlush.ts's FLUSH_CONCURRENCY
          // precedent) instead of one playlist at a time. Per-item error
          // isolation (Lesson #2) is preserved by catching inside each
          // mapper call, not around the whole batch -- a rejection there
          // would abort every other in-flight fetch in the same chunk, not
          // just the one that failed. mapWithConcurrency's own result order
          // always matches `playlists`' order regardless of which fetch in a
          // chunk happens to resolve first, so the snapshot's playlist order
          // is stable without needing a separately pre-sized array.
          const slots = await mapWithConcurrency(
            playlists || [],
            5,
            async (playlist): Promise<PlaylistCacheEntry | null> => {
              try {
                const detail = await apiController({
                  serverType: config.serverType,
                  endpoint: 'getPlaylist',
                  args: { id: playlist.id },
                });
                const songIds = ((detail?.song || []) as Song[]).map((song) => song.id);
                return toPlaylistCacheEntry(playlist, songIds);
              } catch {
                // Skip this playlist for this sync pass; it's simply left out
                // of the snapshot (not retained stale) until a future sync
                // succeeds for it.
                return null;
              }
            }
          );

          const results = slots.filter((entry): entry is PlaylistCacheEntry => entry !== null);

          // Audit fix (finding 2.5): a transient server glitch can return a
          // *successful* (not a thrown/network-error) but anomalously empty
          // or truncated getPlaylists() response -- this used to be written
          // straight into the snapshot unconditionally, indistinguishable
          // from the user genuinely having deleted every playlist. Contrast
          // with hasPlaylistsCacheForCurrentServer's own established stance
          // (zero playlists is normally a perfectly legitimate synced
          // state) -- this check deliberately does NOT contradict that for
          // the general case, only for the specific, narrow transition of
          // "we previously had playlists, and this one pass came back with
          // none at all." Skips writing the snapshot for only that one
          // anomalous pass (silently retaining the last-known-good data)
          // rather than refusing empty results in general; a genuine
          // "deleted everything" sync succeeds normally the moment a
          // subsequent pass confirms it again is not this specific
          // zero-after-nonzero transition (e.g. it's already zero going in,
          // so there's nothing this guard would ever hold back).
          const previousSnapshot = getSnapshot();
          const suspiciousEmptyResult =
            previousSnapshot.playlists.length > 0 && results.length === 0;
          if (suspiciousEmptyResult) {
            return previousSnapshot.playlists.length;
          }

          libraryCacheStore.set('playlistsSnapshot', {
            playlists: results,
            lastSyncedAt: new Date().toISOString(),
            serverUrl,
          });

          return results.length;
        } finally {
          syncInFlight = null;
        }
      })();
    }
    return syncInFlight;
  }, [config.serverType]);

  const getCachedPlaylists = useCallback((): PlaylistCacheEntry[] => getSnapshot().playlists, []);

  const hasPlaylistsCacheForCurrentServer = useCallback((): boolean => {
    const { lastSyncedAt, serverUrl } = getSnapshot();
    const currentUrl = String(settings.get('server') || '');
    // Unlike the song snapshot's songs.length > 0 check, zero playlists is a
    // legitimate synced state here (a user may genuinely have none) -- so
    // "has synced" is judged by lastSyncedAt, not by result count.
    return lastSyncedAt !== null && serverUrl === currentUrl;
  }, []);

  return { syncPlaylists, getCachedPlaylists, hasPlaylistsCacheForCurrentServer };
};

export default usePlaylistsCache;
