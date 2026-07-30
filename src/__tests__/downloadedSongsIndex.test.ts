import React from 'react';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import useDownloadedSongsIndex from '../hooks/useDownloadedSongsIndex';
import downloadedSongsReducer from '../redux/downloadedSongsSlice';
import { getDownloadedPath } from '../shared/downloadedPathIndex';

function makeStore() {
  return configureStore({ reducer: { downloadedSongs: downloadedSongsReducer } });
}

type Store = ReturnType<typeof makeStore>;
const StoreProvider = Provider as React.ComponentType<{ store: Store; children?: React.ReactNode }>;

function renderIndex(store: Store, enabled = true) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, { store }, children);
  return renderHook(() => useDownloadedSongsIndex(enabled), { wrapper });
}

type BridgeWindow = Window & {
  bridge: {
    settings: { get: (key: string) => unknown };
    recovery: { read: jest.Mock };
  };
};

describe('downloaded-songs index (Fix 1)', () => {
  beforeEach(() => {
    (window as unknown as BridgeWindow).bridge.settings.get = (key: string) =>
      key === 'server' || key === 'serverBase64' ? 'configured' : undefined;
    (window as unknown as BridgeWindow).bridge.recovery.read = jest.fn().mockResolvedValue(null);
  });

  it('populates from a single manifest read at startup, not per-song IPC checks', async () => {
    const manifest = {
      song1: {
        path: '/downloads/a.flac',
        artist: 'A',
        album: 'B',
        title: 'T',
        ext: 'flac',
        size: 1,
      },
      song2: {
        path: '/downloads/b.flac',
        artist: 'A',
        album: 'B',
        title: 'T2',
        ext: 'flac',
        size: 2,
      },
    };
    const readMock = jest.fn().mockResolvedValue(JSON.stringify(manifest));
    (window as unknown as BridgeWindow).bridge.recovery.read = readMock;

    const store = makeStore();
    renderIndex(store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readMock).toHaveBeenCalledTimes(1);
    expect([...store.getState().downloadedSongs.songIds].sort()).toEqual(['song1', 'song2']);
    // The full path index (used by resolveSongPlaybackSource) is populated too.
    expect(getDownloadedPath('song1')).toBe('/downloads/a.flac');
    expect(getDownloadedPath('song2')).toBe('/downloads/b.flac');
  });

  it('does not read the manifest before a server is configured', async () => {
    (window as unknown as BridgeWindow).bridge.settings.get = () => undefined;
    const readMock = jest.fn().mockResolvedValue(null);
    (window as unknown as BridgeWindow).bridge.recovery.read = readMock;

    const store = makeStore();
    renderIndex(store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readMock).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const readMock = jest.fn().mockResolvedValue(JSON.stringify({}));
    (window as unknown as BridgeWindow).bridge.recovery.read = readMock;

    const store = makeStore();
    renderIndex(store, false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readMock).not.toHaveBeenCalled();
  });

  it('fails safe to "nothing downloaded" when the manifest read rejects', async () => {
    (window as unknown as BridgeWindow).bridge.recovery.read = jest
      .fn()
      .mockRejectedValue(new Error('disk error'));

    const store = makeStore();
    renderIndex(store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState().downloadedSongs.songIds).toEqual([]);
  });
});
