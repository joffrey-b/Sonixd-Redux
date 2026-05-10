import { useCallback } from 'react';
import { nanoid } from 'nanoid/non-secure';
import { useAppSelector } from '../redux/hooks';
import { apiController } from '../api/controller';
import { SmartPlaylist, SmartPlaylistRule, SmartPlaylistSortField, Song } from '../types';
import { LibraryCacheSong } from '../components/shared/libraryCache';
import useLibraryCache from './useLibraryCache';

// Applies a single rule to a song array. Works for both Song and LibraryCacheSong
// since they share all the filtered fields.
const applyRule = (songs: any[], rule: SmartPlaylistRule): any[] => {
  const { field, operator, value, value2 } = rule;
  return songs.filter((song) => {
    switch (field) {
      case 'genre': {
        const genres = (song.genre || []).map((g: any) =>
          typeof g === 'string' ? g.toLowerCase() : g.title.toLowerCase()
        );
        const v = String(value).toLowerCase();
        if (operator === 'is') return genres.some((g: string) => g === v);
        if (operator === 'isNot') return !genres.some((g: string) => g === v);
        return true;
      }
      case 'year': {
        if (!song.year) return false;
        if (operator === 'is') return song.year === Number(value);
        if (operator === 'between')
          return song.year >= Number(value) && song.year <= Number(value2 ?? value);
        if (operator === 'gt') return song.year > Number(value);
        if (operator === 'gte') return song.year >= Number(value);
        if (operator === 'lt') return song.year < Number(value);
        if (operator === 'lte') return song.year <= Number(value);
        return true;
      }
      case 'playCount': {
        const count = song.playCount || 0;
        if (operator === 'gte') return count >= Number(value);
        if (operator === 'lte') return count <= Number(value);
        if (operator === 'gt') return count > Number(value);
        if (operator === 'lt') return count < Number(value);
        if (operator === 'is') return count === Number(value);
        return true;
      }
      case 'rating': {
        const rating = Number(song.userRating) || 0;
        if (rating === 0) return false;
        if (operator === 'gte') return rating >= Number(value);
        if (operator === 'lte') return rating <= Number(value);
        if (operator === 'is') return rating === Number(value);
        return true;
      }
      case 'starred': {
        // LibraryCacheSong.starred is boolean; Song.starred is string | undefined
        const isStarred = typeof song.starred === 'boolean' ? song.starred : !!song.starred;
        if (operator === 'is') return value ? isStarred : !isStarred;
        return true;
      }
      case 'duration': {
        const minutes = (song.duration || 0) / 60;
        if (operator === 'between')
          return minutes >= Number(value) && minutes <= Number(value2 ?? value);
        if (operator === 'gt') return minutes > Number(value);
        if (operator === 'lt') return minutes < Number(value);
        return true;
      }
      default:
        return true;
    }
  });
};

const sortSongs = <
  T extends { playCount?: number; year?: number; userRating?: number; duration?: number }
>(
  songs: T[],
  sort: SmartPlaylistSortField,
  direction: 'asc' | 'desc'
): T[] => {
  if (sort === 'random') return [...songs].sort(() => Math.random() - 0.5);
  const fieldMap: Partial<Record<SmartPlaylistSortField, keyof T>> = {
    playCount: 'playCount' as keyof T,
    year: 'year' as keyof T,
    rating: 'userRating' as keyof T,
    duration: 'duration' as keyof T,
  };
  const key = fieldMap[sort];
  if (!key) return songs;
  return [...songs].sort((a, b) => {
    const av = (a[key] as unknown as number) || 0;
    const bv = (b[key] as unknown as number) || 0;
    return direction === 'desc' ? bv - av : av - bv;
  });
};

// Convert a LibraryCacheSong to a Song-compatible object for the play queue.
const toPlayableSong = (cached: LibraryCacheSong): Song =>
  ({
    ...cached,
    uniqueId: nanoid(),
    starred: cached.starred ? 'starred' : undefined,
  } as unknown as Song);

