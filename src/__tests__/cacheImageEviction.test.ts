/**
 * Tests for evictCacheIfNeeded in cacheUtils.ts.
 * The function reads a limit from settings and delegates to window.bridge.cacheDir.evictIfNeeded.
 */
import { evictCacheIfNeeded } from '../components/shared/cacheUtils';

describe('evictCacheIfNeeded', () => {
  const DIR = '/tmp/image-cache';

  beforeEach(() => {
    jest.clearAllMocks();
    (window.bridge.cacheDir.evictIfNeeded as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });

  it('does nothing when limitKey returns 0 (no limit set)', async () => {
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue(0);
    await evictCacheIfNeeded(DIR, 'imageCacheSizeLimit');
    expect(window.bridge.cacheDir.evictIfNeeded).not.toHaveBeenCalled();
  });

  it('does nothing when limitKey returns undefined', async () => {
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue(undefined);
    await evictCacheIfNeeded(DIR, 'imageCacheSizeLimit');
    expect(window.bridge.cacheDir.evictIfNeeded).not.toHaveBeenCalled();
  });

  it('does nothing when limitKey returns negative number', async () => {
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue(-100);
    await evictCacheIfNeeded(DIR, 'imageCacheSizeLimit');
    expect(window.bridge.cacheDir.evictIfNeeded).not.toHaveBeenCalled();
  });

  it('calls evictIfNeeded with the directory path and limit in bytes when limit > 0', async () => {
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue(500 * 1024 * 1024);
    await evictCacheIfNeeded(DIR, 'imageCacheSizeLimit');
    expect(window.bridge.cacheDir.evictIfNeeded).toHaveBeenCalledWith(DIR, 500 * 1024 * 1024);
  });

  it('works the same for songCacheSizeLimit key', async () => {
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue(1024);
    await evictCacheIfNeeded('/song-cache', 'songCacheSizeLimit');
    expect(window.bridge.cacheDir.evictIfNeeded).toHaveBeenCalledWith('/song-cache', 1024);
  });

  it('reads the limit from settings on each call (not module-level capture)', async () => {
    const getSpy = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(1000);
    (window.bridge.settings.get as jest.Mock) = getSpy;

    await evictCacheIfNeeded(DIR, 'imageCacheSizeLimit');
    expect(window.bridge.cacheDir.evictIfNeeded).not.toHaveBeenCalled();

    await evictCacheIfNeeded(DIR, 'imageCacheSizeLimit');
    expect(window.bridge.cacheDir.evictIfNeeded).toHaveBeenCalledWith(DIR, 1000);
  });

  it('propagates errors from cacheDir.evictIfNeeded', async () => {
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue(100);
    (window.bridge.cacheDir.evictIfNeeded as jest.Mock) = jest
      .fn()
      .mockRejectedValue(new Error('disk error'));
    await expect(evictCacheIfNeeded(DIR, 'imageCacheSizeLimit')).rejects.toThrow('disk error');
  });
});
