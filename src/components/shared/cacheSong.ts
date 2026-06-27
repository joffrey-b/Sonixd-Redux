import { cache } from './bridge';
import { getSongCachePath, joinPath } from '../../shared/utils';
import { evictCacheIfNeeded } from './cacheUtils';

// Uses the renderer's built-in fetch (Chromium network stack).
// This means the OS certificate store is used on all platforms, redirects are
// handled automatically, and the acceptSelfSigned toggle applies here too.
// The downloaded bytes are committed to disk through the bridge -- the renderer
// can no longer reach fs directly (see C1 / nodeIntegration).
const downloadFile = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.arrayBuffer();
};

const cacheSong = async (fileName: string, url: string): Promise<void> => {
  if (fileName.includes('undefined')) {
    return;
  }

  const cachePath = getSongCachePath();

  // We save the song to a temp path first so that React does not try to use the
  // in-progress downloaded image which would cause the image to be cut off.
  const tempSongPath = joinPath(cachePath, `TEMP_${fileName}`);
  const cachedSongPath = joinPath(cachePath, fileName);

  // Remove any stale TEMP file left by a previously interrupted or failed download.
  await cache.removeIfExists(tempSongPath);

  if (await cache.exists(cachedSongPath)) {
    return;
  }

  if (url.includes('placeholder')) {
    return;
  }

  try {
    const buffer = await downloadFile(url);
    await cache.commitDownload(tempSongPath, cachedSongPath, buffer);
    evictCacheIfNeeded(cachePath, 'songCacheSizeLimit').catch(() => {});
  } catch {
    await cache.removeIfExists(tempSongPath);
  }
};

export default cacheSong;
