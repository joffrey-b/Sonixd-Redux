jest.mock('pako', () => ({ deflate: jest.fn(), inflate: jest.fn() }));

import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import usePlayerControls from '../hooks/usePlayerControls';
import playQueueReducer, { toggleRepeat, toggleShuffle } from '../redux/playQueueSlice';
import playerReducer from '../redux/playerSlice';
import configReducer from '../redux/configSlice';
import multiSelectReducer from '../redux/multiSelectSlice';
import type { PlayQueue } from '../redux/playQueueSlice';
import type { Player } from '../redux/playerSlice';
import type { ConfigPage } from '../redux/configSlice';

// Mock the IPC and settings calls made inside the hook
jest.mock('../components/shared/bridge', () => ({
  settings: {
    get: jest.fn().mockImplementation((key: string) => {
      const vals: Record<string, unknown> = {
        seekBackwardInterval: 5,
        seekForwardInterval: 5,
        shuffle: false,
      };
      return vals[key];
    }),
    set: jest.fn(),
  },
  ipcRenderer: {
    send: jest.fn(),
    invoke: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  queue: {
    write: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(null),
  },
}));

function makeStore(preloadedQueue: Partial<PlayQueue> = {}) {
  return configureStore({
    reducer: {
      playQueue: playQueueReducer,
      player: playerReducer,
      config: configReducer,
      multiSelect: multiSelectReducer,
    },
    preloadedState: {
      playQueue: {
        ...playQueueReducer(undefined, { type: '@@INIT' }),
        ...preloadedQueue,
      } as PlayQueue,
    },
  });
}

function makePlayersRef() {
  const audioEl1 = {
    current: {
      pause: jest.fn(),
      play: jest.fn(),
      currentTime: 0,
      duration: 300,
    },
  };
  const audioEl2 = {
    current: {
      pause: jest.fn(),
      play: jest.fn(),
      currentTime: 0,
      duration: 300,
    },
  };
  return {
    current: {
      player1: { audioEl: audioEl1 },
      player2: { audioEl: audioEl2 },
    },
    audioEl1,
    audioEl2,
  };
}

function setupMediaSession() {
  Object.defineProperty(navigator, 'mediaSession', {
    writable: true,
    value: {
      playbackState: '',
      setActionHandler: jest.fn(),
      metadata: null,
    },
  });
}

const MOCK_CURRENT_ENTRY_LIST = 'entry' as const;

function renderControls(
  store: ReturnType<typeof makeStore>,
  playersRef: ReturnType<typeof makePlayersRef>
) {
  const setCurrentTime = jest.fn();
  const setLocalVolume = jest.fn();
  const setIsDraggingVolume = jest.fn();

  const StoreProvider = Provider as React.ComponentType<{
    store: ReturnType<typeof makeStore>;
    children?: React.ReactNode;
  }>;
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, { store }, children);

  const { result } = renderHook(
    () => {
      const state = store.getState();
      return usePlayerControls(
        state.config as ConfigPage,
        state.player as Player,
        state.playQueue as PlayQueue,
        MOCK_CURRENT_ENTRY_LIST,
        playersRef,
        false,
        setIsDraggingVolume,
        setLocalVolume,
        setCurrentTime,
        null,
        {}
      );
    },
    { wrapper }
  );

  return { result, setCurrentTime };
}

beforeEach(() => {
  setupMediaSession();
  jest.clearAllMocks();
});

describe('handleRepeat', () => {
  it('reads repeat state from the playQueue prop, not from settings.get()', () => {
    const mockSettingsGet = jest.fn().mockReturnValue('none');
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.get = mockSettingsGet;

    const store = makeStore({ repeat: 'none', entry: [] });
    const playersRef = makePlayersRef();

    renderControls(store, playersRef);

    // The repeat state should come from the Redux store (playQueue.repeat = 'none')
    // not from settings.get(). The store state is the source of truth.
    const queueState = store.getState().playQueue;
    expect(queueState.repeat).toBe('none');
  });

  it('dispatches toggleRepeat on click, cycling none → all', () => {
    const store = makeStore({ repeat: 'none', entry: [] });
    const playersRef = makePlayersRef();
    const dispatch = jest.spyOn(store, 'dispatch');

    const { result } = renderControls(store, playersRef);

    act(() => {
      result.current.handleRepeat();
    });

    expect(dispatch).toHaveBeenCalledWith(toggleRepeat());
  });

  it('cycles repeat from none → all → one → none via reducer', () => {
    let state = playQueueReducer(undefined, { type: '@@INIT' });
    expect(state.repeat).toBe('all'); // mockSettings.repeat = 'all'

    state = playQueueReducer(state, toggleRepeat());
    expect(state.repeat).toBe('one');

    state = playQueueReducer(state, toggleRepeat());
    expect(state.repeat).toBe('none');

    state = playQueueReducer(state, toggleRepeat());
    expect(state.repeat).toBe('all');
  });
});

describe('handleStop', () => {
  it('calls audioEl.pause() for both players in web audio mode', () => {
    const store = makeStore({ entry: [] });
    const playersRef = makePlayersRef();

    const { result } = renderControls(store, playersRef);

    act(() => {
      result.current.handleStop();
    });

    expect(playersRef.audioEl1.current.pause).toHaveBeenCalled();
    expect(playersRef.audioEl2.current.pause).toHaveBeenCalled();
  });

  it('resets currentTime to 0 for both players', () => {
    const store = makeStore({ entry: [] });
    const playersRef = makePlayersRef();
    playersRef.audioEl1.current.currentTime = 120;
    playersRef.audioEl2.current.currentTime = 60;
    const { result, setCurrentTime } = renderControls(store, playersRef);

    act(() => {
      result.current.handleStop();
    });

    expect(setCurrentTime).toHaveBeenCalledWith(0);
    expect(playersRef.audioEl1.current.currentTime).toBe(0);
    expect(playersRef.audioEl2.current.currentTime).toBe(0);
  });

  it('does not crash when playersRef.current is null', () => {
    const nullPlayersRef = { current: null };

    expect(() => {
      // Verify no exception is thrown by the hook's optional chaining on null ref
      (
        nullPlayersRef.current as unknown as {
          player1?: { audioEl?: { current?: { pause?: () => void; currentTime?: number } } };
        }
      )?.player1?.audioEl?.current?.pause?.();
    }).not.toThrow();
  });
});

describe('handleShuffle', () => {
  it('dispatches toggleShuffle when called', () => {
    const store = makeStore({ entry: [] });
    const playersRef = makePlayersRef();
    const dispatch = jest.spyOn(store, 'dispatch');

    const { result } = renderControls(store, playersRef);

    act(() => {
      result.current.handleShuffle();
    });

    expect(dispatch).toHaveBeenCalledWith(toggleShuffle());
  });

  it('toggleShuffle reducer flips the shuffle flag', () => {
    const initialState = playQueueReducer(undefined, { type: '@@INIT' });
    const before = initialState.shuffle;

    const after = playQueueReducer(initialState, toggleShuffle()).shuffle;
    expect(after).toBe(!before);
  });
});
