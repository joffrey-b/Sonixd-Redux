import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import _ from 'lodash';
import { nanoid } from 'nanoid/non-secure';
import {
  filterPlayQueue,
  moveSelectedDown,
  moveSelectedToBottom,
  moveSelectedToTop,
  moveSelectedUp,
} from '../shared/utils';
import { mockSettings } from '../shared/mockSettings';
import { Song } from '../types';
import { getParsedSettings } from '../components/shared/settingsAccess';

const getPlayQueueParsedSettings = () =>
  process.env.NODE_ENV === 'test' ? mockSettings : getParsedSettings();

export interface PlayQueue {
  player1: {
    src: string;
    index: number;
    fadeData: {
      volumeData: number[];
      timeData: string[];
    };
  };
  player2: {
    src: string;
    index: number;
    fadeData: {
      volumeData: number[];
      timeData: string[];
    };
  };
  scrollWithCurrentSong: boolean;
  fadeDuration: number;
  fadeType: string;
  pollingInterval: number;
  volumeFade: boolean;
  preservePlayNextOrder: boolean;
  directPreviousTrack: boolean;
  stopAfterCurrent: boolean;
  scrobbleThreshold: number;
  currentIndex: number;
  currentSongId: string;
  currentSongUniqueId: string;
  currentPlayer: number;
  current?: Song;
  isFading: boolean;
  playerUpdated: number;
  playerRestartCurrent: number;
  entryVersion: number;
  autoIncremented: boolean;
  volume: number;
  scrobble: boolean;
  isLoading: boolean;
  repeat: string;
  shuffle: boolean;
  sortColumn?: string;
  sortType: 'asc' | 'desc';
  displayQueue: boolean;
  showDebugWindow: boolean;
  entry: Song[];
  shuffledEntry: Song[];
  sortedEntry: Song[];
}

export type PlayQueueSaveState = Pick<
  PlayQueue,
  | 'entry'
  | 'shuffledEntry'
  | 'current'
  | 'currentIndex'
  | 'currentSongId'
  | 'currentSongUniqueId'
  | 'player1'
  | 'player2'
  | 'currentPlayer'
> & { serverUrl?: string };

type SettingsDerivedFields = Pick<
  PlayQueue,
  | 'scrollWithCurrentSong'
  | 'fadeDuration'
  | 'fadeType'
  | 'pollingInterval'
  | 'volumeFade'
  | 'preservePlayNextOrder'
  | 'directPreviousTrack'
  | 'scrobbleThreshold'
  | 'volume'
  | 'scrobble'
  | 'repeat'
  | 'shuffle'
  | 'showDebugWindow'
>;

// Exported so import-settings (main.dev.mjs) can dispatch a refresh of just
// these fields after writing imported settings directly to the store — see
// configSlice.ts's buildInitialState for the full explanation of why this is
// needed. Deliberately a field-level merge (refreshSettingsFields below),
// not a wholesale state replace like configSlice's: the rest of PlayQueue
// (entry, currentIndex, current, etc.) is live playback/queue state that
// must survive a settings import untouched.
export const buildSettingsDerivedFields = (): SettingsDerivedFields => {
  const parsedSettings = getPlayQueueParsedSettings();
  return {
    scrollWithCurrentSong: Boolean(parsedSettings.scrollWithCurrentSong),
    fadeDuration: Number(parsedSettings.fadeDuration),
    fadeType: String(parsedSettings.fadeType),
    pollingInterval: Number(parsedSettings.pollingInterval),
    volumeFade: Boolean(parsedSettings.volumeFade),
    preservePlayNextOrder: Boolean(parsedSettings.preservePlayNextOrder),
    directPreviousTrack: Boolean(parsedSettings.directPreviousTrack),
    scrobbleThreshold:
      parsedSettings.scrobbleThreshold !== undefined
        ? Number(parsedSettings.scrobbleThreshold)
        : 90,
    volume: Number(parsedSettings.volume),
    scrobble: Boolean(parsedSettings.scrobble),
    repeat: String(parsedSettings.repeat),
    shuffle:
      (parsedSettings.shuffle as boolean | string) === true ||
      (parsedSettings.shuffle as boolean | string) === 'true',
    showDebugWindow: Boolean(parsedSettings.showDebugWindow),
  };
};

const initialState: PlayQueue = {
  player1: {
    src: '',
    index: 0,
    fadeData: {
      volumeData: [],
      timeData: [],
    },
  },
  player2: {
    src: '',
    index: 1,
    fadeData: {
      volumeData: [],
      timeData: [],
    },
  },
  ...buildSettingsDerivedFields(),
  stopAfterCurrent: false,
  currentIndex: 0,
  currentSongId: '',
  currentSongUniqueId: '',
  currentPlayer: 1,
  isFading: false,
  playerUpdated: 0,
  playerRestartCurrent: 0,
  entryVersion: 0,
  autoIncremented: false,
  isLoading: false,
  sortColumn: undefined,
  sortType: 'asc',
  displayQueue: false,
  entry: [],
  shuffledEntry: [],
  sortedEntry: [],
};

