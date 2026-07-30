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

// rsuite-table's virtualized Table (rendered by ListViewType) drives a
// resize-measurement effect loop in jsdom once real row data is present,
// a known jsdom/rsuite-table incompatibility documented in Phase 3's own
// findings ("renders zero row content in jsdom"). This test's actual concern
// is the Download/Delete button -> useBulkDownload -> bridge chain, not the
// track-list table rendering, so it's stubbed out here rather than worked
// around per-row -- the button toolbar (header) still renders normally.
jest.mock('../components/viewtypes/ListViewType', () => () => null);
jest.mock('../components/viewtypes/GridViewType', () => () => null);

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
import { apiController } from '../api/controller';
import { mockSettings } from '../shared/mockSettings';
import { Item, Server } from '../types';

const mockApiController = apiController as jest.MockedFunction<typeof apiController>;

type BridgeWindow = Window & {
  bridge: {
    libraryCache: { get: jest.Mock; set: jest.Mock };
    recovery: { read: jest.Mock; write: jest.Mock };
    downloadDir: {
      ensureDir: jest.Mock;
      exists: jest.Mock;
      removeIfExists: jest.Mock;
      commit: jest.Mock;
      removeFile: jest.Mock;
      removeDirIfEmpty: jest.Mock;
    };
  };
};

const bridgeWindow = () => window as unknown as BridgeWindow;

const makeSong = (id: string) => ({
  id,
  uniqueId: `unique-${id}`,
  type: Item.Music,
  title: `Song ${id}`,
  suffix: 'flac',
  track: 1,
  album: 'Test Album',
  albumId: 'album1',
  albumArtist: 'Test Artist',
  albumArtistId: 'artist1',
  artist: [{ id: 'artist1', title: 'Test Artist' }],
  image: 'https://server/cover.jpg',
  streamUrl: 'https://server/stream.view?id=' + id,
  parent: 'album1',
});

const testSongs = [makeSong('song1'), makeSong('song2')];

function makeStore() {
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
      config: { ...configReducer(undefined, { type: '@@INIT' }), serverType: Server.Subsonic },
      // Online (effectiveOffline: false) -- the Download button is disabled
      // offline (a network action), so a real click test needs the online path.
      connectivity: { pingConfirmedUnreachable: false, isManuallyForced: false },
    },
  });
}

function renderView(ui: React.ReactElement) {
  const store = makeStore();
  const queryClient = new QueryClient();
  render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
  return store;
}

