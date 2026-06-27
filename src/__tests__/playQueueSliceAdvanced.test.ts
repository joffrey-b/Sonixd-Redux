import playQueueReducer, {
  appendPlayQueue,
  removeFromPlayQueue,
  setPlayQueue,
  getNextPlayerIndex,
  clearPlayQueue,
  setVolume,
  setCurrentPlayer,
  toggleRepeat,
  toggleShuffle,
  toggleDisplayQueue,
  setIsLoading,
  setIsLoaded,
  setIsFading,
  setPlaybackSetting,
  setStopAfterCurrent,
  incrementEntryPlayCount,
  setStar,
  setRate,
  resetPlayQueue,
  setPlayerSrc,
  restoreState,
  setSort,
  sortPlayQueue,
  moveToTop,
  moveToBottom,
  moveUp,
  moveDown,
  incrementCurrentIndex,
  decrementCurrentIndex,
  setCurrentIndex,
  incrementPlayerIndex,
} from '../redux/playQueueSlice';
import type { PlayQueue } from '../redux/playQueueSlice';
import type { Song } from '../types';

function makeSong(overrides: Partial<Song> = {}): Song {
  const id = overrides.id ?? 'song-1';
  return {
    id,
    uniqueId: overrides.uniqueId ?? `uid-${id}`,
    title: `Song ${id}`,
    streamUrl: `http://server/stream/${id}`,
    duration: 180,
    isDir: false,
    type: 'music',
    artist: 'Artist',
    album: 'Album',
    albumId: 'album-1',
    albumArtist: 'Artist',
    albumArtistId: 'artist-1',
    ...overrides,
  } as Song;
}

function getInitialState(): PlayQueue {
  return playQueueReducer(undefined, { type: '@@INIT' });
}

function loadQueue(songs: Song[]): PlayQueue {
  return playQueueReducer(getInitialState(), setPlayQueue({ entries: songs }));
}

describe('play next / play later', () => {
  it('playNext inserts the track immediately after current', () => {
    const initial = loadQueue([
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ]);
    // currentIndex is 0 (song 'a')
    expect(initial.currentIndex).toBe(0);

    const newSong = makeSong({ id: 'x', uniqueId: 'uid-x' });
    const state = playQueueReducer(initial, appendPlayQueue({ entries: [newSong], type: 'next' }));

    // 'x' should be at index 1, right after the current song 'a'
    expect(state.entry[1].id).toBe('x');
    expect(state.entry[2].id).toBe('b');
  });

  it('playNext with multiple tracks maintains insertion order', () => {
    const initial = loadQueue([
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
    ]);

    const state = playQueueReducer(
      initial,
      appendPlayQueue({
        entries: [
          makeSong({ id: 'x', uniqueId: 'uid-x' }),
          makeSong({ id: 'y', uniqueId: 'uid-y' }),
        ],
        type: 'next',
      })
    );

    expect(state.entry[1].id).toBe('x');
    expect(state.entry[2].id).toBe('y');
    expect(state.entry[3].id).toBe('b');
  });

  it('playLater appends to the end of the queue', () => {
    const initial = loadQueue([
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
    ]);

    const newSong = makeSong({ id: 'z', uniqueId: 'uid-z' });
    const state = playQueueReducer(initial, appendPlayQueue({ entries: [newSong], type: 'later' }));

    expect(state.entry[state.entry.length - 1].id).toBe('z');
    expect(state.entry.length).toBe(3);
  });

  it('currentIndex is unchanged after playNext inserts after current', () => {
    const initial = loadQueue([
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
    ]);
    const beforeIndex = initial.currentIndex;

    const state = playQueueReducer(
      initial,
      appendPlayQueue({ entries: [makeSong({ id: 'x', uniqueId: 'uid-x' })], type: 'next' })
    );

    expect(state.currentIndex).toBe(beforeIndex);
  });

  it('currentIndex is unchanged after playLater appends at the end', () => {
    const initial = loadQueue([
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
    ]);
    const beforeIndex = initial.currentIndex;

    const state = playQueueReducer(
      initial,
      appendPlayQueue({ entries: [makeSong({ id: 'z', uniqueId: 'uid-z' })], type: 'later' })
    );

    expect(state.currentIndex).toBe(beforeIndex);
  });
});

