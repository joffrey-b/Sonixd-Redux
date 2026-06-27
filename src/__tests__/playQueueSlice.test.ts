import { configureStore } from '@reduxjs/toolkit';
import playQueueReducer, {
  getNextPlayerIndex,
  restoreState,
  toggleShuffle,
  refreshSettingsFields,
  PlayQueueSaveState,
} from '../redux/playQueueSlice';
import { Item, Song } from '../types';

const makeSong = (id: string): Song => ({
  id,
  uniqueId: `uid-${id}`,
  title: `Song ${id}`,
  album: 'Test Album',
  albumArtist: 'Test Artist',
  albumArtistId: 'artist-1',
  artist: [],
  size: 1000,
  created: '2024-01-01',
  streamUrl: `http://example.com/${id}`,
  image: '',
  type: Item.Music,
});

const createStore = () => configureStore({ reducer: { playQueue: playQueueReducer } });

describe('getNextPlayerIndex', () => {
  it('returns null when repeat is none and current is the last track', () => {
    expect(getNextPlayerIndex(5, 'none', 4)).toBeNull();
  });

  it('returns 0 when repeat is all and current is the last track', () => {
    expect(getNextPlayerIndex(5, 'all', 4)).toBe(0);
  });

  it('returns the same index when repeat is one', () => {
    expect(getNextPlayerIndex(5, 'one', 2)).toBe(2);
  });

  it('returns currentIndex + 1 for a normal advance', () => {
    expect(getNextPlayerIndex(5, 'all', 2)).toBe(3);
  });

  it('returns currentIndex + 1 with repeat:none when not at the last track', () => {
    expect(getNextPlayerIndex(5, 'none', 2)).toBe(3);
  });

  it('handles a single-track queue with repeat:none — returns null, not 0', () => {
    expect(getNextPlayerIndex(1, 'none', 0)).toBeNull();
  });

  it('handles a single-track queue with repeat:all — returns 0', () => {
    expect(getNextPlayerIndex(1, 'all', 0)).toBe(0);
  });

  it('handles a single-track queue with repeat:one — returns 0', () => {
    expect(getNextPlayerIndex(1, 'one', 0)).toBe(0);
  });
});

describe('restoreState', () => {
  const validPayload = (): PlayQueueSaveState => ({
    entry: [makeSong('a'), makeSong('b')],
    shuffledEntry: [],
    current: makeSong('a'),
    currentIndex: 0,
    currentSongId: 'a',
    currentSongUniqueId: 'uid-a',
    player1: { src: '', index: 0, fadeData: { volumeData: [], timeData: [] } },
    player2: { src: '', index: 1, fadeData: { volumeData: [], timeData: [] } },
    currentPlayer: 1,
  });

  it('applies valid persisted state correctly', () => {
    const store = createStore();
    store.dispatch(restoreState(validPayload()));
    const state = store.getState().playQueue;
    expect(state.entry).toHaveLength(2);
    expect(state.currentIndex).toBe(0);
    expect(state.currentPlayer).toBe(1);
  });

  it('rejects state where entry is not an array — state is unchanged', () => {
    const store = createStore();
    const before = store.getState().playQueue.entry;
    store.dispatch(restoreState({ ...validPayload(), entry: 'not-array' as unknown as Song[] }));
    expect(store.getState().playQueue.entry).toEqual(before);
  });

  it('rejects state where shuffledEntry is not an array — state is unchanged', () => {
    const store = createStore();
    const before = store.getState().playQueue.entry;
    store.dispatch(
      restoreState({ ...validPayload(), shuffledEntry: 'not-array' as unknown as Song[] })
    );
    expect(store.getState().playQueue.entry).toEqual(before);
  });

  it('rejects state where currentPlayer is not 1 or 2 — state is unchanged', () => {
    const store = createStore();
    const before = store.getState().playQueue.entry;
    store.dispatch(restoreState({ ...validPayload(), currentPlayer: 3 }));
    expect(store.getState().playQueue.entry).toEqual(before);
  });

  it('rejects state where currentIndex is negative — state is unchanged', () => {
    const store = createStore();
    const before = store.getState().playQueue.entry;
    store.dispatch(restoreState({ ...validPayload(), currentIndex: -1 }));
    expect(store.getState().playQueue.entry).toEqual(before);
  });

  it('rejects state where currentIndex is >= entry.length — state is unchanged', () => {
    const store = createStore();
    const before = store.getState().playQueue.entry;
    store.dispatch(restoreState({ ...validPayload(), currentIndex: 2 }));
    expect(store.getState().playQueue.entry).toEqual(before);
  });

  it('does not throw on invalid state — silently returns', () => {
    const store = createStore();
    expect(() =>
      store.dispatch(restoreState({ ...validPayload(), entry: null as unknown as Song[] }))
    ).not.toThrow();
  });
});

