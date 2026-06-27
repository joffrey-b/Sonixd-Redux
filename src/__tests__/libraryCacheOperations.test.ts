import {
  incrementPlayCountInCache,
  updateStarredInCache,
  updateRatingInCache,
  invalidateSongMap,
} from '../hooks/useLibraryCache';
import type { LibraryCacheSong } from '../components/shared/libraryCache';
import { Item } from '../types';

const makeSong = (overrides: Partial<LibraryCacheSong> = {}): LibraryCacheSong => ({
  id: 'song-1',
  parent: undefined,
  title: 'Test Song',
  isDir: false,
  album: 'Test Album',
  albumId: 'album-1',
  albumArtist: 'Test Artist',
  albumArtistId: 'artist-1',
  artist: [{ id: 'artist-1', title: 'Test Artist' }],
  track: 1,
  year: 2024,
  genre: undefined,
  albumGenre: undefined,
  size: 1000000,
  contentType: 'audio/flac',
  suffix: 'flac',
  duration: 180,
  bitRate: 320,
  path: '/music/test.flac',
  playCount: 0,
  discNumber: undefined,
  created: '2024-01-01',
  streamUrl: 'http://server/stream/song-1',
  image: '',
  starred: false,
  userRating: undefined,
  type: Item.Music,
  ...overrides,
});

const makeSnapshot = (songs: LibraryCacheSong[]) => ({
  songs,
  lastSyncedAt: '2024-01-01T00:00:00.000Z',
  serverUrl: 'http://server',
});

function setupBridgeWithSongs(songs: LibraryCacheSong[]) {
  const snapshot = makeSnapshot(songs);
  (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache.get = jest
    .fn()
    .mockReturnValue(snapshot);
  (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache.set = jest.fn();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // Reset the module-level songMap before each test
  invalidateSongMap();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('incrementPlayCountInCache', () => {
  it('increments the play count for a matching song id', () => {
    const songs = [makeSong({ id: 'song-1', playCount: 5 })];
    setupBridgeWithSongs(songs);

    incrementPlayCountInCache('song-1');

    // invalidate so the next getSongMap call reads the (potentially modified) state
    // by checking the set call
    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;

    // Flush the debounced write
    jest.runAllTimers();

    expect(mockSet).toHaveBeenCalledTimes(1);
    const writtenSnapshot = mockSet.mock.calls[0][1] as { songs: LibraryCacheSong[] };
    const updatedSong = writtenSnapshot.songs.find((s) => s.id === 'song-1');
    expect(updatedSong?.playCount).toBe(6);
  });

  it('does nothing if the song id is not in the cache', () => {
    const songs = [makeSong({ id: 'song-1', playCount: 5 })];
    setupBridgeWithSongs(songs);

    incrementPlayCountInCache('nonexistent-id');

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('does not modify any other songs', () => {
    const songs = [
      makeSong({ id: 'song-1', playCount: 5 }),
      makeSong({ id: 'song-2', playCount: 10 }),
    ];
    setupBridgeWithSongs(songs);

    incrementPlayCountInCache('song-1');

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    const writtenSnapshot = mockSet.mock.calls[0][1] as { songs: LibraryCacheSong[] };
    const otherSong = writtenSnapshot.songs.find((s) => s.id === 'song-2');
    expect(otherSong?.playCount).toBe(10);
  });

  it('does nothing when songId is undefined', () => {
    const songs = [makeSong({ id: 'song-1', playCount: 5 })];
    setupBridgeWithSongs(songs);

    incrementPlayCountInCache(undefined);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('updateStarredInCache', () => {
  it('sets starred to true for a matching song id', () => {
    setupBridgeWithSongs([makeSong({ id: 'song-1', starred: false })]);

    updateStarredInCache('song-1', true);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    const writtenSnapshot = mockSet.mock.calls[0][1] as { songs: LibraryCacheSong[] };
    expect(writtenSnapshot.songs.find((s) => s.id === 'song-1')?.starred).toBe(true);
  });

  it('sets starred to false for a matching song id', () => {
    setupBridgeWithSongs([makeSong({ id: 'song-1', starred: true })]);

    updateStarredInCache('song-1', false);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    const writtenSnapshot = mockSet.mock.calls[0][1] as { songs: LibraryCacheSong[] };
    expect(writtenSnapshot.songs.find((s) => s.id === 'song-1')?.starred).toBe(false);
  });

  it('does nothing if the song id is not in the cache', () => {
    setupBridgeWithSongs([makeSong({ id: 'song-1', starred: false })]);

    updateStarredInCache('nonexistent-id', true);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('updateRatingInCache', () => {
  it('updates the rating for a matching song id', () => {
    setupBridgeWithSongs([makeSong({ id: 'song-1', userRating: 3 })]);

    updateRatingInCache('song-1', 5);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    const writtenSnapshot = mockSet.mock.calls[0][1] as { songs: LibraryCacheSong[] };
    expect(writtenSnapshot.songs.find((s) => s.id === 'song-1')?.userRating).toBe(5);
  });

  it('does nothing if the song id is not in the cache', () => {
    setupBridgeWithSongs([makeSong({ id: 'song-1', userRating: 3 })]);

    updateRatingInCache('nonexistent-id', 5);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('handles rating of 0', () => {
    setupBridgeWithSongs([makeSong({ id: 'song-1', userRating: 5 })]);

    updateRatingInCache('song-1', 0);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    const writtenSnapshot = mockSet.mock.calls[0][1] as { songs: LibraryCacheSong[] };
    expect(writtenSnapshot.songs.find((s) => s.id === 'song-1')?.userRating).toBe(0);
  });

  it('handles rating of 5', () => {
    setupBridgeWithSongs([makeSong({ id: 'song-1', userRating: 0 })]);

    updateRatingInCache('song-1', 5);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;
    const writtenSnapshot = mockSet.mock.calls[0][1] as { songs: LibraryCacheSong[] };
    expect(writtenSnapshot.songs.find((s) => s.id === 'song-1')?.userRating).toBe(5);
  });
});

describe('invalidateSongMap', () => {
  it('rebuilds the Map from the current songs array after invalidation', () => {
    const songs = [makeSong({ id: 'song-1', playCount: 5 })];
    setupBridgeWithSongs(songs);

    // First load
    incrementPlayCountInCache('song-1');

    // Invalidate — reset the Map
    invalidateSongMap();

    // Update the snapshot to have a different playCount
    const newSongs = [makeSong({ id: 'song-1', playCount: 99 })];
    setupBridgeWithSongs(newSongs);

    // Next operation should re-read from bridge
    updateStarredInCache('song-1', true);

    jest.runAllTimers();

    const mockSet = (window as unknown as { bridge: Window['bridge'] }).bridge.libraryCache
      .set as jest.Mock;

    // The last write should reflect the updated song with starred: true
    const lastCall = mockSet.mock.calls[mockSet.mock.calls.length - 1];
    const snapshot = lastCall[1] as { songs: LibraryCacheSong[] };
    const song = snapshot.songs.find((s) => s.id === 'song-1');
    expect(song?.starred).toBe(true);
  });

  it('handles an empty songs array without throwing', () => {
    setupBridgeWithSongs([]);
    expect(() => invalidateSongMap()).not.toThrow();
  });
});