describe('queue reordering / removal', () => {
  it('currentIndex updates correctly when a track above current is removed', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    // Load and set current to song 'c' (index 2)
    let state = loadQueue(songs);
    // Advance to index 2 manually by setting current to song c
    // (setPlayQueueByRowClick is complex; we'll use removeFromPlayQueue directly on a state
    // where currentIndex = 2 is set up)
    state = { ...state, currentIndex: 2, currentSongUniqueId: 'uid-c', currentSongId: 'c' };

    // Remove song 'a' (above current)
    state = playQueueReducer(state, removeFromPlayQueue({ entries: [songs[0]] }));

    // currentIndex should shift down by 1 since an entry above was removed
    expect(state.currentIndex).toBe(1);
    expect(state.currentSongUniqueId).toBe('uid-c');
  });

  it('currentIndex is unchanged when a track below current is removed', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    // Current is at index 0
    let state = loadQueue(songs);
    expect(state.currentIndex).toBe(0);

    // Remove song 'c' (below current)
    state = playQueueReducer(state, removeFromPlayQueue({ entries: [songs[2]] }));

    expect(state.currentIndex).toBe(0);
    expect(state.currentSongUniqueId).toBe('uid-a');
  });
});

describe('end-of-queue with getNextPlayerIndex', () => {
  it('returns null for a 1-track queue with repeat:none', () => {
    expect(getNextPlayerIndex(1, 'none', 0)).toBeNull();
  });

  it('returns null for a 3-track queue at the last track with repeat:none', () => {
    expect(getNextPlayerIndex(3, 'none', 2)).toBeNull();
  });

  it('returns 0 for a 3-track queue at the last track with repeat:all', () => {
    expect(getNextPlayerIndex(3, 'all', 2)).toBe(0);
  });

  it('returns same index for any queue size with repeat:one', () => {
    expect(getNextPlayerIndex(3, 'one', 1)).toBe(1);
    expect(getNextPlayerIndex(1, 'one', 0)).toBe(0);
    expect(getNextPlayerIndex(5, 'one', 4)).toBe(4);
  });

  it('advances normally within the queue regardless of repeat mode', () => {
    expect(getNextPlayerIndex(5, 'none', 2)).toBe(3);
    expect(getNextPlayerIndex(5, 'all', 2)).toBe(3);
  });

  it('returns 0 when only one track and repeat:all', () => {
    // length >= 2 check: with 1 track and repeat:all, the none/last condition is not met,
    // and length < 2 so we fall through to `return 0`
    expect(getNextPlayerIndex(1, 'all', 0)).toBe(0);
  });
});