const useSmartPlaylist = () => {
  const config = useAppSelector((state) => state.config);
  const { getCachedSongs, hasCacheForCurrentServer } = useLibraryCache();

  const fetchSmartPlaylistSongs = useCallback(
    async (playlist: SmartPlaylist): Promise<Song[]> => {
      const { rules, sort, sortDirection, limit } = playlist;

      // --- Path 1: library cache available — query the full library ---
      if (hasCacheForCurrentServer()) {
        let songs: LibraryCacheSong[] = getCachedSongs();
        for (const rule of rules) {
          songs = applyRule(songs, rule) as LibraryCacheSong[];
        }
        songs = sortSongs(songs, sort, sortDirection);
        if (sort === 'playCount') {
          songs = songs.filter((s) => (s.playCount || 0) > 0);
        }
        return songs.slice(0, limit).map(toPlayableSong);
      }

      // --- Path 2: no cache — fall back to random pool from server ---
      const fetchSize = Math.min(Math.max(limit * 5, 300), 500);

      const genreIsRule = rules.find((r) => r.field === 'genre' && r.operator === 'is');
      const starredTrueRule = rules.find((r) => r.field === 'starred' && r.value === true);
      const yearBetweenRule = rules.find((r) => r.field === 'year' && r.operator === 'between');
      const yearIsRule = rules.find((r) => r.field === 'year' && r.operator === 'is');
      const yearGteRule = rules.find((r) => r.field === 'year' && r.operator === 'gte');
      const yearGtRule = rules.find((r) => r.field === 'year' && r.operator === 'gt');
      const yearLteRule = rules.find((r) => r.field === 'year' && r.operator === 'lte');
      const yearLtRule = rules.find((r) => r.field === 'year' && r.operator === 'lt');

      let serverSongs: Song[] = [];

      if (starredTrueRule) {
        const data = await apiController({
          serverType: config.serverType,
          endpoint: 'getStarred',
          args: {},
        });
        serverSongs = data?.song || [];
      } else if (genreIsRule && !yearBetweenRule && !yearIsRule && !yearGteRule && !yearGtRule) {
        const data = await apiController({
          serverType: config.serverType,
          endpoint: 'getRandomSongs',
          args: { size: fetchSize, genre: String(genreIsRule.value) },
        });
        serverSongs = Array.isArray(data) ? data : [];
      } else {
        const args: Record<string, any> = { size: fetchSize };
        if (yearBetweenRule) {
          args.fromYear = Number(yearBetweenRule.value);
          args.toYear = Number(yearBetweenRule.value2);
        } else if (yearIsRule) {
          args.fromYear = Number(yearIsRule.value);
          args.toYear = Number(yearIsRule.value);
        } else if (yearGteRule) {
          args.fromYear = Number(yearGteRule.value);
        } else if (yearGtRule) {
          args.fromYear = Number(yearGtRule.value) + 1;
        }
        if (yearLteRule) {
          args.toYear = Number(yearLteRule.value);
        } else if (yearLtRule) {
          args.toYear = Number(yearLtRule.value) - 1;
        }
        if (genreIsRule) {
          args.genre = String(genreIsRule.value);
        }
        const data = await apiController({
          serverType: config.serverType,
          endpoint: 'getRandomSongs',
          args,
        });
        serverSongs = Array.isArray(data) ? data : [];
      }

      for (const rule of rules) {
        serverSongs = applyRule(serverSongs, rule) as Song[];
      }
      serverSongs = sortSongs(serverSongs, sort, sortDirection);
      if (sort === 'playCount') {
        serverSongs = serverSongs.filter((s) => (s.playCount || 0) > 0);
      }
      return serverSongs.slice(0, limit);
    },
    [config.serverType, getCachedSongs, hasCacheForCurrentServer]
  );

  return { fetchSmartPlaylistSongs };
};

export default useSmartPlaylist;
