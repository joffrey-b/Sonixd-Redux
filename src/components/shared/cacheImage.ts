import { cache } from './bridge';
import { getImageCachePath, joinPath } from '../../shared/utils';
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

const cacheImage = async (fileName: string, url: string): Promise<void> => {
  if (fileName.includes('undefined')) {
    return;
  }

  const cachePath = getImageCachePath();

  // We save the img to a temp path first so that React does not try to use the
  // in-progress downloaded image which would cause the image to be cut off.
  const tempImgPath = joinPath(cachePath, `TEMP_${fileName}`);
  const cachedImgPath = joinPath(cachePath, fileName);

  // Remove any stale TEMP file left by a previously interrupted or failed download.
  await cache.removeIfExists(tempImgPath);

  if (await cache.exists(cachedImgPath)) {
    return;
  }

  if (url.match('placeholder|2a96cbd8b46e442fc41c2b86b821562f')) {
    return;
  }

  try {
    const buffer = await downloadFile(url);
    await cache.commitDownload(tempImgPath, cachedImgPath, buffer);
    evictCacheIfNeeded(cachePath, 'imageCacheSizeLimit').catch(() => {});
  } catch {
    await cache.removeIfExists(tempImgPath);
  }
};

export default cacheImage;
