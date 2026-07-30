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

jest.mock('../api/controller', () => ({
  apiController: jest.fn(),
}));

// Real regression coverage for the bug: capture exactly what AlbumView hands
// to the track-list table, in order, rather than stubbing it out to null
// (as bulkDownloadButtons.test.tsx does for its own, unrelated concern) --
// rsuite-table itself can't render real rows in jsdom, but the plain array
// of songs AlbumView computes and passes down is exactly what was wrong.
jest.mock('../components/viewtypes/ListViewType', () => ({
  __esModule: true,
  default: ({ data }: { data: Array<{ title: string }> }) => (
    <ul data-testid="captured-track-order">
      {data.map((song) => (
        <li key={song.title}>{song.title}</li>
      ))}
    </ul>
  ),
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
import { Item } from '../types';

type BridgeWindow = Window & {
  bridge: { libraryCache: { get: jest.Mock; set: jest.Mock } };
};

const bridgeWindow = () => window as unknown as BridgeWindow;

const makeSong = (title: string, track: number, discNumber = 1) => ({
  id: title,
  title,
  isDir: false,
  album: 'Test Album',
  albumId: 'album1',
  albumArtist: 'Test Artist',
  albumArtistId: 'artist1',
  artist: [{ id: 'artist1', title: 'Test Artist' }],
  track,
  discNumber,
  year: 2020,
  genre: [],
  albumGenre: [],
  size: 1000,
  contentType: 'audio/flac',
  suffix: 'flac',
  duration: 180,
  bitRate: 320,
  path: `Test Artist/Test Album/${track} ${title}.flac`,
  playCount: 0,
  created: '2020-01-01T00:00:00.000Z',
  streamUrl: `https://server/stream.view?id=${title}`,
  image: 'https://server/cover.jpg',
  starred: false,
  type: Item.Music,
});

function renderOfflineAlbumView(songs: ReturnType<typeof makeSong>[]) {
  (bridgeWindow().bridge.libraryCache.get as jest.Mock) = jest.fn((key: string) => {
    if (key === 'cacheSnapshot') {
      return { songs, lastSyncedAt: '2020-01-01T00:00:00.000Z', serverUrl: 'x' };
    }
    if (key === 'playlistsSnapshot') return { playlists: [], lastSyncedAt: null, serverUrl: null };
    return undefined;
  });

  const store = configureStore({
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
  const queryClient = new QueryClient();
  render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AlbumView id="album1" />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

describe('AlbumView offline track order', () => {
  it('sorts the offline track list by track number, regardless of the cache snapshot order', async () => {
    // Deliberately scrambled relative to track number -- reproduces the bug
    // as reported: browsing an album offline showed songs out of order.
    const songs = [makeSong('Track Three', 3), makeSong('Track One', 1), makeSong('Track Two', 2)];

    renderOfflineAlbumView(songs);

    const list = await screen.findByTestId('captured-track-order');
    expect(Array.from(list.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Track One',
      'Track Two',
      'Track Three',
    ]);
  });

  it('sorts by disc number first, then track number, for multi-disc albums', async () => {
    const songs = [
      makeSong('Disc 2 Track 1', 1, 2),
      makeSong('Disc 1 Track 2', 2, 1),
      makeSong('Disc 1 Track 1', 1, 1),
      makeSong('Disc 2 Track 2', 2, 2),
    ];

    renderOfflineAlbumView(songs);

    const list = await screen.findByTestId('captured-track-order');
    expect(Array.from(list.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Disc 1 Track 1',
      'Disc 1 Track 2',
      'Disc 2 Track 1',
      'Disc 2 Track 2',
    ]);
  });
});
