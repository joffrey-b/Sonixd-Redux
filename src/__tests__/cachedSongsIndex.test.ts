import React from 'react';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import useCachedSongsIndex, { fileNamesToSongIds } from '../hooks/useCachedSongsIndex';
import cachedSongsReducer, {
  setCachedSongIds,
  addCachedSongId,
  isCachedLocally,
  selectCachedSongIdSet,
} from '../redux/cachedSongsSlice';

type IpcListener = (...args: unknown[]) => void;

function makeStore() {
  return configureStore({ reducer: { cachedSongs: cachedSongsReducer } });
}

type Store = ReturnType<typeof makeStore>;
const StoreProvider = Provider as React.ComponentType<{ store: Store; children?: React.ReactNode }>;

function renderIndex(store: Store, enabled = true) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, { store }, children);
  return renderHook(() => useCachedSongsIndex(enabled), { wrapper });
}

type BridgeWindow = Window & {
  bridge: {
    settings: { get: (key: string) => unknown };
    cacheDir: { list: jest.Mock };
    ipcRenderer: {
      on: jest.Mock;
      removeListener: jest.Mock;
    };
  };
};

describe('fileNamesToSongIds (Fix 1)', () => {
  it('strips the extension to recover the song id', () => {
    expect(fileNamesToSongIds(['abc123.mp3', 'def456.flac'])).toEqual(['abc123', 'def456']);
  });

  it('filters out in-progress TEMP_ downloads', () => {
    expect(fileNamesToSongIds(['abc123.mp3', 'TEMP_xyz789.mp3'])).toEqual(['abc123']);
  });

  it('returns an empty array for an empty listing', () => {
    expect(fileNamesToSongIds([])).toEqual([]);
  });
});

describe('cached-songs index (Fix 1)', () => {
  beforeEach(() => {
    (window as unknown as BridgeWindow).bridge.settings.get = (key: string) =>
      key === 'server' || key === 'serverBase64' ? 'configured' : undefined;
    (window as unknown as BridgeWindow).bridge.cacheDir.list = jest.fn().mockResolvedValue([]);
  });

  it('populates from a single directory-listing call at startup, not per-song IPC checks', async () => {
    const listMock = jest.fn().mockResolvedValue(['song1.mp3', 'song2.flac', 'TEMP_song3.mp3']);
    (window as unknown as BridgeWindow).bridge.cacheDir.list = listMock;

    const store = makeStore();
    renderIndex(store);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listMock).toHaveBeenCalledTimes(1);
    expect([...store.getState().cachedSongs.songIds].sort()).toEqual(['song1', 'song2']);
  });

  it('does not list the cache directory before a server is configured', async () => {
    (window as unknown as BridgeWindow).bridge.settings.get = () => undefined;
    const listMock = jest.fn().mockResolvedValue([]);
    (window as unknown as BridgeWindow).bridge.cacheDir.list = listMock;

    const store = makeStore();
    renderIndex(store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listMock).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const listMock = jest.fn().mockResolvedValue(['song1.mp3']);
    (window as unknown as BridgeWindow).bridge.cacheDir.list = listMock;

    const store = makeStore();
    renderIndex(store, false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listMock).not.toHaveBeenCalled();
  });

  it('adds a song id the moment a cache write succeeds, without needing a restart', () => {
    const store = makeStore();
    store.dispatch(setCachedSongIds(['existing1']));

    store.dispatch(addCachedSongId('freshlyCached'));

    expect(store.getState().cachedSongs.songIds).toEqual(['existing1', 'freshlyCached']);
  });

  it('does not add a duplicate id if it is already present', () => {
    const store = makeStore();
    store.dispatch(setCachedSongIds(['existing1']));

    store.dispatch(addCachedSongId('existing1'));

    expect(store.getState().cachedSongs.songIds).toEqual(['existing1']);
  });

  it('isCachedLocally returns a synchronous, in-memory result (no IPC per call)', () => {
    const set = new Set(['abc123']);
    expect(isCachedLocally('abc123', set)).toBe(true);
    expect(isCachedLocally('nonexistent', set)).toBe(false);
  });

  it('selectCachedSongIdSet builds a Set usable for O(1) lookups', () => {
    const store = makeStore();
    store.dispatch(setCachedSongIds(['a', 'b', 'c']));

    const set = selectCachedSongIdSet(store.getState());

    expect(set).toBeInstanceOf(Set);
    expect(set.has('b')).toBe(true);
    expect(set.has('z')).toBe(false);
  });
});

describe('cached-songs eviction tracking (Fix D)', () => {
  beforeEach(() => {
    // No server configured -- keeps the startup population effect (Fix 1) from
    // firing and overwriting the manually-dispatched songIds below with its own
    // (mocked) empty listing; this test targets the second, eviction-tracking
    // effect only, which has no such dependency.
    (window as unknown as BridgeWindow).bridge.settings.get = () => undefined;
    (window as unknown as BridgeWindow).bridge.cacheDir.list = jest.fn().mockResolvedValue([]);
    (window as unknown as BridgeWindow).bridge.ipcRenderer.on = jest.fn();
    (window as unknown as BridgeWindow).bridge.ipcRenderer.removeListener = jest.fn();
  });

  it('removes a song id from the index when it is evicted from the cache', async () => {
    const onMock = (window as unknown as BridgeWindow).bridge.ipcRenderer.on;

    const store = makeStore();
    store.dispatch(setCachedSongIds(['keep1', 'evictedSong']));

    renderIndex(store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onMock).toHaveBeenCalledWith('cache-files-evicted', expect.any(Function));
    const listener = onMock.mock.calls.find(
      (call: unknown[]) => call[0] === 'cache-files-evicted'
    )?.[1] as IpcListener;

    listener(undefined, ['evictedSong.mp3']);

    expect(store.getState().cachedSongs.songIds).toEqual(['keep1']);
  });

  it('removing the listener on unmount does not throw and no-ops further events', async () => {
    const onMock = (window as unknown as BridgeWindow).bridge.ipcRenderer.on;
    const removeListenerMock = (window as unknown as BridgeWindow).bridge.ipcRenderer
      .removeListener;

    const store = makeStore();
    store.dispatch(setCachedSongIds(['keep1']));

    const { unmount } = renderIndex(store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    unmount();

    expect(removeListenerMock).toHaveBeenCalledWith('cache-files-evicted', expect.any(Function));

    const listener = onMock.mock.calls.find(
      (call: unknown[]) => call[0] === 'cache-files-evicted'
    )?.[1] as IpcListener;
    expect(() => listener(undefined, ['keep1.mp3'])).not.toThrow();
  });
});