describe('bulk download/delete buttons (Fix 5)', () => {
  const originalDownloadPath = mockSettings.downloadPath;

  beforeEach(() => {
    mockApiController.mockClear();
    mockSettings.downloadPath = '/downloads';
    (bridgeWindow().bridge.libraryCache.get as jest.Mock) = jest.fn().mockReturnValue(undefined);
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(null);
    bridgeWindow().bridge.recovery.write = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.ensureDir = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.exists = jest.fn().mockResolvedValue(false);
    bridgeWindow().bridge.downloadDir.removeIfExists = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.commit = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.removeFile = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.removeDirIfEmpty = jest.fn().mockResolvedValue(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
  });

  afterEach(() => {
    mockSettings.downloadPath = originalDownloadPath;
  });

  it('AlbumView: Download fans out per-song downloads for the whole album', async () => {
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getAlbum') {
        return { id: 'album1', title: 'Test Album', song: testSongs, image: '' };
      }
      if (options.endpoint === 'getDownloadUrl') return 'https://server/download.view?id=x';
      return null;
    });

    const store = renderView(<AlbumView id="album1" />);

    const downloadButton = await screen.findByTestId('download-action-download');
    expect(downloadButton).not.toBeDisabled();
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect([...store.getState().downloadedSongs.songIds].sort()).toEqual(['song1', 'song2']);
    });
    expect(bridgeWindow().bridge.downloadDir.commit).toHaveBeenCalled();
  });

  it('AlbumView: Delete removes everything downloaded for the album', async () => {
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getAlbum') {
        return { id: 'album1', title: 'Test Album', song: testSongs, image: '' };
      }
      return null;
    });
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(
      JSON.stringify({
        song1: {
          path: '/downloads/A/B/1.flac',
          artist: 'A',
          album: 'B',
          albumId: 'album1',
          title: 'S1',
          ext: 'flac',
          size: 1,
        },
        song2: {
          path: '/downloads/A/B/2.flac',
          artist: 'A',
          album: 'B',
          albumId: 'album1',
          title: 'S2',
          ext: 'flac',
          size: 1,
        },
      })
    );

    const store = renderView(<AlbumView id="album1" />);
    act(() => {
      store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1', 'song2'] });
    });

    const removeButton = await screen.findByTestId('download-action-remove-offline');
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(store.getState().downloadedSongs.songIds).toEqual([]);
    });
    expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledTimes(2);
  });

  it('ArtistView: Download fans out per-song downloads for every song by the artist', async () => {
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getArtist') {
        return { id: 'artist1', title: 'Test Artist', album: [], starred: undefined };
      }
      if (options.endpoint === 'getArtistSongs') return testSongs;
      if (options.endpoint === 'getDownloadUrl') return 'https://server/download.view?id=x';
      return null;
    });

    const store = renderView(<ArtistView id="artist1" />);

    const downloadButton = await screen.findByTestId('download-action-download');
    expect(downloadButton).not.toBeDisabled();
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect([...store.getState().downloadedSongs.songIds].sort()).toEqual(['song1', 'song2']);
    });
  });

  // Audit fix (finding 2.1): the ADR's one genuinely new, destructive button
  // had zero direct click-test coverage on 2 of 3 view types -- only
  // AlbumView's Delete was tested. Mirrors that test exactly, for ArtistView.
  it('ArtistView: Delete removes everything downloaded for the artist', async () => {
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getArtist') {
        return { id: 'artist1', title: 'Test Artist', album: [], starred: undefined };
      }
      if (options.endpoint === 'getArtistSongs') return testSongs;
      return null;
    });
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(
      JSON.stringify({
        song1: {
          path: '/downloads/A/B/1.flac',
          artist: 'A',
          album: 'B',
          albumId: 'album1',
          title: 'S1',
          ext: 'flac',
          size: 1,
        },
        song2: {
          path: '/downloads/A/B/2.flac',
          artist: 'A',
          album: 'B',
          albumId: 'album1',
          title: 'S2',
          ext: 'flac',
          size: 1,
        },
      })
    );

    const store = renderView(<ArtistView id="artist1" />);
    act(() => {
      store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1', 'song2'] });
    });

    const removeButton = await screen.findByTestId('download-action-remove-offline');
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(store.getState().downloadedSongs.songIds).toEqual([]);
    });
    expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledTimes(2);
  });

  it('PlaylistView: Download fans out per-song downloads for the whole playlist', async () => {
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getPlaylist') {
        return { id: 'playlist1', name: 'Test Playlist', song: testSongs, comment: '', owner: '' };
      }
      if (options.endpoint === 'getDownloadUrl') return 'https://server/download.view?id=x';
      return null;
    });

    const store = renderView(<PlaylistView id="playlist1" />);

    const downloadButton = await screen.findByTestId('download-action-download');
    expect(downloadButton).not.toBeDisabled();
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect([...store.getState().downloadedSongs.songIds].sort()).toEqual(['song1', 'song2']);
    });
  });

  // Audit fix (finding 2.1): same gap as ArtistView above, for PlaylistView --
  // the ADR's genuinely new destructive button had zero direct click-test
  // coverage here either.
  it('PlaylistView: Delete removes everything downloaded for the playlist', async () => {
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getPlaylist') {
        return { id: 'playlist1', name: 'Test Playlist', song: testSongs, comment: '', owner: '' };
      }
      return null;
    });
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(
      JSON.stringify({
        song1: {
          path: '/downloads/A/B/1.flac',
          artist: 'A',
          album: 'B',
          albumId: 'album1',
          title: 'S1',
          ext: 'flac',
          size: 1,
        },
        song2: {
          path: '/downloads/A/B/2.flac',
          artist: 'A',
          album: 'B',
          albumId: 'album1',
          title: 'S2',
          ext: 'flac',
          size: 1,
        },
      })
    );

    const store = renderView(<PlaylistView id="playlist1" />);
    act(() => {
      store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1', 'song2'] });
    });

    const removeButton = await screen.findByTestId('download-action-remove-offline');
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(store.getState().downloadedSongs.songIds).toEqual([]);
    });
    expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledTimes(2);
  });

  it('one song failing does not abort the rest of the batch (AlbumView)', async () => {
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getAlbum') {
        return { id: 'album1', title: 'Test Album', song: testSongs, image: '' };
      }
      if (options.endpoint === 'getDownloadUrl') return 'https://server/download.view?id=x';
      return null;
    });
    (global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: false,
      status: 500,
    }));
    let callCount = 0;
    bridgeWindow().bridge.downloadDir.commit = jest.fn().mockImplementation(async () => {
      callCount += 1;
    });
    (global.fetch as jest.Mock).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return { ok: false, status: 500 };
      return { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    });

    const store = renderView(<AlbumView id="album1" />);
    const downloadButton = await screen.findByTestId('download-action-download');
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(store.getState().downloadedSongs.songIds.length).toBe(1);
    });
  });

  it('the Download button is disabled while effectively offline', async () => {
    const cachedSong = {
      id: 'song1',
      title: 'Song song1',
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
      suffix: 'flac',
      duration: 180,
      bitRate: 320,
      path: 'Test Artist/Test Album/01 Song.flac',
      playCount: 0,
      discNumber: 1,
      created: '2020-01-01T00:00:00.000Z',
      streamUrl: 'https://server/stream.view?id=song1',
      image: 'https://server/cover.jpg',
      starred: false,
      type: Item.Music,
    };
    (bridgeWindow().bridge.libraryCache.get as jest.Mock) = jest.fn((key: string) => {
      if (key === 'cacheSnapshot')
        return { songs: [cachedSong], lastSyncedAt: '2020-01-01T00:00:00.000Z', serverUrl: 'x' };
      if (key === 'playlistsSnapshot')
        return { playlists: [], lastSyncedAt: null, serverUrl: null };
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

    const downloadButton = await screen.findByTestId('download-action-download');
    expect(downloadButton).toBeDisabled();
  });

  // Audit fix (Section 3 finding): this exact gating check ("effectiveOffline
  // forces isLoading/isError to false, drives the offline data path, and
  // disables Download") was previously only exercised for AlbumView -- same
  // view-scoping gap as finding 2.1, smaller consequence since Download
  // (unlike Delete) is non-destructive.
  it('ArtistView: the Download button is disabled while effectively offline', async () => {
    // ArtistView's offline data path (offlineArtistSongs/offlineData) only
    // renders once a cached song matching this artistId actually exists --
    // an empty cache would leave `data` undefined and the button never
    // mounts at all, same requirement AlbumView's own equivalent test above
    // satisfies with its own matching cachedSong.
    const cachedArtistSong = {
      id: 'song1',
      title: 'Song song1',
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
      suffix: 'flac',
      duration: 180,
      bitRate: 320,
      path: 'Test Artist/Test Album/01 Song.flac',
      playCount: 0,
      discNumber: 1,
      created: '2020-01-01T00:00:00.000Z',
      streamUrl: 'https://server/stream.view?id=song1',
      image: 'https://server/cover.jpg',
      starred: false,
      type: Item.Music,
    };
    (bridgeWindow().bridge.libraryCache.get as jest.Mock) = jest.fn((key: string) => {
      if (key === 'cacheSnapshot')
        return {
          songs: [cachedArtistSong],
          lastSyncedAt: '2020-01-01T00:00:00.000Z',
          serverUrl: 'x',
        };
      if (key === 'playlistsSnapshot')
        return { playlists: [], lastSyncedAt: null, serverUrl: null };
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
            <ArtistView id="artist1" />
          </MemoryRouter>
        </QueryClientProvider>
      </Provider>
    );

    const downloadButton = await screen.findByTestId('download-action-download');
    expect(downloadButton).toBeDisabled();
  });

  it('PlaylistView: the Download button is disabled while effectively offline', async () => {
    (bridgeWindow().bridge.libraryCache.get as jest.Mock) = jest.fn((key: string) => {
      if (key === 'cacheSnapshot')
        return { songs: [], lastSyncedAt: '2020-01-01T00:00:00.000Z', serverUrl: 'x' };
      if (key === 'playlistsSnapshot')
        return {
          playlists: [{ id: 'playlist1', title: 'Test Playlist', image: '', songIds: [] }],
          lastSyncedAt: '2020-01-01T00:00:00.000Z',
          serverUrl: 'x',
        };
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
            <PlaylistView id="playlist1" />
          </MemoryRouter>
        </QueryClientProvider>
      </Provider>
    );

    const downloadButton = await screen.findByTestId('download-action-download');
    expect(downloadButton).toBeDisabled();
  });

  // Audit fix (finding 1.3): unit-level confirmation of the mutual-exclusion
  // guard alongside the e2e reproduction in offline-downloads.spec.ts -- a
  // second bulk operation started while downloadProgress.inProgress is
  // already true is rejected outright, not raced.
  it('a second bulk operation cannot start while one is already in progress', async () => {
    // testSongs has 2 songs, both within the same CONCURRENCY=5 chunk, so
    // both call getDownloadUrl concurrently -- collect every resolver rather
    // than a single one, or resolving only the last-captured one would leave
    // an earlier song's own promise (and thus the whole batch) pending forever.
    const pendingDownloadUrlResolvers: (() => void)[] = [];
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getAlbum') {
        return { id: 'album1', title: 'Test Album', song: testSongs, image: '' };
      }
      if (options.endpoint === 'getDownloadUrl') {
        await new Promise<void>((resolve) => {
          pendingDownloadUrlResolvers.push(resolve);
        });
        return 'https://server/download.view?id=x';
      }
      return null;
    });

    const store = renderView(<AlbumView id="album1" />);
    const downloadButton = await screen.findByTestId('download-action-download');
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(store.getState().downloadProgress.inProgress).toBe(true);
    });

    const removeButton = screen.getByTestId('download-action-remove-offline');
    expect(removeButton).toBeDisabled();
    expect(downloadButton).toBeDisabled();

    await waitFor(() => {
      expect(pendingDownloadUrlResolvers.length).toBe(testSongs.length);
    });
    pendingDownloadUrlResolvers.forEach((resolve) => resolve());
    await waitFor(() => {
      expect(store.getState().downloadProgress.inProgress).toBe(false);
    });
  });
});
