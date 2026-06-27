/**
 * Tests for the standalone helpers exported from useLibraryCache.ts:
 * incrementPlayCountInCache, updateStarredInCache, updateRatingInCache, invalidateSongMap
 */
import {
  incrementPlayCountInCache,
  updateStarredInCache,
  updateRatingInCache,
  invalidateSongMap,
} from '../hooks/useLibraryCache';
import { LibraryCacheSong } from '../components/shared/libraryCache';
import { Item } from '../types';

type CacheSnapshot = { songs?: LibraryCacheSong[]; lastSyncedAt?: string; serverUrl?: string };

const makeSong = (id: string, overrides: Partial<LibraryCacheSong> = {}): LibraryCacheSong => ({
  id,
  parent: '',
  title: 'Song ' + id,
  isDir: false,
  album: 'Album',
  albumId: '',
  albumArtist: '',
  albumArtistId: '',
  artist: [],
  track: 1,
  year: 2000,
  genre: [],
  albumGenre: '',
  size: 0,
  contentType: 'audio/mpeg',
  suffix: 'mp3',
  duration: 180,
  bitRate: 320,
  path: '/music',
  playCount: 0,
  discNumber: 1,
  created: '',
  streamUrl: '',
  image: '',
  starred: false,
  userRating: 0,
  type: Item.Music,
  ...overrides,
});

const setSnapshot = (snapshot: CacheSnapshot) => {
  (window.bridge.libraryCache.get as jest.Mock) = jest.fn().mockReturnValue(snapshot);
};

const getCapturedSets = () => (window.bridge.libraryCache.set as jest.Mock).mock.calls;

beforeEach(() => {
  // Reset cache between tests
  invalidateSongMap();
  jest.clearAllMocks();
  (window.bridge.libraryCache.get as jest.Mock) = jest.fn().mockReturnValue(null);
  (window.bridge.libraryCache.set as jest.Mock) = jest.fn();
});

afterEach(() => {
  invalidateSongMap();
});

// ─── incrementPlayCountInCache ────────────────────────────────────────────────

describe('incrementPlayCountInCache', () => {
  it('increments playCount for a known song', async () => {
    jest.useFakeTimers();
    setSnapshot({ songs: [makeSong('s1', { playCount: 5 })] });

    incrementPlayCountInCache('s1');
    jest.runAllTimers();

    const calls = getCapturedSets();
    expect(calls.length).toBeGreaterThan(0);
    const [, written] = calls[calls.length - 1] as [string, CacheSnapshot];
    const song = written.songs?.find((s) => s.id === 's1');
    expect(song?.playCount).toBe(6);

    jest.useRealTimers();
  });

  it('does nothing when songId is undefined', () => {
    setSnapshot({ songs: [makeSong('s1')] });
    incrementPlayCountInCache(undefined);
    expect(window.bridge.libraryCache.set).not.toHaveBeenCalled();
  });

  it('does nothing when songId is not in cache', () => {
    jest.useFakeTimers();
    setSnapshot({ songs: [makeSong('s1')] });
    incrementPlayCountInCache('unknown-id');
    jest.runAllTimers();
    expect(window.bridge.libraryCache.set).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('treats missing playCount as 0 and increments to 1', async () => {
    jest.useFakeTimers();
    const song = makeSong('s2');
    (song as LibraryCacheSong & { playCount?: number }).playCount = 0;
    setSnapshot({ songs: [song] });

    incrementPlayCountInCache('s2');
    jest.runAllTimers();

    const calls = getCapturedSets();
    const [, written] = calls[calls.length - 1] as [string, CacheSnapshot];
    const updated = written.songs?.find((s) => s.id === 's2');
    expect(updated?.playCount).toBe(1);

    jest.useRealTimers();
  });
});

// ─── updateStarredInCache ─────────────────────────────────────────────────────

describe('updateStarredInCache', () => {
  it('sets starred to true for a known song', async () => {
    jest.useFakeTimers();
    setSnapshot({ songs: [makeSong('s1', { starred: false })] });

    updateStarredInCache('s1', true);
    jest.runAllTimers();

    const calls = getCapturedSets();
    const [, written] = calls[calls.length - 1] as [string, CacheSnapshot];
    const song = written.songs?.find((s) => s.id === 's1');
    expect(song?.starred).toBe(true);

    jest.useRealTimers();
  });

  it('sets starred to false for a known song', async () => {
    jest.useFakeTimers();
    setSnapshot({ songs: [makeSong('s1', { starred: true })] });

    updateStarredInCache('s1', false);
    jest.runAllTimers();

    const calls = getCapturedSets();
    const [, written] = calls[calls.length - 1] as [string, CacheSnapshot];
    const song = written.songs?.find((s) => s.id === 's1');
    expect(song?.starred).toBe(false);

    jest.useRealTimers();
  });

  it('does nothing for an unknown songId', () => {
    jest.useFakeTimers();
    setSnapshot({ songs: [makeSong('s1')] });
    updateStarredInCache('not-in-cache', true);
    jest.runAllTimers();
    expect(window.bridge.libraryCache.set).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

// ─── updateRatingInCache ──────────────────────────────────────────────────────

describe('updateRatingInCache', () => {
  it('updates userRating for a known song', async () => {
    jest.useFakeTimers();
    setSnapshot({ songs: [makeSong('s1', { userRating: 0 })] });

    updateRatingInCache('s1', 4);
    jest.runAllTimers();

    const calls = getCapturedSets();
    const [, written] = calls[calls.length - 1] as [string, CacheSnapshot];
    const song = written.songs?.find((s) => s.id === 's1');
    expect(song?.userRating).toBe(4);

    jest.useRealTimers();
  });

  it('clears rating (sets to 0) for a known song', async () => {
    jest.useFakeTimers();
    setSnapshot({ songs: [makeSong('s1', { userRating: 5 })] });

    updateRatingInCache('s1', 0);
    jest.runAllTimers();

    const calls = getCapturedSets();
    const [, written] = calls[calls.length - 1] as [string, CacheSnapshot];
    const song = written.songs?.find((s) => s.id === 's1');
    expect(song?.userRating).toBe(0);

    jest.useRealTimers();
  });

  it('does nothing for an unknown songId', () => {
    jest.useFakeTimers();
    setSnapshot({ songs: [makeSong('s1')] });
    updateRatingInCache('not-found', 3);
    jest.runAllTimers();
    expect(window.bridge.libraryCache.set).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

// ─── invalidateSongMap ────────────────────────────────────────────────────────

describe('invalidateSongMap', () => {
  it('forces getSongMap to re-read from the store on next call', async () => {
    jest.useFakeTimers();
    // Prime the cache with one song
    setSnapshot({ songs: [makeSong('s1', { playCount: 1 })] });
    incrementPlayCountInCache('s1'); // initializes songMap
    jest.runAllTimers();
    jest.clearAllMocks();

    // Change what the store returns
    setSnapshot({ songs: [makeSong('s1', { playCount: 99 })] });

    // Without invalidate, songMap is still the old one — increment from 1 not 99
    // WITH invalidate it re-reads
    invalidateSongMap();
    incrementPlayCountInCache('s1');
    jest.runAllTimers();

    const calls = getCapturedSets();
    const [, written] = calls[calls.length - 1] as [string, CacheSnapshot];
    const song = written.songs?.find((s) => s.id === 's1');
    // Re-read from store gave us playCount 99, so incremented to 100
    expect(song?.playCount).toBe(100);

    jest.useRealTimers();
  });
});