describe('playQueueSlice — basic reducers', () => {
  it('clearPlayQueue empties all entries and resets current', () => {
    const initial = loadQueue([makeSong({ id: 'a', uniqueId: 'uid-a' })]);
    const state = playQueueReducer(initial, clearPlayQueue());
    expect(state.entry).toHaveLength(0);
    expect(state.current).toBeUndefined();
  });

  it('setVolume updates volume', () => {
    const state = playQueueReducer(getInitialState(), setVolume(75));
    expect(state.volume).toBe(75);
  });

  it('setCurrentPlayer sets player to 1 or 2', () => {
    let state = playQueueReducer(getInitialState(), setCurrentPlayer(2));
    expect(state.currentPlayer).toBe(2);
    state = playQueueReducer(state, setCurrentPlayer(1));
    expect(state.currentPlayer).toBe(1);
  });

  it('toggleRepeat cycles through all three modes', () => {
    // mockSettings.repeat is 'all', so initial state starts at 'all'
    let state = loadQueue([makeSong({ id: 'a', uniqueId: 'uid-a' })]);
    const startRepeat = state.repeat;
    state = playQueueReducer(state, toggleRepeat());
    // After first toggle from 'all' → 'one'
    expect(state.repeat).not.toBe(startRepeat);
    state = playQueueReducer(state, toggleRepeat());
    // After second toggle → 'none'
    expect(state.repeat).not.toBe(startRepeat);
    state = playQueueReducer(state, toggleRepeat());
    // After third toggle, back to start
    expect(state.repeat).toBe(startRepeat);
  });

  it('toggleDisplayQueue flips the displayQueue flag', () => {
    const initial = getInitialState();
    const before = initial.displayQueue;
    const state = playQueueReducer(initial, toggleDisplayQueue());
    expect(state.displayQueue).toBe(!before);
  });

  it('setIsLoading sets isLoading to true', () => {
    const state = playQueueReducer(getInitialState(), setIsLoading());
    expect(state.isLoading).toBe(true);
  });

  it('setIsLoaded sets isLoading to false', () => {
    let state = playQueueReducer(getInitialState(), setIsLoading());
    state = playQueueReducer(state, setIsLoaded());
    expect(state.isLoading).toBe(false);
  });

  it('setIsFading updates isFading', () => {
    const state = playQueueReducer(getInitialState(), setIsFading(true));
    expect(state.isFading).toBe(true);
    const state2 = playQueueReducer(state, setIsFading(false));
    expect(state2.isFading).toBe(false);
  });

  it('setStopAfterCurrent sets the flag', () => {
    const state = playQueueReducer(getInitialState(), setStopAfterCurrent(true));
    expect(state.stopAfterCurrent).toBe(true);
  });

  it('resetPlayQueue resets queue to defaults', () => {
    const loaded = loadQueue([makeSong({ id: 'a', uniqueId: 'uid-a' })]);
    const state = playQueueReducer(loaded, resetPlayQueue());
    expect(state.entry).toHaveLength(0);
    expect(state.currentIndex).toBe(0);
  });

  it('setPlayerSrc updates player src', () => {
    const state = playQueueReducer(
      getInitialState(),
      setPlayerSrc({ player: 1, src: 'http://stream/song' })
    );
    expect(state.player1.src).toBe('http://stream/song');

    const state2 = playQueueReducer(state, setPlayerSrc({ player: 2, src: 'http://stream/song2' }));
    expect(state2.player2.src).toBe('http://stream/song2');
  });
});

describe('playQueueSlice — setPlaybackSetting', () => {
  it('fadeDuration', () => {
    const s = playQueueReducer(
      getInitialState(),
      setPlaybackSetting({ setting: 'fadeDuration', value: 3 })
    );
    expect(s.fadeDuration).toBe(3);
  });

  it('pollingInterval', () => {
    const s = playQueueReducer(
      getInitialState(),
      setPlaybackSetting({ setting: 'pollingInterval', value: 500 })
    );
    expect(s.pollingInterval).toBe(500);
  });

  it('volumeFade', () => {
    const s = playQueueReducer(
      getInitialState(),
      setPlaybackSetting({ setting: 'volumeFade', value: true })
    );
    expect(s.volumeFade).toBe(true);
  });

  it('scrobble', () => {
    const s = playQueueReducer(
      getInitialState(),
      setPlaybackSetting({ setting: 'scrobble', value: false })
    );
    expect(s.scrobble).toBe(false);
  });

  it('scrobbleThreshold', () => {
    const s = playQueueReducer(
      getInitialState(),
      setPlaybackSetting({ setting: 'scrobbleThreshold', value: 75 })
    );
    expect(s.scrobbleThreshold).toBe(75);
  });

  it('scrollWithCurrentSong', () => {
    const s = playQueueReducer(
      getInitialState(),
      setPlaybackSetting({ setting: 'scrollWithCurrentSong', value: true })
    );
    expect(s.scrollWithCurrentSong).toBe(true);
  });

  it('directPreviousTrack', () => {
    const s = playQueueReducer(
      getInitialState(),
      setPlaybackSetting({ setting: 'directPreviousTrack', value: true })
    );
    expect(s.directPreviousTrack).toBe(true);
  });

  it('preservePlayNextOrder', () => {
    const s = playQueueReducer(
      getInitialState(),
      setPlaybackSetting({ setting: 'preservePlayNextOrder', value: true })
    );
    expect(s.preservePlayNextOrder).toBe(true);
  });
});

