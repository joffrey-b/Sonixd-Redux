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

// Returns whether a cache file exists for this song once the call completes
// (true whether it was already cached or newly written this call, false if
// nothing was written) -- used by call sites to update the cached-songs index
// (ADR Section 5.3/6) the moment a write actually succeeds, without polling.
const cacheSong = async (fileName: string, url: string): Promise<boolean> => {
  if (fileName.includes('undefined')) {
    return false;
  }

  const cachePath = getSongCachePath();

  // We save the song to a temp path first so that React does not try to use the
  // in-progress downloaded image which would cause the image to be cut off.
  const tempSongPath = joinPath(cachePath, `TEMP_${fileName}`);
  const cachedSongPath = joinPath(cachePath, fileName);

  // Remove any stale TEMP file left by a previously interrupted or failed download.
  await cache.removeIfExists(tempSongPath);

  if (await cache.exists(cachedSongPath)) {
    return true;
  }

  if (url.includes('placeholder')) {
    return false;
  }

  try {
    const buffer = await downloadFile(url);
    await cache.commitDownload(tempSongPath, cachedSongPath, buffer);
    evictCacheIfNeeded(cachePath, 'songCacheSizeLimit').catch(() => {});
    return true;
  } catch {
    await cache.removeIfExists(tempSongPath);
    return false;
  }
};

export default cacheSong;
