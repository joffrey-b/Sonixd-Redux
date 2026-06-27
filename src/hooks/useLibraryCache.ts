import { useCallback, useEffect } from 'react';
import { useAppSelector } from '../redux/hooks';
import { settings, libraryCacheStore, ipcRenderer } from '../components/shared/bridge';
import { apiController } from '../api/controller';
import { Song } from '../types';
import { LibraryCacheSong } from '../components/shared/libraryCache';

const toLibraryCacheSong = (song: Song): LibraryCacheSong => ({
  id: song.id,
  parent: song.parent,
  title: song.title,
  isDir: song.isDir,
  album: song.album,
  albumId: song.albumId,
  albumArtist: song.albumArtist,
  albumArtistId: song.albumArtistId,
  artist: song.artist,
  track: song.track,
  year: song.year,
  genre: song.genre,
  albumGenre: song.albumGenre,
  size: song.size,
  contentType: song.contentType,
  suffix: song.suffix,
  duration: song.duration,
  bitRate: song.bitRate,
  path: song.path,
  playCount: song.playCount || 0,
  discNumber: song.discNumber,
  created: song.created,
  streamUrl: song.streamUrl,
  image: song.image,
  starred: !!song.starred,
  userRating: song.userRating,
  type: song.type,
});

// Module-level Map cache — lazy-initialized from the store on first helper call.
// Avoids reading the entire songs array (potentially MB via IPC) on every scrobble/star/rating.
let songMap: Map<string, LibraryCacheSong> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Module-level (not per-hook-instance) so the silent auto-sync in App.tsx and a
// manually-triggered sync from Smart Playlists can't both run a full paginated
// fetch at the same time — App.tsx fires syncLibrary() unconditionally on every
// launch, so without this a user who also clicks "Sync Library" (e.g. right
// after the post-upgrade "please sync" toast) doubles the request load on their
// server for the whole sync window instead of just joining the one in flight.
let syncInFlight: Promise<number> | null = null;
const syncProgressListeners = new Set<(fetched: number, total: number | null) => void>();

interface CacheSnapshot {
  songs?: LibraryCacheSong[];
  lastSyncedAt?: string | null;
  serverUrl?: string | null;
}

const getSnapshot = (): {
  songs: LibraryCacheSong[];
  lastSyncedAt: string | null;
  serverUrl: string | null;
} => {
  const raw = (libraryCacheStore.get('cacheSnapshot') as unknown as CacheSnapshot) || {};
  return {
    songs: raw.songs || [],
    lastSyncedAt: raw.lastSyncedAt || null,
    serverUrl: raw.serverUrl || null,
  };
};

const getSongMap = (): Map<string, LibraryCacheSong> => {
  if (!songMap) {
    const { songs } = getSnapshot();
    songMap = new Map(songs.map((s) => [s.id, s]));
  }
  return songMap;
};

const flushSongMapNow = () => {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (songMap) {
    const current = (libraryCacheStore.get('cacheSnapshot') as unknown as CacheSnapshot) || {};
    libraryCacheStore.set('cacheSnapshot', {
      ...current,
      songs: Array.from(songMap.values()),
    });
  }
};

const scheduleSongMapFlush = () => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushSongMapNow();
  }, 5000);
};

// Call after a full sync to ensure the next helper call reads fresh data.
export const invalidateSongMap = () => {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  songMap = null;
};

const useLibraryCache = () => {
  const config = useAppSelector((state) => state.config);

  useEffect(() => {
    ipcRenderer.on('flush-cache-now', flushSongMapNow);
    return () => {
      ipcRenderer.removeListener('flush-cache-now', flushSongMapNow);
    };
  }, []);

  const syncLibrary = useCallback(
    async (onProgress?: (fetched: number, total: number | null) => void): Promise<number> => {
      if (onProgress) syncProgressListeners.add(onProgress);

      if (!syncInFlight) {
        // Cleared in its own finally once the fetch itself settles, not when an
        // individual caller's await returns — every caller (the original plus
        // any that joined) is awaiting this same promise either way.
        syncInFlight = (async () => {
          try {
            const serverUrl = String(settings.get('server') || '');
            const batchSize = 500;
            let offset = 0;
            const allSongs: LibraryCacheSong[] = [];
            let total: number | null = null;

            for (;;) {
              const result = await apiController({
                serverType: config.serverType,
                endpoint: 'getAllSongs',
                args: { offset, count: batchSize },
              });

              const batch: Song[] = result?.songs || [];
              if (result?.total != null && total == null) total = result.total;

              for (const song of batch) {
                allSongs.push(toLibraryCacheSong(song));
              }

              for (const cb of syncProgressListeners) {
                cb(allSongs.length, total);
              }

              if (batch.length < batchSize) break;
              offset += batchSize;
            }

            libraryCacheStore.set('cacheSnapshot', {
              songs: allSongs,
              lastSyncedAt: new Date().toISOString(),
              serverUrl,
            });
            invalidateSongMap();

            return allSongs.length;
          } finally {
            syncInFlight = null;
          }
        })();
      }

      try {
        return await syncInFlight;
      } finally {
        if (onProgress) syncProgressListeners.delete(onProgress);
      }
    },
    [config.serverType]
  );

  const getCachedSongs = useCallback((): LibraryCacheSong[] => {
    return getSnapshot().songs;
  }, []);

  const hasCacheForCurrentServer = useCallback((): boolean => {
    const { songs, serverUrl: cachedUrl } = getSnapshot();
    const currentUrl = String(settings.get('server') || '');
    return songs.length > 0 && cachedUrl === currentUrl;
  }, []);

  const getLastSyncedAt = useCallback((): string | null => {
    return getSnapshot().lastSyncedAt;
  }, []);

  return {
    syncLibrary,
    getCachedSongs,
    hasCacheForCurrentServer,
    getLastSyncedAt,
  };
};

export default useLibraryCache;

// Standalone helpers used outside hooks (Player, PlayerBar).
export const incrementPlayCountInCache = (songId: string | undefined) => {
  if (!songId) return;
  const map = getSongMap();
  const song = map.get(songId);
  if (song) {
    map.set(songId, { ...song, playCount: (song.playCount || 0) + 1 });
    scheduleSongMapFlush();
  }
};

export const updateStarredInCache = (songId: string, starred: boolean) => {
  const map = getSongMap();
  const song = map.get(songId);
  if (song) {
    map.set(songId, { ...song, starred });
    scheduleSongMapFlush();
  }
};

export const updateRatingInCache = (songId: string, rating: number) => {
  const map = getSongMap();
  const song = map.get(songId);
  if (song) {
    map.set(songId, { ...song, userRating: rating });
    scheduleSongMapFlush();
  }
};
