jest.mock('../api/controller', () => ({
  apiController: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import usePlaylistsCache from '../hooks/usePlaylistsCache';
import { apiController } from '../api/controller';
import configReducer from '../redux/configSlice';
import { Server } from '../types';

const mockApiController = apiController as jest.MockedFunction<typeof apiController>;

function makeStore() {
  return configureStore({
    reducer: { config: configReducer },
    preloadedState: {
      config: { ...configReducer(undefined, { type: '@@INIT' }), serverType: Server.Subsonic },
    },
  });
}

type Store = ReturnType<typeof makeStore>;
const StoreProvider = Provider as React.ComponentType<{ store: Store; children?: React.ReactNode }>;

function renderPlaylistsCache(store: Store) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, { store }, children);
  return renderHook(() => usePlaylistsCache(), { wrapper });
}

type BridgeWindow = Window & {
  bridge: {
    settings: { get: (key: string) => unknown };
    libraryCache: { get: jest.Mock; set: jest.Mock };
  };
};

describe('playlists sync (Fix 4)', () => {
  beforeEach(() => {
    mockApiController.mockReset();
    (window as unknown as BridgeWindow).bridge.settings.get = (key: string) =>
      key === 'server' ? 'http://server' : undefined;
    (window as unknown as BridgeWindow).bridge.libraryCache.get = jest.fn().mockReturnValue(null);
    (window as unknown as BridgeWindow).bridge.libraryCache.set = jest.fn();
  });

  it('stores song id references only, not full song copies', async () => {
    mockApiController.mockImplementation(async ({ endpoint, args }) => {
      if (endpoint === 'getPlaylists') {
        return [{ id: 'pl1', title: 'My Playlist', songCount: 2, duration: 300 }];
      }
      if (endpoint === 'getPlaylist' && args?.id === 'pl1') {
        return {
          id: 'pl1',
          title: 'My Playlist',
          songCount: 2,
          duration: 300,
          song: [
            { id: 'song1', title: 'Song One', album: 'A', artist: [], albumArtist: '' },
            { id: 'song2', title: 'Song Two', album: 'A', artist: [], albumArtist: '' },
          ],
        };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const store = makeStore();
    const { result } = renderPlaylistsCache(store);

    await act(async () => {
      await result.current.syncPlaylists();
    });

    const setMock = (window as unknown as BridgeWindow).bridge.libraryCache.set;
    expect(setMock).toHaveBeenCalledWith(
      'playlistsSnapshot',
      expect.objectContaining({
        playlists: [
          expect.objectContaining({
            id: 'pl1',
            title: 'My Playlist',
            songIds: ['song1', 'song2'],
          }),
        ],
      })
    );
    // Confirm no full song objects (title/album/etc.) leaked into the stored entry.
    const written = setMock.mock.calls[0][1] as { playlists: Record<string, unknown>[] };
    expect(written.playlists[0]).not.toHaveProperty('song');
  });

  it('one failing playlist fetch does not abort syncing the rest', async () => {
    mockApiController.mockImplementation(async ({ endpoint, args }) => {
      if (endpoint === 'getPlaylists') {
        return [
          { id: 'broken', title: 'Broken Playlist', songCount: 0, duration: 0 },
          { id: 'ok', title: 'OK Playlist', songCount: 1, duration: 100 },
        ];
      }
      if (endpoint === 'getPlaylist' && args?.id === 'broken') {
        throw new Error('404 deleted');
      }
      if (endpoint === 'getPlaylist' && args?.id === 'ok') {
        return {
          id: 'ok',
          title: 'OK Playlist',
          songCount: 1,
          duration: 100,
          song: [{ id: 'songA', title: 'Song A', album: 'A', artist: [], albumArtist: '' }],
        };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const store = makeStore();
    const { result } = renderPlaylistsCache(store);

    let syncedCount = 0;
    await act(async () => {
      syncedCount = await result.current.syncPlaylists();
    });

    expect(syncedCount).toBe(1);
    const setMock = (window as unknown as BridgeWindow).bridge.libraryCache.set;
    const written = setMock.mock.calls[0][1] as { playlists: { id: string }[] };
    expect(written.playlists.map((p) => p.id)).toEqual(['ok']);
  });

  it('fetches in concurrent chunks while preserving input order and per-item isolation across chunk boundaries (Fix J)', async () => {
    // 7 playlists forces 2 chunks at CONCURRENCY=5 (5 + 2). One failure lands
    // in each chunk (index 2 and index 5) to confirm a failure in an earlier
    // chunk doesn't affect a later chunk, and that surviving results keep
    // their original relative order rather than resolution order.
    const ids = ['p0', 'p1', 'broken1', 'p3', 'p4', 'broken2', 'p6'];
    mockApiController.mockImplementation(async ({ endpoint, args }) => {
      if (endpoint === 'getPlaylists') {
        return ids.map((id) => ({ id, title: id, songCount: 0, duration: 0 }));
      }
      if (endpoint === 'getPlaylist') {
        if (args?.id === 'broken1' || args?.id === 'broken2') {
          throw new Error('404 deleted');
        }
        // Resolve out of order (later-queued items finish first) to prove
        // final ordering comes from input position, not completion order.
        const delay = args?.id === 'p0' ? 20 : 0;
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
        return { id: args?.id, title: args?.id, songCount: 0, duration: 0, song: [] };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const store = makeStore();
    const { result } = renderPlaylistsCache(store);

    let syncedCount = 0;
    await act(async () => {
      syncedCount = await result.current.syncPlaylists();
    });

    expect(syncedCount).toBe(5);
    const setMock = (window as unknown as BridgeWindow).bridge.libraryCache.set;
    const written = setMock.mock.calls[0][1] as { playlists: { id: string }[] };
    expect(written.playlists.map((p) => p.id)).toEqual(['p0', 'p1', 'p3', 'p4', 'p6']);
  });

  it('getCachedPlaylists reads back the stored snapshot', () => {
    (window as unknown as BridgeWindow).bridge.libraryCache.get = jest.fn().mockReturnValue({
      playlists: [{ id: 'pl1', title: 'Cached', songIds: ['a', 'b'], duration: 10, image: '' }],
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      serverUrl: 'http://server',
    });

    const store = makeStore();
    const { result } = renderPlaylistsCache(store);

    expect(result.current.getCachedPlaylists()).toEqual([
      { id: 'pl1', title: 'Cached', songIds: ['a', 'b'], duration: 10, image: '' },
    ]);
  });

  it('hasPlaylistsCacheForCurrentServer treats zero synced playlists as a valid synced state', () => {
    (window as unknown as BridgeWindow).bridge.libraryCache.get = jest.fn().mockReturnValue({
      playlists: [],
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      serverUrl: 'http://server',
    });

    const store = makeStore();
    const { result } = renderPlaylistsCache(store);

    expect(result.current.hasPlaylistsCacheForCurrentServer()).toBe(true);
  });
});
