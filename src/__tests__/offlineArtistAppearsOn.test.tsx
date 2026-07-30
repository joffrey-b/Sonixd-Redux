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

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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

// Fix L: compilation ("appears on") albums are never reconstructed offline --
// without an explicit note, this section just silently disappears, identical
// to an artist that genuinely has zero appears-on credits when online.
describe('offline "Appears On" explanatory note (Fix L)', () => {
  beforeEach(() => {
    (window as unknown as BridgeWindow).bridge.libraryCache.get = jest.fn((key: string) => {
      if (key === 'cacheSnapshot')
        return { songs: [testSong], lastSyncedAt: '2020-01-01T00:00:00.000Z', serverUrl: 'x' };
      if (key === 'playlistsSnapshot')
        return { playlists: [], lastSyncedAt: null, serverUrl: null };
      return undefined;
    });
  });

  it('shows a "not available offline" note instead of silently omitting the section', () => {
    renderOffline(<ArtistView id="artist1" />);

    expect(screen.getByText('Not available offline.')).toBeInTheDocument();
  });
});
