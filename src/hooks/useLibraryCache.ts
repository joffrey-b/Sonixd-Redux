import { useCallback } from 'react';
import { useAppSelector } from '../redux/hooks';
import { apiController } from '../api/controller';
import { Song } from '../types';
import { libraryCache, LibraryCacheSong } from '../components/shared/libraryCache';

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

const useLibraryCache = () => {
  const config = useAppSelector((state) => state.config);

  const syncLibrary = useCallback(
    async (onProgress?: (fetched: number, total: number | null) => void): Promise<number> => {
      const serverUrl = localStorage.getItem('server') || '';
      const batchSize = 500;
      let offset = 0;
      const allSongs: LibraryCacheSong[] = [];
      let total: number | null = null;

      for (;;) {
        // eslint-disable-next-line no-await-in-loop
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

        onProgress?.(allSongs.length, total);

        if (batch.length < batchSize) break;
        offset += batchSize;
      }

      libraryCache.set('songs', allSongs);
      libraryCache.set('lastSyncedAt', new Date().toISOString());
      libraryCache.set('serverUrl', serverUrl);

      return allSongs.length;
    },
    [config.serverType]
  );

  const getCachedSongs = useCallback((): LibraryCacheSong[] => {
    return (libraryCache.get('songs') as LibraryCacheSong[]) || [];
  }, []);

  const hasCacheForCurrentServer = useCallback((): boolean => {
    const songs = (libraryCache.get('songs') as LibraryCacheSong[]) || [];
    const cachedUrl = libraryCache.get('serverUrl') as string | null;
    const currentUrl = localStorage.getItem('server') || '';
    return songs.length > 0 && cachedUrl === currentUrl;
  }, []);

  const getLastSyncedAt = useCallback((): string | null => {
    return libraryCache.get('lastSyncedAt') as string | null;
  }, []);

  return {
    syncLibrary,
    getCachedSongs,
    hasCacheForCurrentServer,
    getLastSyncedAt,
  };
};

export default useLibraryCache;

// Standalone helpers used outside hooks (Player, PlayerBar) — import libraryCache directly.
export const incrementPlayCountInCache = (songId: string | undefined) => {
  if (!songId) return;
  const songs = (libraryCache.get('songs') as LibraryCacheSong[]) || [];
  const idx = songs.findIndex((s) => s.id === songId);
  if (idx !== -1) {
    songs[idx] = { ...songs[idx], playCount: (songs[idx].playCount || 0) + 1 };
    libraryCache.set('songs', songs);
  }
};

export const updateStarredInCache = (songId: string, starred: boolean) => {
  const songs = (libraryCache.get('songs') as LibraryCacheSong[]) || [];
  const idx = songs.findIndex((s) => s.id === songId);
  if (idx !== -1) {
    songs[idx] = { ...songs[idx], starred };
    libraryCache.set('songs', songs);
  }
};

export const updateRatingInCache = (songId: string, rating: number) => {
  const songs = (libraryCache.get('songs') as LibraryCacheSong[]) || [];
  const idx = songs.findIndex((s) => s.id === songId);
  if (idx !== -1) {
    songs[idx] = { ...songs[idx], userRating: rating };
    libraryCache.set('songs', songs);
  }
};
