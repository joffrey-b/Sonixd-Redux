jest.mock('electron', () => ({
  ipcRenderer: {
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    send: jest.fn(),
    sendSync: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
  },
  webFrame: {
    setZoomFactor: jest.fn(),
    setZoomLevel: jest.fn(),
    getZoomFactor: jest.fn(),
    getZoomLevel: jest.fn(),
  },
  shell: { openExternal: jest.fn(), showItemInFolder: jest.fn(), openPath: jest.fn() },
  clipboard: { writeText: jest.fn(), readText: jest.fn() },
}));

const mockSubmitFavoriteWithQueueFallback = jest.fn();
jest.mock('../shared/offlineSubmission', () => ({
  submitFavoriteWithQueueFallback: (...args: unknown[]) =>
    mockSubmitFavoriteWithQueueFallback(...args),
}));

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureStore } from '@reduxjs/toolkit';
import playerReducer from '../redux/playerSlice';
import playQueueReducer from '../redux/playQueueSlice';
import multiSelectReducer from '../redux/multiSelectSlice';
import miscReducer from '../redux/miscSlice';
import playlistReducer from '../redux/playlistSlice';
import folderReducer from '../redux/folderSlice';
import configReducer from '../redux/configSlice';
import favoriteReducer from '../redux/favoriteSlice';
import artistReducer from '../redux/artistSlice';
import viewReducer from '../redux/viewSlice';
import eqReducer from '../redux/eqSlice';
import peqReducer from '../redux/peqSlice';
import smartPlaylistReducer from '../redux/smartPlaylistSlice';
import jukeboxReducer from '../redux/jukeboxSlice';
import connectivityReducer from '../redux/connectivitySlice';
import cachedSongsReducer from '../redux/cachedSongsSlice';
import downloadedSongsReducer from '../redux/downloadedSongsSlice';
import downloadProgressReducer from '../redux/downloadProgressSlice';
import AlbumView from '../components/library/AlbumView';
import ArtistView from '../components/library/ArtistView';
import { Item } from '../types';
import type { LibraryCacheSong } from '../components/shared/libraryCache';

type BridgeWindow = Window & {
  bridge: {
    libraryCache: { get: jest.Mock; set: jest.Mock };
  };
};

const testSong: LibraryCacheSong = {
  id: 'song1',
  title: 'Test Song',
  isDir: false,
  album: 'Test Album',
  albumId: 'album1',
  albumArtist: 'Test Artist',
  albumArtistId: 'artist1',
  artist: [{ id: 'artist1', title: 'Test Artist' }],
  track: 1,
  year: 2020,
  genre: [],
  size: 1000,
  contentType: 'audio/mpeg',
  suffix: 'mp3',
  duration: 180,
  bitRate: 320,
  path: 'Test Artist/Test Album/01 Test Song.mp3',
  playCount: 0,
  discNumber: 1,
  created: '2020-01-01T00:00:00.000Z',
  streamUrl: 'http://example.com/stream',
  image: 'http://example.com/image.jpg',
  starred: false,
  type: Item.Music,
};

function makeOfflineStore() {
  return configureStore({
    reducer: {
      player: playerReducer,
      playQueue: playQueueReducer,
      multiSelect: multiSelectReducer,
      misc: miscReducer,
      playlist: playlistReducer,
      folder: folderReducer,
      config: configReducer,
      favorite: favoriteReducer,
      artist: artistReducer,
      view: viewReducer,
      eq: eqReducer,
      peq: peqReducer,
      smartPlaylist: smartPlaylistReducer,
      jukebox: jukeboxReducer,
      connectivity: connectivityReducer,
      cachedSongs: cachedSongsReducer,
      downloadedSongs: downloadedSongsReducer,
      downloadProgress: downloadProgressReducer,
    },
    preloadedState: {
      connectivity: { pingConfirmedUnreachable: true, isManuallyForced: false },
    },
  });
}

function renderOffline(ui: React.ReactElement) {
  const store = makeOfflineStore();
  const queryClient = new QueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

// Fix E: buildAlbumsFromSongs/buildArtistsFromSongs never set starred/userRating
// (album/artist-level starred data isn't captured by the existing library sync --
// only per-song starred is synced) -- so a reconstructed offline Album/Artist's
// `starred` is always undefined, which would otherwise make the Favorite toggle
// always compute `favorite = true` regardless of the item's real state. Rather
// than let that fire a possibly-wrong star mutation, the header Favorite controls
// are disabled (with an explanatory tooltip) whenever effectiveOffline is true.
describe('offline favorite-toggle gate (Fix E)', () => {
  beforeEach(() => {
    mockSubmitFavoriteWithQueueFallback.mockClear();
    (window as unknown as BridgeWindow).bridge.libraryCache.get = jest.fn((key: string) => {
      if (key === 'cacheSnapshot')
        return { songs: [testSong], lastSyncedAt: '2020-01-01T00:00:00.000Z', serverUrl: 'x' };
      if (key === 'playlistsSnapshot')
        return { playlists: [], lastSyncedAt: null, serverUrl: null };
      return undefined;
    });
  });

  it('disables the AlbumView header Favorite button offline and does not submit a mutation on click for either favorite control', () => {
    renderOffline(<AlbumView id="album1" />);

    // Two "Add to favorites" affordances render for this one album: the
    // always-visible toolbar FavoriteButton (disabled outright offline) and
    // the header Card's hover-only overlay button (its click swapped for an
    // informational toast instead of a real mutation) -- both must be safe.
    const favoriteButtons = screen.getAllByLabelText('Add to favorites');
    expect(favoriteButtons.length).toBeGreaterThanOrEqual(2);
    expect(favoriteButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);

    favoriteButtons.forEach((btn) => fireEvent.click(btn));
    expect(mockSubmitFavoriteWithQueueFallback).not.toHaveBeenCalled();
  });

  it('disables the ArtistView header Favorite button offline and does not submit a mutation on click for either favorite control', () => {
    renderOffline(<ArtistView id="artist1" />);

    const favoriteButtons = screen.getAllByLabelText('Add to favorites');
    expect(favoriteButtons.length).toBeGreaterThanOrEqual(2);
    expect(favoriteButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);

    favoriteButtons.forEach((btn) => fireEvent.click(btn));
    expect(mockSubmitFavoriteWithQueueFallback).not.toHaveBeenCalled();
  });
});