const resetPlayerDefaults = (state: PlayQueue) => {
  state.isFading = false;
  state.current = undefined;
  state.currentIndex = 0;
  state.currentSongId = '';
  state.currentPlayer = 1;
  state.player1.src = '';
  state.player2.src = '';
  state.player1.index = 0;
  state.player2.index = 0;
  state.entry = [];
  state.shuffledEntry = [];
  state.sortedEntry = [];
};

const resetToPlayer1 = (state: PlayQueue) => {
  state.currentPlayer = 1;
  state.isFading = false;
  state.player1.index = state.currentIndex;
};

const insertItem = <T>(array: T[], index: number, item: T): T[] => {
  return [...array.slice(0, index), item, ...array.slice(index)];
};

const removeItem = <T>(array: T[], index: number): T[] => {
  return [...array.slice(0, index), ...array.slice(index + 1)];
};

const entrySelect = (state: PlayQueue) =>
  state.sortedEntry.length > 0 ? 'sortedEntry' : state.shuffle ? 'shuffledEntry' : 'entry';

export const getNextPlayerIndex = (
  length: number,
  repeat: string,
  currentIndex: number
): number | null => {
  if (repeat === 'none' && currentIndex >= length - 1) {
    return null;
  }
  if (length >= 2 && repeat !== 'one') {
    if (currentIndex + 1 === length) {
      return 0;
    }
    return currentIndex + 1;
  }
  if (repeat === 'one') {
    return currentIndex;
  }
  return 0;
};

export const getCurrentEntryIndex = (entries: Song[], currentSongId: string) => {
  return entries.findIndex((entry) => entry.id === currentSongId);
};

export const getCurrentEntryIndexByUID = (entries: Song[], currentSongId: string) => {
  return entries.findIndex((entry) => entry.uniqueId === currentSongId);
};

