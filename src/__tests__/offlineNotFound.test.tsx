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
import AlbumView from '../components/library/AlbumView';
import ArtistView from '../components/library/ArtistView';
import PlaylistView from '../components/playlist/PlaylistView';

type BridgeWindow = Window & {
  bridge: {
    libraryCache: { get: jest.Mock; set: jest.Mock };
  };
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

// Note: a Jest-level test for the row-double-click offline gate (Fix C) was
// attempted here too (render one of these views with a song present in the
// snapshot but not cached, simulate a double-click, assert the toast) but
// dropped -- rsuite's virtualized Table renders zero row content in jsdom
// regardless of a getBoundingClientRect mock, matching this codebase's own
// established limitation (no existing Jest test anywhere exercises
// ListViewTable row rendering/interaction; it's E2E-only). Fix C's actual
// behavioral coverage is in e2e/tests/library/offline-browsing.spec.ts.
describe('offline "not found" state (Fix A)', () => {
  beforeEach(() => {
    // Empty local snapshot -- nothing is ever found, on purpose, for all 3 tests.
    (window as unknown as BridgeWindow).bridge.libraryCache.get = jest.fn((key: string) => {
      if (key === 'cacheSnapshot') return { songs: [], lastSyncedAt: null, serverUrl: null };
      if (key === 'playlistsSnapshot')
        return { playlists: [], lastSyncedAt: null, serverUrl: null };
      return undefined;
    });
  });

  it('AlbumView shows a not-available state instead of crashing when offline and the album is not in the local snapshot', () => {
    expect(() => renderOffline(<AlbumView id="nonexistent-album-id" />)).not.toThrow();
    expect(screen.getByText('Album not found.')).toBeInTheDocument();
  });

  it('PlaylistView shows the same for a missing playlist', () => {
    expect(() => renderOffline(<PlaylistView id="nonexistent-playlist-id" />)).not.toThrow();
    expect(screen.getByText('Playlist not found.')).toBeInTheDocument();
  });

  it('ArtistView shows the same for a missing artist', () => {
    expect(() => renderOffline(<ArtistView id="nonexistent-artist-id" />)).not.toThrow();
    expect(screen.getByText('Artist not found.')).toBeInTheDocument();
  });
});
