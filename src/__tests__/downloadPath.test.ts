import {
  getCachedDownloadPath,
  clearDownloadPathCache,
  isDownloadFolderConfigured,
  selectDownloadFolder,
} from '../shared/downloadPath';

describe('download folder setting (Fix 1)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Force the real (non-test-mode) code path -- mockSettings' shortcut
    // would bypass the async cache entirely, which is exactly what this
    // block needs to exercise.
    (process.env as { NODE_ENV: string }).NODE_ENV = 'production';
    clearDownloadPathCache();
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue('');
    (window.bridge.settings.getDownloadPath as jest.Mock) = jest
      .fn()
      .mockResolvedValue('/downloads');
  });

  afterEach(() => {
    (process.env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv ?? 'test';
    clearDownloadPathCache();
  });

  it('resolves via async invoke, not sync settings.get, on the hot path', async () => {
    getCachedDownloadPath();
    // Let the in-flight async refresh resolve and populate the cache.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    jest.clearAllMocks();

    const path = getCachedDownloadPath();

    expect(path).toBe('/downloads');
    expect(window.bridge.settings.getDownloadPath).not.toHaveBeenCalled();
    expect(window.bridge.settings.get).not.toHaveBeenCalled();
  });

  it('falls back to one sync settings.get call only on the very first invocation', async () => {
    const path = getCachedDownloadPath();

    expect(path).toBe('');
    expect(window.bridge.settings.get).toHaveBeenCalledTimes(1);
    expect(window.bridge.settings.getDownloadPath).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache on disconnect', async () => {
    getCachedDownloadPath();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    jest.clearAllMocks();
    (window.bridge.settings.getDownloadPath as jest.Mock) = jest
      .fn()
      .mockResolvedValue('/new-downloads');

    clearDownloadPathCache();
    const path = getCachedDownloadPath();

    // Immediately after clearing, the cache is cold again -- one sync fallback
    // call, exactly like the very first call ever did.
    expect(window.bridge.settings.get).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(getCachedDownloadPath()).toBe('/new-downloads');
    void path;
  });

  it('isDownloadFolderConfigured is false for an unset/empty path', () => {
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue('');
    clearDownloadPathCache();
    expect(isDownloadFolderConfigured()).toBe(false);
  });

  it('isDownloadFolderConfigured is true once a path is set', () => {
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue('/downloads');
    clearDownloadPathCache();
    expect(isDownloadFolderConfigured()).toBe(true);
  });

  it('selectDownloadFolder returns the selected path on success', async () => {
    (window.bridge.ipcRenderer.invoke as jest.Mock) = jest
      .fn()
      .mockResolvedValue({ success: true, path: '/chosen/folder' });
    await expect(selectDownloadFolder()).resolves.toBe('/chosen/folder');
    expect(window.bridge.ipcRenderer.invoke).toHaveBeenCalledWith('select-download-folder');
  });

  it('selectDownloadFolder returns undefined when the dialog is canceled', async () => {
    (window.bridge.ipcRenderer.invoke as jest.Mock) = jest
      .fn()
      .mockResolvedValue({ success: false });
    await expect(selectDownloadFolder()).resolves.toBeUndefined();
  });
});
