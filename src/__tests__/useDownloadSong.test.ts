jest.mock('../api/controller', () => ({
  apiController: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import useDownloadSong from '../hooks/useDownloadSong';
import downloadedSongsReducer from '../redux/downloadedSongsSlice';
import configReducer from '../redux/configSlice';
import { apiController } from '../api/controller';
import { getDownloadedPath } from '../shared/downloadedPathIndex';
import { mockSettings } from '../shared/mockSettings';
import { Server } from '../types';

const mockApiController = apiController as jest.MockedFunction<typeof apiController>;

function makeStore() {
  return configureStore({
    reducer: { config: configReducer, downloadedSongs: downloadedSongsReducer },
    preloadedState: {
      config: { ...configReducer(undefined, { type: '@@INIT' }), serverType: Server.Subsonic },
    },
  });
}

type Store = ReturnType<typeof makeStore>;
const StoreProvider = Provider as React.ComponentType<{ store: Store; children?: React.ReactNode }>;

function renderDownloadSong(store: Store) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, { store }, children);
  return renderHook(() => useDownloadSong(), { wrapper });
}

type BridgeWindow = Window & {
  bridge: {
    settings: { get: (key: string) => unknown };
    recovery: { read: jest.Mock; write: jest.Mock; remove: jest.Mock };
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
  title: 'My Song',
  suffix: 'flac',
  track: 1,
  album: 'My Album',
  albumId: 'album1',
  albumArtist: 'My Artist',
  image: 'https://server/cover.jpg',
};

describe('useDownloadSong (Fix 2)', () => {
  const originalDownloadPath = mockSettings.downloadPath;

  beforeEach(() => {
    mockApiController.mockClear();
    // getCachedDownloadPath() takes the mockSettings shortcut under
    // NODE_ENV==='test' (see shared/downloadPath.ts) -- window.bridge.settings.get
    // is not consulted at all in this mode, so the path must be set here.
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
      return null;
    });
  });

  afterEach(() => {
    mockSettings.downloadPath = originalDownloadPath;
  });

  it('downloads a song, writes the manifest, and updates the Redux index', async () => {
    const store = makeStore();
    const { result } = renderDownloadSong(store);

    let success = false;
    await act(async () => {
      success = await result.current.downloadSong(testSong);
    });

    expect(success).toBe(true);
    expect(mockApiController).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'getDownloadUrl', args: { id: 'song1' } })
    );
    expect(bridgeWindow().bridge.recovery.write).toHaveBeenCalled();
    expect(store.getState().downloadedSongs.songIds).toEqual(['song1']);
  });

  it('waits for the in-flight album art fetch before resolving (folder-resurrection race)', async () => {
    // Same bug as useBulkDownload.ts's identical fix: this call's own art
    // fetch used to be fire-and-forget, so the caller could consider the
    // download "done" (and, e.g., immediately trigger "Remove from
    // offline") while the fetch was still in flight -- letting its
    // ensureDir+commit resurrect a just-deleted folder with an orphaned
    // cover.jpg, which then made the next re-download see a false
    // collision and create a "(2)"-suffixed folder.
    let releaseArtFetch: () => void = () => {};
    const artFetchGate = new Promise<void>((resolve) => {
      releaseArtFetch = resolve;
    });
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('cover.jpg')) await artFetchGate;
      return { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    });

    const store = makeStore();
    const { result } = renderDownloadSong(store);

    let resolved = false;
    let downloadPromise!: Promise<boolean>;
    await act(async () => {
      downloadPromise = result.current.downloadSong(testSong).then((success) => {
        resolved = true;
        return success;
      });
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });

    expect(resolved).toBe(false);

    await act(async () => {
      releaseArtFetch();
      await downloadPromise;
    });

    expect(resolved).toBe(true);
    expect(store.getState().downloadedSongs.songIds).toEqual(['song1']);
    expect(getDownloadedPath('song1')).toBe('/downloads/My Artist/My Album/01 - My Song.flac');
  });

  it('returns false without attempting a download when no download folder is configured', async () => {
    mockSettings.downloadPath = '';
    const store = makeStore();
    const { result } = renderDownloadSong(store);

    let success = true;
    await act(async () => {
      success = await result.current.downloadSong(testSong);
    });

    expect(success).toBe(false);
    expect(mockApiController).not.toHaveBeenCalled();
    expect(store.getState().downloadedSongs.songIds).toEqual([]);
  });

  it('removeDownloadedSong deletes the file, cleans up empty folders, and updates the index', async () => {
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

    const store = makeStore();
    store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1'] });
    const { result } = renderDownloadSong(store);

    await act(async () => {
      await result.current.removeDownloadedSong('song1');
    });

    expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledWith(
      '/downloads/My Artist/My Album/01 - My Song.flac'
    );
    expect(bridgeWindow().bridge.downloadDir.removeDirIfEmpty).toHaveBeenCalledWith(
      '/downloads/My Artist/My Album'
    );
    expect(bridgeWindow().bridge.recovery.write).toHaveBeenCalled();
    expect(store.getState().downloadedSongs.songIds).toEqual([]);
  });

  it('audit fix: downloadSong uses a pre-resolved destDir when options.resolved is passed, without re-reading the manifest', async () => {
    const store = makeStore();
    const { result } = renderDownloadSong(store);

    const readSpy = bridgeWindow().bridge.recovery.read as jest.Mock;
    readSpy.mockClear();

    let success = false;
    await act(async () => {
      success = await result.current.downloadSong(testSong, {
        resolved: {
          destDir: '/downloads/Pre/Resolved',
          artistSegment: 'Pre',
          albumSegment: 'Resolved',
        },
      });
    });

    expect(success).toBe(true);
    // resolveDestDir's own manifest read (which calls recovery.read) is
    // skipped entirely -- only addManifestEntry's internal read-modify-write
    // touches recovery.read, once.
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(getDownloadedPath('song1')).toBe('/downloads/Pre/Resolved/01 - My Song.flac');
  });

  it('audit fix: removeDownloadedFileForEntry removes the file and updates the index without touching the manifest', async () => {
    const store = makeStore();
    store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1'] });
    const { result } = renderDownloadSong(store);

    const writeSpy = bridgeWindow().bridge.recovery.write as jest.Mock;
    writeSpy.mockClear();

    await act(async () => {
      await result.current.removeDownloadedFileForEntry(
        'song1',
        '/downloads/My Artist/My Album/01 - My Song.flac'
      );
    });

    expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledWith(
      '/downloads/My Artist/My Album/01 - My Song.flac'
    );
    expect(store.getState().downloadedSongs.songIds).toEqual([]);
    expect(getDownloadedPath('song1')).toBeUndefined();
    // The persistent manifest itself is untouched -- no recovery.write call.
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
