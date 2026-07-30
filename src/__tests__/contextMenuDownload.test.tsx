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
import { GlobalContextMenu } from '../components/shared/ContextMenu';
import { setContextMenu } from '../redux/miscSlice';
import { setSelected } from '../redux/multiSelectSlice';
import { apiController } from '../api/controller';
import { mockSettings } from '../shared/mockSettings';
import { Item, Server } from '../types';

const mockApiController = apiController as jest.MockedFunction<typeof apiController>;

type BridgeWindow = Window & {
  bridge: {
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

const testSong = {
  id: 'song1',
  uniqueId: 'unique1',
  type: Item.Music,
  title: 'My Song',
  suffix: 'flac',
  track: 1,
  album: 'My Album',
  albumId: 'album1',
  albumArtist: 'My Artist',
  artist: [{ id: 'artist1', title: 'My Artist' }],
  image: 'https://server/cover.jpg',
  streamUrl: 'https://server/stream.view?id=song1',
};

const testSong2 = {
  ...testSong,
  id: 'song2',
  uniqueId: 'unique2',
  title: 'My Second Song',
  streamUrl: 'https://server/stream.view?id=song2',
};

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
    },
  });
}

function renderMenu(store: ReturnType<typeof makeStore>) {
  const queryClient = new QueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GlobalContextMenu />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

// Real render+interaction test (Lesson #7 / Fix 4's required test) -- not
// just a handler-logic test. Exercises the actual click through to the
// bridge, mirroring useDownloadSong.test.ts/useBulkDownload.test.ts's mocking
// depth rather than mocking useBulkDownload away.
describe('right-click download/remove (Fix 4)', () => {
  const originalDownloadPath = mockSettings.downloadPath;

  beforeEach(() => {
    mockApiController.mockClear();
    mockSettings.downloadPath = '/downloads';
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
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getDownloadUrl') return 'https://server/download.view?id=song1';
      if (options.endpoint === 'getPlaylists') return [];
      return null;
    });
  });

  afterEach(() => {
    mockSettings.downloadPath = originalDownloadPath;
  });

  it('clicking Download in the context menu downloads the selected song end-to-end', async () => {
    const store = makeStore();
    store.dispatch(setSelected([testSong]));
    store.dispatch(
      setContextMenu({ show: true, xPos: 0, yPos: 0, type: 'music', details: testSong })
    );

    renderMenu(store);

    const downloadButton = screen.getByTestId('context-menu-download');
    expect(downloadButton).not.toBeDisabled();
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(store.getState().downloadedSongs.songIds).toEqual(['song1']);
    });
    expect(bridgeWindow().bridge.downloadDir.commit).toHaveBeenCalled();
  });

  it('Remove from offline is disabled until the selected song is actually downloaded, then removes it on click', async () => {
    const store = makeStore();
    store.dispatch(setSelected([testSong]));
    store.dispatch(
      setContextMenu({ show: true, xPos: 0, yPos: 0, type: 'music', details: testSong })
    );

    renderMenu(store);

    expect(screen.getByTestId('context-menu-remove-from-offline')).toBeDisabled();

    // Simulate the song already being downloaded.
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(
      JSON.stringify({
        song1: {
          path: '/downloads/My Artist/My Album/01 - My Song.flac',
          artist: 'My Artist',
          album: 'My Album',
          albumId: 'album1',
          title: 'My Song',
          ext: 'flac',
          size: 8,
        },
      })
    );
    act(() => {
      store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1'] });
      store.dispatch(
        setContextMenu({ show: true, xPos: 0, yPos: 0, type: 'music', details: testSong })
      );
    });

    const removeButton = screen.getByTestId('context-menu-remove-from-offline');
    expect(removeButton).not.toBeDisabled();
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(store.getState().downloadedSongs.songIds).toEqual([]);
    });
    expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledWith(
      '/downloads/My Artist/My Album/01 - My Song.flac'
    );
  });

  it('both buttons are disabled for a non-music selection (album row)', () => {
    const store = makeStore();
    store.dispatch(setSelected([{ ...testSong, type: 'album' }]));
    store.dispatch(
      setContextMenu({ show: true, xPos: 0, yPos: 0, type: 'album', details: testSong })
    );

    renderMenu(store);

    expect(screen.getByTestId('context-menu-download')).toBeDisabled();
    expect(screen.getByTestId('context-menu-remove-from-offline')).toBeDisabled();
  });

  it('audit fix: Download is enabled (not wrongly disabled) for a Now Playing selection', async () => {
    const store = makeStore();
    store.dispatch(setSelected([testSong]));
    store.dispatch(
      setContextMenu({ show: true, xPos: 0, yPos: 0, type: 'nowPlaying', details: testSong })
    );

    renderMenu(store);

    const downloadButton = screen.getByTestId('context-menu-download');
    expect(downloadButton).not.toBeDisabled();
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(store.getState().downloadedSongs.songIds).toEqual(['song1']);
    });
  });

  // Audit fix (finding 2.8): the only prior context-menu tests used a single
  // selected song -- nothing proved the context menu's handleDownload/
  // handleRemoveFromOffline actually thread a real multi-song selection into
  // useBulkDownload's fan-out, rather than only ever wiring a single id.
  it('clicking Download with a multi-song selection downloads every selected song (not just one)', async () => {
    const store = makeStore();
    store.dispatch(setSelected([testSong, testSong2]));
    store.dispatch(
      setContextMenu({ show: true, xPos: 0, yPos: 0, type: 'music', details: testSong })
    );

    renderMenu(store);

    const downloadButton = screen.getByTestId('context-menu-download');
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect([...store.getState().downloadedSongs.songIds].sort()).toEqual(['song1', 'song2']);
    });
    // Both songs' own file commits, not just one -- both share the same
    // album, so this is deliberately not an exact call-count assertion
    // (album art is also fetched once per album via the same commit bridge
    // method, fire-and-forget, so its exact timing relative to this point
    // isn't guaranteed).
    expect(bridgeWindow().bridge.downloadDir.commit).toHaveBeenCalledWith(
      expect.stringContaining('My Song'),
      expect.stringContaining('My Song'),
      expect.anything()
    );
    expect(bridgeWindow().bridge.downloadDir.commit).toHaveBeenCalledWith(
      expect.stringContaining('My Second Song'),
      expect.stringContaining('My Second Song'),
      expect.anything()
    );
  });

  it('clicking Remove from offline with a multi-song selection removes every selected song (not just one)', async () => {
    const store = makeStore();
    store.dispatch(setSelected([testSong, testSong2]));
    store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1', 'song2'] });
    store.dispatch(
      setContextMenu({ show: true, xPos: 0, yPos: 0, type: 'music', details: testSong })
    );

    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(
      JSON.stringify({
        song1: {
          path: '/downloads/My Artist/My Album/01 - My Song.flac',
          artist: 'My Artist',
          album: 'My Album',
          albumId: 'album1',
          title: 'My Song',
          ext: 'flac',
          size: 8,
        },
        song2: {
          path: '/downloads/My Artist/My Album/02 - My Second Song.flac',
          artist: 'My Artist',
          album: 'My Album',
          albumId: 'album1',
          title: 'My Second Song',
          ext: 'flac',
          size: 8,
        },
      })
    );

    renderMenu(store);

    const removeButton = screen.getByTestId('context-menu-remove-from-offline');
    expect(removeButton).not.toBeDisabled();
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(store.getState().downloadedSongs.songIds).toEqual([]);
    });
    expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledTimes(2);
  });

  it('audit fix: Remove from offline is enabled for a Now Playing selection once the song is downloaded', () => {
    const store = makeStore();
    store.dispatch(setSelected([testSong]));
    store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1'] });
    store.dispatch(
      setContextMenu({ show: true, xPos: 0, yPos: 0, type: 'nowPlaying', details: testSong })
    );

    renderMenu(store);

    expect(screen.getByTestId('context-menu-remove-from-offline')).not.toBeDisabled();
  });
});