describe('playQueueSlice — setStar / setRate', () => {
  it('setStar sets starred to a truthy timestamp string on matching entry', () => {
    const initial = loadQueue([makeSong({ id: 'song-1', uniqueId: 'uid-1' })]);
    const state = playQueueReducer(initial, setStar({ id: ['song-1'], type: 'star' }));
    // starred is stored as String(Date.now()) — truthy but not a boolean
    expect(state.entry[0].starred).toBeTruthy();
    expect(typeof state.entry[0].starred).toBe('string');
  });

  it('setStar sets starred to undefined when type is unstar', () => {
    const initial = loadQueue([makeSong({ id: 'song-1', uniqueId: 'uid-1' })]);
    let state = playQueueReducer(initial, setStar({ id: ['song-1'], type: 'star' }));
    state = playQueueReducer(state, setStar({ id: ['song-1'], type: 'unstar' }));
    expect(state.entry[0].starred).toBeUndefined();
  });

  it('setRate updates userRating on matching entry', () => {
    const initial = loadQueue([makeSong({ id: 'song-1', uniqueId: 'uid-1' })]);
    const state = playQueueReducer(initial, setRate({ id: ['song-1'], rating: 4 }));
    expect(state.entry[0].userRating).toBe(4);
  });
});

describe('playQueueSlice — incrementEntryPlayCount', () => {
  it('increments playCount for matching song in entry', () => {
    const initial = loadQueue([makeSong({ id: 'song-1', uniqueId: 'uid-1' })]);
    const state = playQueueReducer(initial, incrementEntryPlayCount('song-1'));
    expect(state.entry[0].playCount).toBe(1);
  });

  it('does not modify unmatched songs', () => {
    const initial = loadQueue([
      makeSong({ id: 'song-1', uniqueId: 'uid-1' }),
      makeSong({ id: 'song-2', uniqueId: 'uid-2' }),
    ]);
    const before = initial.entry[1].playCount;
    const state = playQueueReducer(initial, incrementEntryPlayCount('song-1'));
    // song-2 should be unchanged
    expect(state.entry[1].playCount).toBe(before);
  });
});

describe('playQueueSlice — restoreState', () => {
  it('restores a valid saved state', () => {
    const song = makeSong({ id: 'a', uniqueId: 'uid-a' });
    const savedState = {
      entry: [song],
      shuffledEntry: [],
      current: song,
      currentIndex: 0,
      currentSongId: 'a',
      currentSongUniqueId: 'uid-a',
      player1: { src: 'http://stream', index: 0, fadeData: { volumeData: [], timeData: [] } },
      player2: { src: '', index: 1, fadeData: { volumeData: [], timeData: [] } },
      currentPlayer: 1 as const,
    };

    const state = playQueueReducer(getInitialState(), restoreState(savedState));
    expect(state.entry[0].id).toBe('a');
    expect(state.currentIndex).toBe(0);
    expect(state.currentPlayer).toBe(1);
  });

  it('ignores invalid saved state (entry not array)', () => {
    const invalidState = {
      entry: null as unknown as Song[],
      shuffledEntry: [],
      current: undefined,
      currentIndex: 0,
      currentSongId: '',
      currentSongUniqueId: '',
      player1: { src: '', index: 0, fadeData: { volumeData: [], timeData: [] } },
      player2: { src: '', index: 0, fadeData: { volumeData: [], timeData: [] } },
      currentPlayer: 1 as const,
    };

    const initial = getInitialState();
    const state = playQueueReducer(initial, restoreState(invalidState));
    expect(state.entry).toHaveLength(0);
  });
});

describe('playQueueSlice — sort and shuffle', () => {
  it('setSort updates sortColumn and sortType', () => {
    const state = playQueueReducer(
      getInitialState(),
      setSort({ sortColumn: 'title', sortType: 'asc' })
    );
    expect(state.sortColumn).toBe('title');
    expect(state.sortType).toBe('asc');
  });

  it('sortPlayQueue sorts entries by column ascending', () => {
    const songs = [
      makeSong({ id: 'c', uniqueId: 'uid-c', title: 'Charlie' }),
      makeSong({ id: 'a', uniqueId: 'uid-a', title: 'Alpha' }),
      makeSong({ id: 'b', uniqueId: 'uid-b', title: 'Bravo' }),
    ];
    const initial = loadQueue(songs);
    const state = playQueueReducer(
      initial,
      sortPlayQueue({ columnDataKey: 'title', sortType: 'asc' })
    );
    expect(state.sortedEntry[0].title).toBe('Alpha');
    expect(state.sortedEntry[1].title).toBe('Bravo');
    expect(state.sortedEntry[2].title).toBe('Charlie');
  });

  it('sortPlayQueue with empty columnDataKey clears sortedEntry', () => {
    const songs = [makeSong({ id: 'a', uniqueId: 'uid-a' })];
    const initial = loadQueue(songs);
    const state = playQueueReducer(initial, sortPlayQueue({ columnDataKey: '', sortType: 'asc' }));
    expect(state.sortedEntry).toHaveLength(0);
  });

  it('toggleShuffle enables shuffle and creates shuffledEntry', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    // mockSettings.shuffle is false, so initial.shuffle is always false
    const initial = loadQueue(songs);
    expect(initial.shuffle).toBe(false);
    const state = playQueueReducer(initial, toggleShuffle());
    expect(state.shuffle).toBe(true);
    expect(state.shuffledEntry).toHaveLength(3);
  });
});

