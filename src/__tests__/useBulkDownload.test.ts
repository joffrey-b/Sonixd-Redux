jest.mock('../api/controller', () => ({
  apiController: jest.fn(),
}));
jest.mock('../components/shared/toast', () => ({
  notifyToast: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import useBulkDownload from '../hooks/useBulkDownload';
import downloadedSongsReducer from '../redux/downloadedSongsSlice';
import downloadProgressReducer, { selectDownloadProgress } from '../redux/downloadProgressSlice';
import configReducer from '../redux/configSlice';
import { apiController } from '../api/controller';
import { notifyToast } from '../components/shared/toast';
import { mockSettings } from '../shared/mockSettings';
import { Server } from '../types';

const mockApiController = apiController as jest.MockedFunction<typeof apiController>;
const mockNotifyToast = notifyToast as jest.Mock;

function makeStore() {
  return configureStore({
    reducer: {
      config: configReducer,
      downloadedSongs: downloadedSongsReducer,
      downloadProgress: downloadProgressReducer,
    },
    preloadedState: {
      config: { ...configReducer(undefined, { type: '@@INIT' }), serverType: Server.Subsonic },
    },
  });
}

type Store = ReturnType<typeof makeStore>;
const StoreProvider = Provider as React.ComponentType<{ store: Store; children?: React.ReactNode }>;

function renderBulk(store: Store) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, { store }, children);
  return renderHook(() => useBulkDownload(), { wrapper });
}

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
      listEntries: jest.Mock;
    };
  };
};

const bridgeWindow = () => window as unknown as BridgeWindow;

const makeSong = (id: string, albumId = 'album1') => ({
  id,
  title: `Song ${id}`,
  suffix: 'flac',
  track: 1,
  album: 'My Album',
  albumId,
  albumArtist: 'My Artist',
  image: 'https://server/cover.jpg',
});

