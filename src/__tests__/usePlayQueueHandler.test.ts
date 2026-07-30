jest.mock('../components/shared/toast', () => ({
  notifyToast: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureStore } from '@reduxjs/toolkit';
import usePlayQueueHandler from '../hooks/usePlayQueueHandler';
import { notifyToast } from '../components/shared/toast';
import configReducer from '../redux/configSlice';
import connectivityReducer from '../redux/connectivitySlice';
import cachedSongsReducer, { setCachedSongIds } from '../redux/cachedSongsSlice';
import downloadedSongsReducer from '../redux/downloadedSongsSlice';
import playQueueReducer from '../redux/playQueueSlice';
import playerReducer from '../redux/playerSlice';
import { Item, Play, Server, Song } from '../types';

const mockNotifyToast = notifyToast as jest.Mock;

function makeStore(effectiveOffline = false) {
  return configureStore({
    reducer: {
      config: configReducer,
      connectivity: connectivityReducer,
      cachedSongs: cachedSongsReducer,
      downloadedSongs: downloadedSongsReducer,
      playQueue: playQueueReducer,
      player: playerReducer,
    },
    preloadedState: {
      config: { ...configReducer(undefined, { type: '@@INIT' }), serverType: Server.Subsonic },
      connectivity: { pingConfirmedUnreachable: effectiveOffline, isManuallyForced: false },
      cachedSongs: { songIds: [] },
      downloadedSongs: { songIds: [] },
    },
  });
}

type Store = ReturnType<typeof makeStore>;
const StoreProvider = Provider as React.ComponentType<{ store: Store; children?: React.ReactNode }>;

function renderHandler(store: Store) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      StoreProvider,
      { store },
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    );
  return renderHook(() => usePlayQueueHandler(), { wrapper });
}

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  id: 'song-1',
  title: 'Test Song',
  album: 'Test Album',
  albumId: 'album-1',
  albumArtist: 'Test Artist',
  albumArtistId: 'artist-1',
  artist: [{ id: 'artist-1', title: 'Test Artist' }],
  size: 1000,
  created: '2024-01-01',
  streamUrl: 'http://server/stream/song-1',
  image: '',
  type: Item.Music,
  uniqueId: 'u1',
  ...overrides,
});

describe('skip-unavailable-songs (Fix 7)', () => {
  beforeEach(() => {
    mockNotifyToast.mockReset();
  });

  it('filters out unavailable songs before constructing the queue when offline', async () => {
    const store = makeStore(true);
    store.dispatch(setCachedSongIds(['song-1']));
    const { result } = renderHandler(store);

    const songs = [
      makeSong({ id: 'song-1', uniqueId: 'u1' }),
      makeSong({ id: 'song-2', uniqueId: 'u2' }),
    ];

    await act(async () => {
      await result.current.handlePlayQueueAdd({ byData: songs, play: Play.Play });
    });

    const queueIds = store.getState().playQueue.entry.map((s) => s.id);
    expect(queueIds).toEqual(['song-1']);
  });

  it('treats a downloaded-only song (not cached) as available too (Fix 1: isDownloaded is now real)', async () => {
    const store = makeStore(true);
    store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song-1'] });
    const { result } = renderHandler(store);

    const songs = [
      makeSong({ id: 'song-1', uniqueId: 'u1' }),
      makeSong({ id: 'song-2', uniqueId: 'u2' }),
    ];

    await act(async () => {
      await result.current.handlePlayQueueAdd({ byData: songs, play: Play.Play });
    });

    const queueIds = store.getState().playQueue.entry.map((s) => s.id);
    expect(queueIds).toEqual(['song-1']);
  });

  it('shows the correct N-of-M count in the notice', async () => {
    const store = makeStore(true);
    store.dispatch(setCachedSongIds(['song-1']));
    const { result } = renderHandler(store);

    const songs = [
      makeSong({ id: 'song-1', uniqueId: 'u1' }),
      makeSong({ id: 'song-2', uniqueId: 'u2' }),
      makeSong({ id: 'song-3', uniqueId: 'u3' }),
    ];

    await act(async () => {
      await result.current.handlePlayQueueAdd({ byData: songs, play: Play.Play });
    });

    const warningCall = mockNotifyToast.mock.calls.find((call) => call[0] === 'warning');
    expect(warningCall).toBeDefined();
    expect(warningCall?.[1]).toEqual(expect.stringContaining('2'));
    expect(warningCall?.[1]).toEqual(expect.stringContaining('3'));
  });

  it('shows a distinct message and does not start playback when nothing is available', async () => {
    const store = makeStore(true);
    // No song ids marked as cached at all.
    const { result } = renderHandler(store);

    const songs = [
      makeSong({ id: 'song-1', uniqueId: 'u1' }),
      makeSong({ id: 'song-2', uniqueId: 'u2' }),
    ];

    await act(async () => {
      await result.current.handlePlayQueueAdd({ byData: songs, play: Play.Play });
    });

    expect(store.getState().playQueue.entry).toEqual([]);
    expect(mockNotifyToast).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('None of these tracks are available offline')
    );
    // The generic "Playing N tracks" info toast must not fire when nothing was queued.
    expect(mockNotifyToast).not.toHaveBeenCalledWith('info', expect.any(String));
  });

  it('does not filter anything when online', async () => {
    const store = makeStore(false);
    // Nothing marked as cached -- if the offline filter ran, everything would be skipped.
    const { result } = renderHandler(store);

    const songs = [
      makeSong({ id: 'song-1', uniqueId: 'u1' }),
      makeSong({ id: 'song-2', uniqueId: 'u2' }),
    ];

    await act(async () => {
      await result.current.handlePlayQueueAdd({ byData: songs, play: Play.Play });
    });

    const queueIds = store.getState().playQueue.entry.map((s) => s.id);
    expect(queueIds).toEqual(['song-1', 'song-2']);
    expect(mockNotifyToast).not.toHaveBeenCalledWith('warning', expect.any(String));
  });
});

describe('offline byItemType empty-queue message (Fix G)', () => {
  beforeEach(() => {
    mockNotifyToast.mockReset();
  });

  it('shows the "none available offline" message instead of a generic toast when no onEmpty is given', async () => {
    const store = makeStore(true);
    // No cache snapshot mocked -- getCachedSongs() resolves to [], so this
    // album/artist/playlist request always resolves to zero offline songs.
    const { result } = renderHandler(store);

    await act(async () => {
      await result.current.handlePlayQueueAdd({
        byItemType: { item: Item.Album, id: 'album-1' },
        play: Play.Play,
      });
    });

    expect(store.getState().playQueue.entry).toEqual([]);
    expect(mockNotifyToast).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('None of these tracks are available offline')
    );
    // The generic "Playing 0 tracks" info toast must not fire.
    expect(mockNotifyToast).not.toHaveBeenCalledWith('info', expect.any(String));
  });

  it('calls a caller-supplied onEmpty instead of the default message', async () => {
    const store = makeStore(true);
    const onEmpty = jest.fn();
    const { result } = renderHandler(store);

    await act(async () => {
      await result.current.handlePlayQueueAdd({
        byItemType: { item: Item.Artist, id: 'artist-1', endpoint: 'getSimilarSongs' },
        play: Play.Play,
        onEmpty,
      });
    });

    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(mockNotifyToast).not.toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('None of these tracks are available offline')
    );
  });
});
