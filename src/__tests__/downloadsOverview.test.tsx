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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import configReducer from '../redux/configSlice';
import downloadedSongsReducer from '../redux/downloadedSongsSlice';
import downloadProgressReducer, { startDownloadBatch } from '../redux/downloadProgressSlice';
import DownloadsOverview from '../components/downloads/DownloadsOverview';
import { Server } from '../types';

type BridgeWindow = Window & {
  bridge: {
    recovery: { read: jest.Mock; write: jest.Mock };
    downloadDir: { exists: jest.Mock; removeFile: jest.Mock; removeDirIfEmpty: jest.Mock };
  };
};

const bridgeWindow = () => window as unknown as BridgeWindow;

const manifest = {
  song1: {
    path: '/downloads/Artist/Album/01 - Song One.flac',
    artist: 'Artist',
    album: 'Album',
    albumId: 'album1',
    title: 'Song One',
    ext: 'flac',
    size: 1_000_000,
  },
  song2: {
    path: '/downloads/Artist/Album/02 - Song Two.flac',
    artist: 'Artist',
    album: 'Album',
    albumId: 'album1',
    title: 'Song Two',
    ext: 'flac',
    size: 2_000_000,
  },
};

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

function renderOverview(store: ReturnType<typeof makeStore>) {
  render(
    <Provider store={store}>
      <MemoryRouter>
        <DownloadsOverview />
      </MemoryRouter>
    </Provider>
  );
}

describe('downloads overview screen (Fix 7)', () => {
  beforeEach(() => {
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(JSON.stringify(manifest));
    bridgeWindow().bridge.recovery.write = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.exists = jest.fn().mockResolvedValue(true);
    bridgeWindow().bridge.downloadDir.removeFile = jest.fn().mockResolvedValue(undefined);
    bridgeWindow().bridge.downloadDir.removeDirIfEmpty = jest.fn().mockResolvedValue(true);
  });

  it('shows correct total space and the full content list', async () => {
    const store = makeStore();
    renderOverview(store);

    await waitFor(() => {
      expect(screen.getAllByTestId('downloads-row')).toHaveLength(2);
    });
    expect(screen.getByText('Song One')).toBeInTheDocument();
    expect(screen.getByText('Song Two')).toBeInTheDocument();
    // 1,000,000 + 2,000,000 bytes = ~2.86 MB
    expect(screen.getByTestId('downloads-total-size')).toHaveTextContent('MB');
  });

  it('shows an empty-state message when nothing is downloaded', async () => {
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(null);
    const store = makeStore();
    renderOverview(store);

    await waitFor(() => {
      expect(screen.getByTestId('downloads-empty-message')).toBeInTheDocument();
    });
    expect(screen.getByTestId('downloads-clear-all')).toBeDisabled();
  });

  it('self-corrects (Fix 6) when a manifest entry points to a missing file, without crashing', async () => {
    bridgeWindow().bridge.downloadDir.exists = jest
      .fn()
      .mockImplementation(async (path: string) => !path.includes('Song Two'));
    const store = makeStore();
    renderOverview(store);

    await waitFor(() => {
      expect(screen.getAllByTestId('downloads-row')).toHaveLength(1);
    });
    expect(screen.getByText('Song One')).toBeInTheDocument();
    expect(screen.queryByText('Song Two')).not.toBeInTheDocument();
    expect(bridgeWindow().bridge.recovery.write).toHaveBeenCalled();
  });

  it('clear-all-downloads uses the same isolation pattern as scoped delete', async () => {
    const store = makeStore();
    renderOverview(store);

    await waitFor(() => {
      expect(screen.getAllByTestId('downloads-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('downloads-clear-all'));

    await waitFor(() => {
      expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledTimes(2);
    });
  });

  // Audit fix (Section 3 finding): the existing clear-all test above only
  // exercises an all-succeed batch -- the generic hook-level mixed-batch
  // isolation test exists separately (useBulkDownload.test.ts), but nothing
  // previously drove a real mixed success/fail clear-all through this
  // specific UI, wired through the actual DownloadsOverview component.
  it('clear-all-downloads removes what it can even when one file fails to delete', async () => {
    // handleClearAll re-reads the manifest via loadManifest() after removing,
    // so recovery.read needs to behave like real persistent storage here
    // (reflecting whatever recovery.write actually last persisted), not a
    // static mock that would just keep returning the original, pre-delete
    // manifest on the post-clear-all re-fetch.
    let persistedManifest = JSON.stringify(manifest);
    bridgeWindow().bridge.recovery.read = jest
      .fn()
      .mockImplementation(async () => persistedManifest);
    bridgeWindow().bridge.recovery.write = jest
      .fn()
      .mockImplementation(async (_path: string, data: string) => {
        persistedManifest = data;
      });
    bridgeWindow().bridge.downloadDir.removeFile = jest
      .fn()
      .mockImplementation(async (path: string) => {
        if (path.includes('Song Two')) throw new Error('permission denied');
      });
    const store = makeStore();
    renderOverview(store);

    await waitFor(() => {
      expect(screen.getAllByTestId('downloads-row')).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('downloads-clear-all'));

    await waitFor(() => {
      expect(bridgeWindow().bridge.downloadDir.removeFile).toHaveBeenCalledTimes(2);
    });
    // The failing song is not silently dropped from the manifest/index --
    // it's still shown, exactly like a scoped delete's own per-item isolation.
    await waitFor(() => {
      expect(screen.getByText('Song Two')).toBeInTheDocument();
    });
    expect(screen.queryByText('Song One')).not.toBeInTheDocument();
  });

  it('shows live in-progress state as count-based progress, not byte-level', async () => {
    const store = makeStore();
    store.dispatch(startDownloadBatch(5));
    renderOverview(store);

    await waitFor(() => {
      expect(screen.getByTestId('downloads-in-progress')).toHaveTextContent('0');
      expect(screen.getByTestId('downloads-in-progress')).toHaveTextContent('5');
    });
  });
});