describe('bulk download/delete buttons (Fix 5)', () => {
  const originalDownloadPath = mockSettings.downloadPath;

  beforeEach(() => {
    mockApiController.mockClear();
    mockNotifyToast.mockClear();
    mockSettings.downloadPath = '/downloads';
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(null);
    bridgeWindow().bridge.recovery.write = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.ensureDir = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.exists = jest.fn().mockResolvedValue(false);
    bridgeWindow().bridge.downloadDir.removeIfExists = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.commit = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.removeFile = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.removeDirIfEmpty = jest.fn().mockResolvedValue(true);
    bridgeWindow().bridge.downloadDir.listEntries = jest.fn().mockResolvedValue([]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getDownloadUrl')
        return `https://server/download.view?id=${options.args.id}`;
      return null;
    });
  });

  afterEach(() => {
    mockSettings.downloadPath = originalDownloadPath;
  });

  it('Download fans out with the established concurrency/isolation pattern', async () => {
    const songs = Array.from({ length: 12 }, (_, i) => makeSong(`song${i}`));
    const store = makeStore();
    const { result } = renderBulk(store);

    let outcome: { succeeded: number; failed: number } | undefined;
    await act(async () => {
      outcome = await result.current.downloadSongs(songs);
    });

    expect(outcome).toEqual({ succeeded: 12, failed: 0 });
    expect(store.getState().downloadedSongs.songIds).toHaveLength(12);
    // Batch progress resets to idle once finished.
    expect(selectDownloadProgress(store.getState())).toEqual({
      inProgress: false,
      completed: 0,
      total: 0,
    });
  });

  it('waits for the in-flight album art fetch before finishing the batch (folder-resurrection race)', async () => {
    // Real bug report: the album art fetch used to be fire-and-forget, so
    // the batch could be considered "finished" (Download/Delete buttons
    // re-enabled) while it was still writing -- a "Clear all downloads" run
    // moments later could remove the album folder before this fetch's own
    // ensureDir+commit landed, resurrecting the folder with an orphaned
    // cover.jpg and causing the next re-download to see a false collision.
    let releaseArtFetch: () => void = () => {};
    const artFetchGate = new Promise<void>((resolve) => {
      releaseArtFetch = resolve;
    });
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('cover.jpg')) await artFetchGate;
      return { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    });

    const songs = [makeSong('song1'), makeSong('song2')];
    const store = makeStore();
    const { result } = renderBulk(store);

    let resolved = false;
    let downloadPromise!: Promise<{ succeeded: number; failed: number }>;
    await act(async () => {
      downloadPromise = result.current.downloadSongs(songs).then((outcome) => {
        resolved = true;
        return outcome;
      });
      // Give the song downloads (unaffected by the art gate) every chance
      // to settle -- only the art fetch should still be holding things open.
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });

    expect(resolved).toBe(false);
    expect(selectDownloadProgress(store.getState()).inProgress).toBe(true);
    expect(store.getState().downloadedSongs.songIds).toHaveLength(2);

    await act(async () => {
      releaseArtFetch();
      await downloadPromise;
    });

    expect(resolved).toBe(true);
    expect(selectDownloadProgress(store.getState()).inProgress).toBe(false);
  });

  it('one song failing does not abort the rest of the batch', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('song2')) return { ok: false, status: 500 };
      return { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    });
    mockApiController.mockImplementation(async (options) => {
      if (options.endpoint === 'getDownloadUrl')
        return `https://server/download.view?id=${options.args.id}`;
      return null;
    });

    const songs = [makeSong('song1'), makeSong('song2'), makeSong('song3')];
    const store = makeStore();
    const { result } = renderBulk(store);

    let outcome: { succeeded: number; failed: number } | undefined;
    await act(async () => {
      outcome = await result.current.downloadSongs(songs);
    });

    expect(outcome).toEqual({ succeeded: 2, failed: 1 });
    expect([...store.getState().downloadedSongs.songIds].sort()).toEqual(['song1', 'song3']);
    expect(mockNotifyToast).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('1 of 3 songs could not be downloaded')
    );
  });

  it('self-audit fix: one song failing to resolve its destination folder does not abort resolution for the rest of the batch', async () => {
    let callCount = 0;
    bridgeWindow().bridge.downloadDir.exists = jest.fn().mockImplementation(async () => {
      callCount += 1;
      // Fail only the very first pathExists check (song1's pre-pass
      // resolution) -- every other resolution, and the real per-song
      // download fan-out's own internal re-resolution, succeeds normally.
      if (callCount === 1) throw new Error('transient IPC error');
      return false;
    });

    const songs = [makeSong('song1'), makeSong('song2')];
    const store = makeStore();
    const { result } = renderBulk(store);

    let outcome: { succeeded: number; failed: number } | undefined;
    await act(async () => {
      outcome = await result.current.downloadSongs(songs);
    });

    // Both songs still end up downloaded -- song1's pre-pass resolution
    // failure only affected album-art grouping, not the real per-song fan-out
    // below it (which resolves fresh and independently for each song).
    expect(outcome).toEqual({ succeeded: 2, failed: 0 });
  });

  it('fetches album art once per album across the whole batch, not once per song', async () => {
    const songs = [
      makeSong('song1', 'albumA'),
      makeSong('song2', 'albumA'),
      makeSong('song3', 'albumA'),
      makeSong('song4', 'albumB'),
    ];
    const store = makeStore();
    const { result } = renderBulk(store);

    await act(async () => {
      await result.current.downloadSongs(songs);
    });

    // 4 song files + at most 2 album art files (one per distinct album).
    const commitCalls = bridgeWindow().bridge.downloadDir.commit.mock.calls;
    const artCommits = commitCalls.filter((call) => String(call[1]).endsWith('cover.jpg'));
    expect(artCommits.length).toBeLessThanOrEqual(2);
  });

  it('does not attempt anything when no download folder is configured', async () => {
    mockSettings.downloadPath = '';
    const songs = [makeSong('song1')];
    const store = makeStore();
    const { result } = renderBulk(store);

    let outcome: { succeeded: number; failed: number } | undefined;
    await act(async () => {
      outcome = await result.current.downloadSongs(songs);
    });

    expect(outcome).toEqual({ succeeded: 0, failed: 1 });
    expect(mockApiController).not.toHaveBeenCalled();
    expect(mockNotifyToast).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('Set a download folder')
    );
  });

  it('Delete removes everything for the scope and isolates per-item failures', async () => {
    const manifest = {
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
    };
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(JSON.stringify(manifest));
    bridgeWindow().bridge.downloadDir.removeFile = jest
      .fn()
      .mockImplementation(async (path: string) => {
        if (path.includes('2.flac')) throw new Error('disk error');
      });

    const store = makeStore();
    store.dispatch({ type: 'downloadedSongs/setDownloadedSongIds', payload: ['song1', 'song2'] });
    const { result } = renderBulk(store);

    let outcome: { succeeded: number; failed: number } | undefined;
    await act(async () => {
      outcome = await result.current.removeDownloadedSongs(['song1', 'song2']);
    });

    expect(outcome).toEqual({ succeeded: 1, failed: 1 });
    expect(mockNotifyToast).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('1 of 2 downloads could not be removed')
    );
  });

  it('audit fix: Delete runs folder cleanup exactly once per shared album folder, not once per song', async () => {
    // 3 songs all in the same album folder -- the original per-song
    // cleanupEmptyAlbumFolders call (CONCURRENCY-chunked, so all 3 run
    // concurrently) let each song's own listEntries/removeDirIfEmpty check
    // race its siblings' still-in-flight removeFile calls, with no guarantee
    // any single call observed the folder in its final, truly-empty state.
    const manifest = {
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
      song3: {
        path: '/downloads/A/B/3.flac',
        artist: 'A',
        album: 'B',
        albumId: 'album1',
        title: 'S3',
        ext: 'flac',
        size: 1,
      },
    };
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(JSON.stringify(manifest));
    const listEntriesSpy = bridgeWindow().bridge.downloadDir.listEntries as jest.Mock;
    const removeDirIfEmptySpy = bridgeWindow().bridge.downloadDir.removeDirIfEmpty as jest.Mock;

    const store = makeStore();
    store.dispatch({
      type: 'downloadedSongs/setDownloadedSongIds',
      payload: ['song1', 'song2', 'song3'],
    });
    const { result } = renderBulk(store);

    let outcome: { succeeded: number; failed: number } | undefined;
    await act(async () => {
      outcome = await result.current.removeDownloadedSongs(['song1', 'song2', 'song3']);
    });

    expect(outcome).toEqual({ succeeded: 3, failed: 0 });
    const albumDirChecks = listEntriesSpy.mock.calls.filter((call) => call[0] === '/downloads/A/B');
    expect(albumDirChecks).toHaveLength(1);
    const albumDirRemovals = removeDirIfEmptySpy.mock.calls.filter(
      (call) => call[0] === '/downloads/A/B'
    );
    expect(albumDirRemovals).toHaveLength(1);
  });

  it('audit fix: Delete issues exactly one batched manifest write for a multi-song removal', async () => {
    const manifest = {
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
      song3: {
        path: '/downloads/A/B/3.flac',
        artist: 'A',
        album: 'B',
        albumId: 'album1',
        title: 'S3',
        ext: 'flac',
        size: 1,
      },
    };
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(JSON.stringify(manifest));
    const writeSpy = bridgeWindow().bridge.recovery.write as jest.Mock;

    const store = makeStore();
    store.dispatch({
      type: 'downloadedSongs/setDownloadedSongIds',
      payload: ['song1', 'song2', 'song3'],
    });
    const { result } = renderBulk(store);

    let outcome: { succeeded: number; failed: number } | undefined;
    await act(async () => {
      outcome = await result.current.removeDownloadedSongs(['song1', 'song2', 'song3']);
    });

    expect(outcome).toEqual({ succeeded: 3, failed: 0 });
    // One manifest read up front + one batched write at the end -- not one
    // lock-serialized read-modify-write round trip per song.
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const [, writtenJson] = writeSpy.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual({});
  });

  it('audit fix: songs in the same album group share one resolved destDir, resolved once for the whole group', async () => {
    const albumDir = '/downloads/My Artist/My Album';
    const existsSpy = bridgeWindow().bridge.downloadDir.exists as jest.Mock;
    existsSpy.mockImplementation(async () => false);

    const songs = [makeSong('song1', 'albumA'), makeSong('song2', 'albumA')];
    const store = makeStore();
    const { result } = renderBulk(store);

    await act(async () => {
      await result.current.downloadSongs(songs);
    });

    // resolveDestDir's own pathExists collision-check (called with the album
    // directory itself, distinct from the per-song/per-art final-path
    // idempotency checks downloadSongFile/downloadAlbumArt each also make)
    // runs exactly once for the whole albumA group in the pre-pass, not once
    // per song -- the per-song fan-out below only re-resolves when
    // options.resolved is absent, which it isn't here.
    const albumDirChecks = existsSpy.mock.calls.filter((call) => call[0] === albumDir);
    expect(albumDirChecks).toHaveLength(1);

    const commitCalls = bridgeWindow().bridge.downloadDir.commit.mock.calls;
    const songCommitDirs = commitCalls
      .filter((call) => !String(call[1]).endsWith('cover.jpg'))
      .map((call) => String(call[1]).split('/').slice(0, -1).join('/'));
    expect(new Set(songCommitDirs).size).toBe(1);
  });
});
