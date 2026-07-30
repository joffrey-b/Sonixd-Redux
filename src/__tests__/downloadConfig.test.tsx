import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DownloadConfig from '../components/settings/ConfigPanels/DownloadConfig';

const renderDownloadConfig = () =>
  render(
    <MemoryRouter>
      <DownloadConfig />
    </MemoryRouter>
  );

type BridgeWindow = Window & {
  bridge: {
    settings: { get: jest.Mock; set: jest.Mock };
    ipcRenderer: { invoke: jest.Mock };
  };
};

const bridgeWindow = () => window as unknown as BridgeWindow;

describe('download folder setting UI (Fix 1)', () => {
  beforeEach(() => {
    bridgeWindow().bridge.settings.get = jest.fn().mockReturnValue('');
    bridgeWindow().bridge.settings.set = jest.fn();
    bridgeWindow().bridge.ipcRenderer.invoke = jest.fn();
  });

  it('shows "Not configured" when no download folder is set', () => {
    renderDownloadConfig();
    expect(screen.getByTestId('download-path-display')).toHaveValue('Not configured');
    expect(screen.queryByTestId('download-path-clear')).not.toBeInTheDocument();
  });

  // Audit fix (finding 1.4): downloadPath moved onto main.dev.mjs's
  // SETTINGS_DENY_LIST, so the renderer can no longer persist it itself via
  // the generic settings.set channel -- select-download-folder now persists
  // it directly in the main process from the real dialog result. These tests
  // assert the dedicated IPC channels are invoked and the UI reflects the
  // result, not that the renderer calls settings.set (it deliberately no
  // longer can).
  it('choosing a folder invokes the real dialog; persistence happens in the main process', async () => {
    bridgeWindow().bridge.ipcRenderer.invoke = jest
      .fn()
      .mockResolvedValue({ success: true, path: '/chosen/downloads' });

    renderDownloadConfig();
    fireEvent.click(screen.getByTestId('download-path-choose-folder'));

    await waitFor(() => {
      expect(screen.getByTestId('download-path-display')).toHaveValue('/chosen/downloads');
    });
    expect(bridgeWindow().bridge.ipcRenderer.invoke).toHaveBeenCalledWith('select-download-folder');
    // Never the generic settings channel -- downloadPath is deny-listed there.
    expect(bridgeWindow().bridge.settings.set).not.toHaveBeenCalledWith(
      'downloadPath',
      expect.anything()
    );
  });

  it('canceling the dialog leaves the setting unchanged', async () => {
    bridgeWindow().bridge.ipcRenderer.invoke = jest.fn().mockResolvedValue({ success: false });

    renderDownloadConfig();
    fireEvent.click(screen.getByTestId('download-path-choose-folder'));

    await waitFor(() => {
      expect(bridgeWindow().bridge.ipcRenderer.invoke).toHaveBeenCalled();
    });
    expect(screen.getByTestId('download-path-display')).toHaveValue('Not configured');
  });

  it('Clear resets the download path via the dedicated clear channel, not the generic settings channel', async () => {
    bridgeWindow().bridge.settings.get = jest.fn().mockReturnValue('/existing/path');
    bridgeWindow().bridge.ipcRenderer.invoke = jest.fn().mockResolvedValue({ success: true });

    renderDownloadConfig();
    expect(screen.getByTestId('download-path-display')).toHaveValue('/existing/path');

    fireEvent.click(screen.getByTestId('download-path-clear'));

    await waitFor(() => {
      expect(screen.getByTestId('download-path-display')).toHaveValue('Not configured');
    });
    expect(bridgeWindow().bridge.ipcRenderer.invoke).toHaveBeenCalledWith(
      'bridge:settings:clear-download-path'
    );
    expect(bridgeWindow().bridge.settings.set).not.toHaveBeenCalledWith('downloadPath', '');
  });

  it('"View downloads" navigates to the overview screen (Fix 7)', () => {
    renderDownloadConfig();
    expect(screen.getByTestId('downloads-view-overview')).toBeInTheDocument();
    // Navigation itself (the actual route match) is covered end-to-end by
    // downloadsOverview.test.tsx and the e2e suite; this just confirms the
    // link exists and is clickable without throwing.
    expect(() => fireEvent.click(screen.getByTestId('downloads-view-overview'))).not.toThrow();
  });
});