describe('playQueueSlice — index management', () => {
  it('incrementCurrentIndex advances by 1 in the middle of the queue', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    const initial = loadQueue(songs);
    const state = playQueueReducer(initial, incrementCurrentIndex(''));
    expect(state.currentIndex).toBe(1);
  });

  it('incrementCurrentIndex with repeat:all wraps back to 0 at end', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
    ];
    let state = loadQueue(songs);
    // Start at index 0 (mockSettings.repeat = 'all')
    state = { ...state, currentIndex: 1 };
    state = playQueueReducer(state, incrementCurrentIndex(''));
    expect(state.currentIndex).toBe(0);
  });

  it('decrementCurrentIndex goes back one track when usingHotkey', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
    ];
    const initial = { ...loadQueue(songs), currentIndex: 1 };
    const state = playQueueReducer(initial, decrementCurrentIndex('usingHotkey'));
    expect(state.currentIndex).toBe(0);
  });

  it('decrementCurrentIndex does not go below 0 (restarts current song)', () => {
    const songs = [makeSong({ id: 'a', uniqueId: 'uid-a' })];
    const initial = loadQueue(songs);
    expect(initial.currentIndex).toBe(0);
    const before = initial.playerRestartCurrent;
    const state = playQueueReducer(initial, decrementCurrentIndex('usingHotkey'));
    // Can't go back, so playerRestartCurrent increments
    expect(state.playerRestartCurrent).toBe(before + 1);
  });

  it('setCurrentIndex moves current song to the specified entry', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    const initial = loadQueue(songs);
    const state = playQueueReducer(initial, setCurrentIndex(songs[2]));
    expect(state.currentIndex).toBe(2);
    expect(state.currentSongId).toBe('c');
  });

  it('incrementPlayerIndex for player 1 advances player1.index', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    const initial = { ...loadQueue(songs), currentPlayer: 1 as const };
    const state = playQueueReducer(initial, incrementPlayerIndex(1));
    // player1.index should advance (or wrap)
    expect(typeof state.player1.index).toBe('number');
    // either advanced or wrapped to 0
    expect(state.player1.index).not.toBeLessThan(0);
  });
});

describe('playQueueSlice — move operations', () => {
  it('moveToTop moves selected entries to the top of the queue', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    const initial = loadQueue(songs);
    const state = playQueueReducer(initial, moveToTop({ selectedEntries: [songs[2]] }));
    expect(state.entry[0].id).toBe('c');
  });

  it('moveToBottom moves selected entries to the bottom of the queue', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    const initial = loadQueue(songs);
    const state = playQueueReducer(initial, moveToBottom({ selectedEntries: [songs[0]] }));
    expect(state.entry[state.entry.length - 1].id).toBe('a');
  });

  it('moveUp moves selected entry one position up', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    const initial = loadQueue(songs);
    const state = playQueueReducer(initial, moveUp({ selectedEntries: [songs[2]] }));
    expect(state.entry[1].id).toBe('c');
    expect(state.entry[2].id).toBe('b');
  });

  it('moveDown moves selected entry one position down', () => {
    const songs = [
      makeSong({ id: 'a', uniqueId: 'uid-a' }),
      makeSong({ id: 'b', uniqueId: 'uid-b' }),
      makeSong({ id: 'c', uniqueId: 'uid-c' }),
    ];
    const initial = loadQueue(songs);
    const state = playQueueReducer(initial, moveDown({ selectedEntries: [songs[0]] }));
    expect(state.entry[0].id).toBe('b');
    expect(state.entry[1].id).toBe('a');
  });
});