describe('shuffle behaviour', () => {
  it('does not mutate the original entry array when shuffle is toggled on', () => {
    const store = createStore();
    const songs = [makeSong('1'), makeSong('2'), makeSong('3'), makeSong('4'), makeSong('5')];
    store.dispatch(
      restoreState({
        entry: songs,
        shuffledEntry: [],
        current: songs[0],
        currentIndex: 0,
        currentSongId: songs[0].id,
        currentSongUniqueId: songs[0].uniqueId,
        player1: { src: '', index: 0, fadeData: { volumeData: [], timeData: [] } },
        player2: { src: '', index: 1, fadeData: { volumeData: [], timeData: [] } },
        currentPlayer: 1,
      })
    );

    const entryBefore = [...store.getState().playQueue.entry];
    store.dispatch(toggleShuffle());
    const entryAfter = store.getState().playQueue.entry;

    expect(entryAfter).toEqual(entryBefore);
  });

  it('generates a shuffledEntry different from the original entry order (probabilistic, 10 runs)', () => {
    let sawDifference = false;
    for (let run = 0; run < 10; run++) {
      const store = createStore();
      const songs = Array.from({ length: 10 }, (_, i) => makeSong(String(i)));
      store.dispatch(
        restoreState({
          entry: songs,
          shuffledEntry: [],
          current: songs[0],
          currentIndex: 0,
          currentSongId: songs[0].id,
          currentSongUniqueId: songs[0].uniqueId,
          player1: { src: '', index: 0, fadeData: { volumeData: [], timeData: [] } },
          player2: { src: '', index: 1, fadeData: { volumeData: [], timeData: [] } },
          currentPlayer: 1,
        })
      );

      store.dispatch(toggleShuffle());
      const shuffled = store.getState().playQueue.shuffledEntry;
      const original = store.getState().playQueue.entry;

      if (shuffled.some((s, i) => s.uniqueId !== original[i].uniqueId)) {
        sawDifference = true;
        break;
      }
    }
    expect(sawDifference).toBe(true);
  });
});

describe('refreshSettingsFields (import-settings refresh)', () => {
  it('merges only the provided settings-derived fields, leaving live queue state untouched', () => {
    const store = createStore();
    const songs = [makeSong('1'), makeSong('2')];

    store.dispatch(
      restoreState({
        entry: songs,
        shuffledEntry: [],
        current: songs[1],
        currentIndex: 1,
        currentSongId: songs[1].id,
        currentSongUniqueId: songs[1].uniqueId,
        player1: {
          src: 'http://example.com/1',
          index: 0,
          fadeData: { volumeData: [], timeData: [] },
        },
        player2: {
          src: 'http://example.com/2',
          index: 1,
          fadeData: { volumeData: [], timeData: [] },
        },
        currentPlayer: 2,
      })
    );

    store.dispatch(refreshSettingsFields({ volume: 0.42, scrobble: true, repeat: 'all' }));

    const state = store.getState().playQueue;
    // Settings-derived fields picked up the import
    expect(state.volume).toBe(0.42);
    expect(state.scrobble).toBe(true);
    expect(state.repeat).toBe('all');
    // Live queue state from restoreState is untouched
    expect(state.entry).toHaveLength(2);
    expect(state.currentIndex).toBe(1);
    expect(state.currentSongId).toBe(songs[1].id);
    expect(state.currentPlayer).toBe(2);
  });
});
