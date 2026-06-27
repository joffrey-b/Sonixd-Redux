import { SmartPlaylistRule } from '../types';

interface SongLike {
  genre?: unknown;
  year?: number;
  playCount?: number;
  userRating?: number;
  starred?: boolean | string;
  duration?: number;
}

export function evaluateRule(rule: SmartPlaylistRule, song: SongLike): boolean {
  const { field, operator, value, value2 } = rule;
  switch (field) {
    case 'genre': {
      const genres = (Array.isArray(song.genre) ? song.genre : []).map((g: unknown) =>
        typeof g === 'string'
          ? g.toLowerCase()
          : ((g as { title: string })?.title?.toLowerCase() ?? '')
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
      return false;
  }
}

export function evaluateRules(
  rules: SmartPlaylistRule[],
  song: SongLike,
  mode: 'ALL' | 'ANY' = 'ALL'
): boolean {
  if (rules.length === 0) return true;
  if (mode === 'ALL') return rules.every((r) => evaluateRule(r, song));
  return rules.some((r) => evaluateRule(r, song));
}