const playQueueSlice = createSlice({
  name: 'nowPlaying',
  initialState,
  reducers: {
    // Shallow merge, dispatched by main.dev.mjs's import-settings handler with
    // a freshly-built buildSettingsDerivedFields() — see that function's
    // comment. Only merges the provided keys, so live queue state is untouched.
    refreshSettingsFields: (state, action: PayloadAction<Partial<PlayQueue>>) => {
      Object.assign(state, action.payload);
    },

    setPlayerSrc: (state, action: PayloadAction<{ player: number; src: string }>) => {
      if (action.payload.player === 1) {
        state.player1.src = action.payload.src;
      } else {
        state.player2.src = action.payload.src;
      }
    },

    updatePlayerIndices: (state, action: PayloadAction<Song[]>) => {
      const newCurrentSongIndex = getCurrentEntryIndexByUID(
        action.payload,
        state.currentSongUniqueId
      );

      if (state.currentPlayer === 1) {
        state.player1.index = newCurrentSongIndex;
      } else {
        state.player2.index = newCurrentSongIndex;
      }

      state.currentIndex = newCurrentSongIndex;
    },

    setSort: (state, action: PayloadAction<{ sortColumn?: string; sortType: 'asc' | 'desc' }>) => {
      state.sortColumn = action.payload.sortColumn;
      state.sortType = action.payload.sortType;
    },

    sortPlayQueue: (
      state,
      action: PayloadAction<{ columnDataKey: string; sortType: 'asc' | 'desc' }>
    ) => {
      state.entryVersion += 1;
      if (action.payload.columnDataKey !== '') {
        state.sortedEntry = _.orderBy(
          state.entry,
          [
            (entry: Song) => {
              const key = action.payload.columnDataKey as keyof Song;
              const val = entry[key];
              if (typeof val === 'string') return val.toLowerCase() || '';
              return (val as number | undefined) ?? '';
            },
          ],
          action.payload.sortType
        );
      } else {
        state.sortedEntry = [];
      }

      const currentEntry = entrySelect(state);
      const checkIndex = getCurrentEntryIndexByUID(
        action.payload.columnDataKey !== '' ? state.sortedEntry : state[currentEntry],
        state.currentSongUniqueId
      );

      // Fix the index being set to -1 when appending entries to an empty list
      let newCurrentSongIndex;
      if (checkIndex === -1) {
        state.current =
          action.payload.columnDataKey !== '' ? state.sortedEntry[0] : state[currentEntry][0];
        state.currentIndex = 0;
        state.currentSongId = state.current?.id;
        state.currentSongUniqueId = state.current?.uniqueId;
        newCurrentSongIndex = 0;
      } else {
        newCurrentSongIndex = checkIndex;
      }

      if (state.currentPlayer === 1) {
        state.player1.index = newCurrentSongIndex;
      } else {
        state.player2.index = newCurrentSongIndex;
      }

      state.currentIndex = newCurrentSongIndex;
    },

    resetPlayQueue: (state) => {
      const currentEntry = entrySelect(state);
      // Capture the first entry before resetPlayerDefaults clears all entry arrays,
      // otherwise state[currentEntry][0] is undefined after the reset.
      const firstEntry = state[currentEntry][0];
      resetPlayerDefaults(state);
      if (firstEntry) {
        state.current = { ...firstEntry };
        state.currentSongId = firstEntry.id;
        state.currentSongUniqueId = firstEntry.uniqueId;
      }
    },

    setPlaybackSetting: (state, action: PayloadAction<{ setting: string; value: unknown }>) => {
      switch (action.payload.setting) {
        case 'fadeDuration':
          state.fadeDuration = action.payload.value as number;
          break;
        case 'pollingInterval':
          state.pollingInterval = action.payload.value as number;
          break;
        case 'fadeType':
          state.fadeType = action.payload.value as string;
          break;
        case 'volumeFade':
          state.volumeFade = action.payload.value as boolean;
          break;
        case 'preservePlayNextOrder':
          state.preservePlayNextOrder = action.payload.value as boolean;
          break;
        case 'directPreviousTrack':
          state.directPreviousTrack = action.payload.value as boolean;
          break;
        case 'scrobbleThreshold':
          state.scrobbleThreshold = action.payload.value as number;
          break;
        case 'showDebugWindow':
          state.showDebugWindow = action.payload.value as boolean;
          break;
        case 'scrollWithCurrentSong':
          state.scrollWithCurrentSong = action.payload.value as boolean;
          break;
        case 'scrobble':
          state.scrobble = action.payload.value as boolean;
          break;
        default:
          break;
      }
    },

    setFadeData: (
      state,
      action: PayloadAction<{
        player?: number;
        volume?: number;
        time?: number;
        clear?: boolean;
      }>
    ) => {
      if (!action.payload.clear) {
        switch (action.payload.player) {
          case 1:
            state.player1.fadeData.volumeData.push(action.payload.volume || 0);
            state.player1.fadeData.timeData.push(action.payload.time?.toFixed(2) || '0');
            break;
          case 2:
            state.player2.fadeData.volumeData.push(action.payload.volume || 0);
            state.player2.fadeData.timeData.push(action.payload.time?.toFixed(2) || '0');
            break;
          default:
            break;
        }
      } else {
        state.player1.fadeData = { volumeData: [], timeData: [] };
        state.player2.fadeData = { volumeData: [], timeData: [] };
      }
    },

    shuffleInPlace: (state) => {
      /* Used on the NowPlayingView to shuffle the current shuffledEntry queue.
      Uses the same logic as the toggleShuffle reducer to keep the currentIndex
      in-place so that the song doesn't change when shuffling */
      if (state.shuffledEntry.length > 1) {
        state.shuffle = true;
        state.entryVersion += 1;

        const shuffledEntriesWithoutCurrent = _.shuffle(
          removeItem(state.shuffledEntry, state.currentIndex)
        );

        const shuffledEntries = insertItem(
          shuffledEntriesWithoutCurrent,
          state.currentIndex,
          state.shuffledEntry[state.currentIndex]
        );

        state.shuffledEntry = shuffledEntries;
      }
    },

    toggleShuffle: (state) => {
      state.entryVersion += 1;
      state.shuffle = !state.shuffle;

      if (state.shuffle && state.entry.length > 1) {
        /* When shuffling, we want to keep the currently playing track in the
        same index so that the song doesn't change when enabling the shuffle. */
        const shuffledEntriesWithoutCurrent = _.shuffle(
          removeItem(state.entry, state.currentIndex)
        );

        // Readd the current song back into its original index
        const shuffledEntries = insertItem(
          shuffledEntriesWithoutCurrent,
          state.currentIndex,
          state.entry[state.currentIndex]
        );

        // currentIndex and currentSongId stays the same since we're keeping it in place
        state.shuffledEntry = shuffledEntries;
      } else if (state.shuffle) {
        // Single entry: just mirror entry so getCurrentEntryList finds the song
        state.shuffledEntry = [...state.entry];
      } else if (state.entry.length > 1) {
        /* If toggled to false, the NowPlayingView will reset back to using the regular entry[].
        We want to swap the currentIndex over to the currently playing track since its row index
        will change */

        const currentEntryIndex = getCurrentEntryIndex(state.entry, state.currentSongId);

        /* Account for the currentPlayer and set the player indexes accordingly. Unfortunately
        since we're updating the indexes here, the transition won't be seamless and the currently
        playing song will reset */
        state.currentIndex = currentEntryIndex;
        state.player1.index =
          state.currentPlayer === 1
            ? currentEntryIndex
            : (getNextPlayerIndex(state.entry.length, state.repeat, state.currentIndex) ?? 0);
        state.player2.index =
          state.currentPlayer === 2
            ? currentEntryIndex
            : (getNextPlayerIndex(state.entry.length, state.repeat, state.currentIndex) ?? 0);

        // Free up memory by clearing out the shuffled entries
        state.shuffledEntry = [];
      }
    },

    setAutoIncremented: (state, action: PayloadAction<boolean>) => {
      state.autoIncremented = action.payload;
    },

    setStar: (state, action: PayloadAction<{ id: string[]; type: string }>) => {
      //  Since the playqueue can have multiples of the same song, we need to find
      //  all the indices of the starred/unstarred song

      action.payload.id.forEach((id: string) => {
        const findIndices = _.keys(_.pickBy(state.entry, { id }));
        const findShuffledIndices = _.keys(_.pickBy(state.shuffledEntry, { id }));
        const findSortedIndices = _.keys(_.pickBy(state.sortedEntry, { id }));

        if (action.payload.type === 'unstar') {
          findIndices?.forEach((rowIndex: string) => {
            state.entry[Number(rowIndex)].starred = undefined;
          });
          findShuffledIndices?.forEach((rowIndex: string) => {
            state.shuffledEntry[Number(rowIndex)].starred = undefined;
          });
          findSortedIndices?.forEach((rowIndex: string) => {
            state.sortedEntry[Number(rowIndex)].starred = undefined;
          });
        } else {
          findIndices?.forEach((rowIndex: string) => {
            state.entry[Number(rowIndex)].starred = String(Date.now());
          });
          findShuffledIndices?.forEach((rowIndex: string) => {
            state.shuffledEntry[Number(rowIndex)].starred = String(Date.now());
          });
          findSortedIndices?.forEach((rowIndex: string) => {
            state.sortedEntry[Number(rowIndex)].starred = String(Date.now());
          });
        }
      });
    },

    setRate: (state, action: PayloadAction<{ id: string[]; rating?: number }>) => {
      action.payload.id.forEach((id: string) => {
        const findIndices = _.keys(_.pickBy(state.entry, { id }));
        const findShuffledIndices = _.keys(_.pickBy(state.shuffledEntry, { id }));
        const findSortedIndices = _.keys(_.pickBy(state.sortedEntry, { id }));

        if (action.payload.rating) {
          findIndices?.forEach((rowIndex: string) => {
            state.entry[Number(rowIndex)].userRating = action.payload.rating;
          });
          findShuffledIndices?.forEach((rowIndex: string) => {
            state.shuffledEntry[Number(rowIndex)].userRating = action.payload.rating;
          });
          findSortedIndices?.forEach((rowIndex: string) => {
            state.sortedEntry[Number(rowIndex)].userRating = action.payload.rating;
          });
        } else {
          findIndices?.forEach((rowIndex: string) => {
            state.entry[Number(rowIndex)].userRating = undefined;
          });
          findShuffledIndices?.forEach((rowIndex: string) => {
            state.shuffledEntry[Number(rowIndex)].userRating = undefined;
          });
          findSortedIndices?.forEach((rowIndex: string) => {
            state.sortedEntry[Number(rowIndex)].userRating = undefined;
          });
        }
      });
    },

    toggleRepeat: (state) => {
      const currentEntry = entrySelect(state);

      if (state.repeat === 'none') {
        state.repeat = 'all';
      } else if (state.repeat === 'all') {
        state.repeat = 'one';
        if (state.currentPlayer === 1) {
          state.player2.index = state.player1.index;
        } else {
          state.player1.index = state.player2.index;
        }
      } else if (state.repeat === 'one') {
        state.repeat = 'none';
        if (state.currentPlayer === 1) {
          state.player2.index = state.player1.index + 1;
        } else {
          state.player1.index = state.player2.index + 1;
        }
      }

      if (state.player1.index > state[currentEntry].length - 1) {
        state.player1.index = 0;
      }

      if (state.player2.index > state[currentEntry].length - 1) {
        state.player2.index = 0;
      }
    },

    toggleDisplayQueue: (state) => {
      state.displayQueue = !state.displayQueue;
    },

    setVolume: (state, action: PayloadAction<number>) => {
      state.volume = action.payload;
    },

    setCurrentPlayer: (state, action: PayloadAction<number>) => {
      if (action.payload === 1) {
        state.currentPlayer = 1;
      } else {
        state.currentPlayer = 2;
      }
    },

    incrementCurrentIndex: (state, action: PayloadAction<string>) => {
      const currentEntry = entrySelect(state);
      const prevIndex = state.currentIndex;

      if (state[currentEntry].length >= 1 && state.repeat !== 'one') {
        if (state.currentIndex < state[currentEntry].length - 1) {
          // Check that current index isn't on the last track of the queue
          state.currentIndex += 1;
        } else if (state.repeat === 'all') {
          // But if it is the last track, and repeat is all, then we can go back to 0
          state.currentIndex = 0;
        }
        if (action.payload === 'usingHotkey') {
          /* If incrementing manually (usingHotkey), we'll reset to player 1. Otherwise,
          if incrementing automatically (on fade/end) it will swap between player1/player2 */
          resetToPlayer1(state);
          if (state.currentIndex + 1 >= state[currentEntry].length) {
            state.player2.index = 0;
          } else {
            state.player2.index = state.currentIndex + 1;
          }

          if (state.currentIndex !== prevIndex) {
            // Different song — reset the seek bar via the playerUpdated effect.
            state.playerUpdated += 1;
          } else if (state.repeat === 'all') {
            // Same song (single-song queue with repeat-all) — restart it from the beginning.
            state.playerRestartCurrent += 1;
          }
          // repeat-none/one at end of queue: do nothing (can't advance).
        }
      } else if (state[currentEntry].length >= 1 && state.repeat === 'one') {
        // If repeating one, then we can just increment to the next track
        if (state.currentIndex + 1 < state[currentEntry].length) {
          // Only increment if not on the last entry in the queue
          state.currentIndex += 1;
          if (action.payload === 'usingHotkey') {
            resetToPlayer1(state);
            state.player2.index = state.currentIndex;
          }
        }
      }

      state.current = { ...state[currentEntry][state.currentIndex] };
      state.currentSongId = state[currentEntry][state.currentIndex]?.id;
      state.currentSongUniqueId = state[currentEntry][state.currentIndex]?.uniqueId;
    },

    incrementPlayerIndex: (state, action: PayloadAction<number>) => {
      const currentEntry = entrySelect(state);

      /* If the entry list is greater than two, we don't need to increment,
      just keep swapping playback between the tracks [0 <=> 0] or [0 <=> 1]
      without changing the index of either player */
      if (state[currentEntry].length > 2 && state.repeat !== 'one') {
        if (action.payload === 1) {
          if (state.player1.index + 1 === state[currentEntry].length && state.repeat === 'none') {
            // Reset the player on the end of the playlist if no repeat
            resetPlayerDefaults(state);
          } else if (state.player1.index + 2 >= state[currentEntry].length) {
            /* If incrementing would be greater than the total number of entries,
            reset it back to 0. Also check if player1 is already set to 0. */
            if (state.player2.index === 0) {
              state.player1.index = state.player2.index + 1;
            } else {
              state.player1.index = 0;
            }
          } else {
            state.player1.index += 2;
          }
          state.currentPlayer = 2;
        } else {
          if (state.player2.index + 1 === state[currentEntry].length && state.repeat === 'none') {
            // Reset the player on the end of the playlist if no repeat
            resetPlayerDefaults(state);
          } else if (state.player2.index + 2 >= state[currentEntry].length) {
            /* If incrementing would be greater than the total number of entries,
            reset it back to 0. Also check if player1 is already set to 0. */
            if (state.player1.index === 0) {
              state.player2.index = 1;
            } else {
              state.player2.index = 0;
            }
          } else {
            state.player2.index += 2;
          }
          state.currentPlayer = 1;
        }
      }
    },

    setPlayerIndex: (state, action: PayloadAction<Song>) => {
      const currentEntry = entrySelect(state);

      const findIndex = getCurrentEntryIndexByUID(state[currentEntry], action.payload.uniqueId);

      state.isFading = false;
      state.player1.index = findIndex;

      // Use in conjunction with fixPlayer2Index reducer - see note
      state.player2.index = 0;

      state.currentPlayer = 1;
      state.currentIndex = findIndex;
      state.current = { ...action.payload };
      state.currentSongId = action.payload.id;
      state.currentSongUniqueId = action.payload.uniqueId;
    },

    decrementCurrentIndex: (state, action: PayloadAction<string>) => {
      if (action.payload === 'usingHotkey') {
        const currentEntry = entrySelect(state);

        if (state[currentEntry].length >= 1) {
          const prevIndex = state.currentIndex;

          if (state.currentIndex > 0) {
            state.currentIndex -= 1;
          } else if (state.repeat === 'all') {
            // If repeating all and currentIndex is 0, then decrement to end of entry queue
            state.currentIndex = state[currentEntry].length - 1;
          }

          resetToPlayer1(state);

          // Use in conjunction with fixPlayer2Index reducer - see note
          state.player2.index = 0;

          if (state.currentIndex !== prevIndex) {
            // Different song — reset the seek bar via the playerUpdated effect.
            state.playerUpdated += 1;
          } else {
            // Already at the first song and can't go back — restart it from the beginning.
            state.playerRestartCurrent += 1;
          }
        }

        state.current = { ...state[currentEntry][state.currentIndex] };
        state.currentSongId = state[currentEntry][state.currentIndex]?.id;
        state.currentSongUniqueId = state[currentEntry][state.currentIndex]?.uniqueId;
      }
    },

    fixPlayer2Index: (state) => {
      // Before decrementing:
      // Player1: 4 | Player2: 3

      // After decrementing:
      // Player1: 2 | Player2: 3

      // When incrementing/decrementing, we will always revert back to Player1 instead of
      // using the current player. In this case you will notice that the Player2 index stays the same.
      // This will cause the react audio player component to not unload the song which makes it so that
      // Player2 will continue playing even after decrementing. This reducer resets the Player2 index and
      // then sets it to its proper index.

      if (state.currentPlayer === 1) {
        state.player2.src = '';

        state.player2.index =
          getNextPlayerIndex(state[entrySelect(state)].length, state.repeat, state.currentIndex) ??
          0;
      }
    },

    setCurrentIndex: (state, action: PayloadAction<Song>) => {
      const currentEntry = entrySelect(state);

      const findIndex = getCurrentEntryIndexByUID(state[currentEntry], action.payload.uniqueId);

      state.currentIndex = findIndex;
      state.current = { ...action.payload };
      state.currentSongId = action.payload.id;
      state.currentSongUniqueId = action.payload.uniqueId;
    },

    setPlayQueue: (
      state,
      action: PayloadAction<{
        entries: Song[];
      }>
    ) => {
      // Used with gridview where you just want to set the entry queue directly
      if (action.payload.entries.length === 0) return;
      state.entryVersion += 1;
      resetPlayerDefaults(state);

      state.player1.src = action.payload.entries[0].streamUrl;

      action.payload.entries.forEach((entry) => state.entry.push(entry));
      if (state.shuffle) {
        // If shuffle is enabled, add all entries randomly
        const shuffledEntries = _.shuffle(action.payload.entries);
        shuffledEntries.forEach((entry) => state.shuffledEntry.push(entry));
        state.current = { ...shuffledEntries[0] };
        state.currentSongId = shuffledEntries[0].id;
        state.currentSongUniqueId = shuffledEntries[0].uniqueId;
      } else {
        // If shuffle is disabled, add all entries in order
        state.current = { ...action.payload.entries[0] };
        state.currentSongId = action.payload.entries[0].id;
        state.currentSongUniqueId = action.payload.entries[0].uniqueId;
      }
    },

    setPlayQueueByRowClick: (
      state,
      action: PayloadAction<{
        entries: Song[];
        currentIndex: number;
        currentSongId: string;
        uniqueSongId: string;
        filters: { enabled: boolean; filter: string }[];
      }>
    ) => {
      // Used with listview where you want to set the entry queue by double clicking on a row
      // Setting the entry queue by row will add all entries, but set the current index to
      // the row that was double clicked
      state.entryVersion += 1;
      resetPlayerDefaults(state);

      state.player1.src = action.payload.entries[action.payload.currentIndex].streamUrl;

      // Apply filters to all entries except the entry that was double clicked
      const filteredFromStartToCurrent = filterPlayQueue(
        action.payload.filters,
        action.payload.entries.slice(0, action.payload.currentIndex)
      ).entries;

      const filteredFromCurrentToEnd = filterPlayQueue(
        action.payload.filters,
        action.payload.entries.slice(action.payload.currentIndex + 1)
      ).entries;

      const entries = _.concat(
        filteredFromStartToCurrent,
        action.payload.entries[action.payload.currentIndex],
        filteredFromCurrentToEnd
      );

      const current = entries.find((entry) => entry.uniqueId === action.payload.uniqueSongId);

      state.entry = entries;

      if (state.shuffle) {
        // If shuffle is enabled, add the selected row to 0 and then shuffle the rest
        const shuffledEntriesWithoutCurrent = _.shuffle(
          removeItem(state.entry, action.payload.currentIndex)
        );

        const shuffledEntries = insertItem(
          filterPlayQueue(action.payload.filters, shuffledEntriesWithoutCurrent).entries,
          0,
          action.payload.entries[action.payload.currentIndex]
        );

        state.shuffledEntry = shuffledEntries;
        state.currentIndex = 0;
        state.player1.index = 0;

        state.current = current;
        state.currentSongId = action.payload.currentSongId;
        state.currentSongUniqueId = action.payload.uniqueSongId;
      } else {
        const currentIndex = entries.findIndex((entry) => {
          return entry.uniqueId === action.payload.uniqueSongId;
        });

        state.current = current;
        state.currentIndex = currentIndex;
        state.player1.index = currentIndex;
        state.currentSongId = action.payload.currentSongId;
        state.currentSongUniqueId = action.payload.uniqueSongId;
      }
    },

    appendPlayQueue: (
      state,
      action: PayloadAction<{ entries: Song[]; type: 'next' | 'later' }>
    ) => {
      state.entryVersion += 1;
      const isEmptyQueue = state.entry.length < 1;
      // We'll need to update the uniqueId otherwise selecting a song with duplicates
      // will select them all at once
      const refreshedEntries = action.payload.entries.map((entry) => {
        return {
          ...entry,
          uniqueId: nanoid(),
          playNextBlock: action.payload.type === 'next' ? true : undefined,
        };
      });

      if (action.payload.type === 'later') {
        refreshedEntries.forEach((entry) => state.entry.push(entry));
      } else {
        const currentSongIndex = getCurrentEntryIndexByUID(state.entry, state.currentSongUniqueId);
        let insertIndex = currentSongIndex + 1;
        if (state.preservePlayNextOrder) {
          // Advance past any entries already in the "play next" block
          while (insertIndex < state.entry.length && state.entry[insertIndex].playNextBlock) {
            insertIndex += 1;
          }
        }
        state.entry.splice(insertIndex, 0, ...refreshedEntries);
      }

      if (state.shuffle) {
        // If shuffle is enabled, add all entries randomly
        const shuffledEntries = _.shuffle(refreshedEntries);

        if (isEmptyQueue) {
          state.current = { ...shuffledEntries[0] };
          state.currentSongId = shuffledEntries[0].id;
          state.currentSongUniqueId = shuffledEntries[0].uniqueId;
        }

        if (action.payload.type === 'later') {
          shuffledEntries.forEach((entry) => state.shuffledEntry.push(entry));
        } else {
          let shuffleInsertIndex = state.currentIndex + 1;
          if (state.preservePlayNextOrder) {
            while (
              shuffleInsertIndex < state.shuffledEntry.length &&
              state.shuffledEntry[shuffleInsertIndex].playNextBlock
            ) {
              shuffleInsertIndex += 1;
            }
          }
          state.shuffledEntry.splice(shuffleInsertIndex, 0, ...shuffledEntries);
        }
      } else if (isEmptyQueue) {
        // If shuffle is disabled, add all entries in order
        state.current = { ...refreshedEntries[0] };
        state.currentSongId = refreshedEntries[0].id;
        state.currentSongUniqueId = refreshedEntries[0].uniqueId;
      }
    },

    removeFromPlayQueue: (state, action: PayloadAction<{ entries: Song[] }>) => {
      state.entryVersion += 1;
      const uniqueIds = _.map(action.payload.entries, 'uniqueId');

      state.entry = state.entry.filter((entry) => !uniqueIds.includes(entry.uniqueId));

      state.shuffledEntry = (state.shuffledEntry || []).filter(
        (entry) => !uniqueIds.includes(entry.uniqueId)
      );

      state.sortedEntry = (state.sortedEntry || []).filter(
        (entry) => !uniqueIds.includes(entry.uniqueId)
      );

      // If the current song is removed, reset to the first remaining entry (or clear if empty)
      if (uniqueIds.includes(state.currentSongUniqueId)) {
        const remainingEntries = state.sortColumn
          ? state.sortedEntry
          : state.shuffle
            ? state.shuffledEntry
            : state.entry;

        if (remainingEntries.length === 0) {
          state.current = undefined;
          state.currentSongId = '';
          state.currentSongUniqueId = '';
          resetPlayerDefaults(state);
          return;
        }

        state.current = remainingEntries[0];
        state.currentSongId = remainingEntries[0].id;
        state.currentSongUniqueId = remainingEntries[0].uniqueId;

        if (state.currentPlayer === 1) {
          state.player1.index = 0;
        } else {
          state.player2.index = 0;
        }

        state.currentIndex = 0;
      } else {
        // We'll recalculate the currentSongIndex just in case the existing index was modified
        // due to removing row entries that are before the current song
        const newCurrentSongIndex = getCurrentEntryIndexByUID(
          state.sortColumn ? state.sortedEntry : state.shuffle ? state.shuffledEntry : state.entry,
          state.currentSongUniqueId
        );

        if (state.currentPlayer === 1) {
          state.player1.index = newCurrentSongIndex;
        } else {
          state.player2.index = newCurrentSongIndex;
        }

        state.currentIndex = newCurrentSongIndex;
      }
    },

    clearPlayQueue: (state) => {
      state.entryVersion += 1;
      state.entry = [];
      state.shuffledEntry = [];
      state.current = undefined;
      resetPlayerDefaults(state);
    },

    setIsLoading: (state) => {
      state.isLoading = true;
    },

    setIsLoaded: (state) => {
      state.isLoading = false;
    },

    setIsFading: (state, action: PayloadAction<boolean>) => {
      state.isFading = action.payload;
    },

    moveToIndex: (state, action: PayloadAction<Song[]>) => {
      state.entryVersion += 1;
      const currentEntry = entrySelect(state);

      // Set the modified entries into the redux state
      state[currentEntry] = action.payload;

      // We'll need to fix the current player index after swapping the queue order
      // This will be used in conjunction with fixPlayer2Index
      const newCurrentSongIndex = getCurrentEntryIndexByUID(
        action.payload,
        state.currentSongUniqueId
      );

      if (state.currentPlayer === 1) {
        state.player1.index = newCurrentSongIndex;
      } else {
        state.player2.index = newCurrentSongIndex;
      }

      state.currentIndex = newCurrentSongIndex;
    },

    moveToTop: (state, action: PayloadAction<{ selectedEntries: Song[] }>) => {
      state.entryVersion += 1;
      const currentEntry = entrySelect(state);
      const newQueue = moveSelectedToTop(state[currentEntry], action.payload.selectedEntries);
      state[currentEntry] = newQueue;

      // We'll need to fix the current player index after swapping the queue order
      // This will be used in conjunction with fixPlayer2Index
      const newCurrentSongIndex = getCurrentEntryIndexByUID(newQueue, state.currentSongUniqueId);

      if (state.currentPlayer === 1) {
        state.player1.index = newCurrentSongIndex;
      } else {
        state.player2.index = newCurrentSongIndex;
      }

      state.currentIndex = newCurrentSongIndex;
    },

    moveToBottom: (state, action: PayloadAction<{ selectedEntries: Song[] }>) => {
      state.entryVersion += 1;
      const currentEntry = entrySelect(state);
      const newQueue = moveSelectedToBottom(state[currentEntry], action.payload.selectedEntries);
      state[currentEntry] = newQueue;

      // We'll need to fix the current player index after swapping the queue order
      // This will be used in conjunction with fixPlayer2Index
      const newCurrentSongIndex = getCurrentEntryIndexByUID(newQueue, state.currentSongUniqueId);

      if (state.currentPlayer === 1) {
        state.player1.index = newCurrentSongIndex;
      } else {
        state.player2.index = newCurrentSongIndex;
      }

      state.currentIndex = newCurrentSongIndex;
    },

    moveUp: (state, action: PayloadAction<{ selectedEntries: Song[] }>) => {
      state.entryVersion += 1;
      const currentEntry = entrySelect(state);
      state[currentEntry] = moveSelectedUp(state[currentEntry], action.payload.selectedEntries);

      // We'll need to fix the current player index after swapping the queue order
      // This will be used in conjunction with fixPlayer2Index
      const newCurrentSongIndex = getCurrentEntryIndexByUID(
        state[currentEntry],
        state.currentSongUniqueId
      );

      if (state.currentPlayer === 1) {
        state.player1.index = newCurrentSongIndex;
      } else {
        state.player2.index = newCurrentSongIndex;
      }

      state.currentIndex = newCurrentSongIndex;
    },

    moveDown: (state, action: PayloadAction<{ selectedEntries: Song[] }>) => {
      state.entryVersion += 1;
      const currentEntry = entrySelect(state);
      state[currentEntry] = moveSelectedDown(state[currentEntry], action.payload.selectedEntries);

      // We'll need to fix the current player index after swapping the queue order
      // This will be used in conjunction with fixPlayer2Index
      const newCurrentSongIndex = getCurrentEntryIndexByUID(
        state[currentEntry],
        state.currentSongUniqueId
      );

      if (state.currentPlayer === 1) {
        state.player1.index = newCurrentSongIndex;
      } else {
        state.player2.index = newCurrentSongIndex;
      }

      state.currentIndex = newCurrentSongIndex;
    },

    setStopAfterCurrent: (state, action: PayloadAction<boolean>) => {
      state.stopAfterCurrent = action.payload;
    },

    incrementEntryPlayCount: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const increment = (list: Song[]) => {
        list.forEach((song) => {
          if (song.id === id) song.playCount = (song.playCount || 0) + 1;
        });
      };
      increment(state.entry);
      increment(state.shuffledEntry);
      increment(state.sortedEntry);
      if (state.current?.id === id) {
        state.current = { ...state.current, playCount: (state.current.playCount || 0) + 1 };
      }
    },

    restoreState: (state, action: PayloadAction<PlayQueueSaveState>) => {
      const result = action.payload;

      if (
        !Array.isArray(result.entry) ||
        typeof result.currentIndex !== 'number' ||
        result.currentIndex < 0
      ) {
        return;
      }
      if (!Array.isArray(result.shuffledEntry)) return;
      if (result.currentPlayer !== 1 && result.currentPlayer !== 2) return;
      if (result.currentIndex >= result.entry.length) return;

      state.entry = result.entry;
      state.shuffledEntry = result.shuffledEntry;

      state.current = result.current;
      state.currentIndex = result.currentIndex;
      state.currentSongId = result.currentSongId;
      state.currentSongUniqueId = result.currentSongUniqueId;

      state.player1 = result.player1;
      state.player2 = result.player2;
      state.currentPlayer = result.currentPlayer;
    },
  },
});

export const {
  refreshSettingsFields,
  setPlayerSrc,
  updatePlayerIndices,
  setSort,
  sortPlayQueue,
  incrementCurrentIndex,
  decrementCurrentIndex,
  incrementPlayerIndex,
  setPlayerIndex,
  fixPlayer2Index,
  setCurrentIndex,
  setPlayQueue,
  setPlayQueueByRowClick,
  appendPlayQueue,
  removeFromPlayQueue,
  clearPlayQueue,
  setIsLoading,
  setIsLoaded,
  moveToTop,
  moveToBottom,
  moveUp,
  moveDown,
  moveToIndex,
  setCurrentPlayer,
  setVolume,
  setIsFading,
  setAutoIncremented,
  toggleRepeat,
  toggleShuffle,
  toggleDisplayQueue,
  resetPlayQueue,
  setStar,
  setRate,
  shuffleInPlace,
  setFadeData,
  setPlaybackSetting,
  setStopAfterCurrent,
  incrementEntryPlayCount,
  restoreState,
} = playQueueSlice.actions;
export default playQueueSlice.reducer;
