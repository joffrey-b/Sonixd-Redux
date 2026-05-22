import fs from 'fs';
import path from 'path';
import { getImageCachePath } from '../../shared/utils';

// Uses the renderer's built-in fetch (Chromium network stack).
// This means the OS certificate store is used on all platforms, redirects are
// handled automatically, and the acceptSelfSigned toggle applies here too.
const downloadFile = async (url: string, dest: string): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
};

const cacheImage = (fileName: string, url: string) => {
  if (!fileName.includes('undefined')) {
    const cachePath = getImageCachePath();

    // We save the img to a temp path first so that React does not try to use the
    // in-progress downloaded image which would cause the image to be cut off.
    const tempImgPath = path.join(cachePath, `TEMP_${fileName}`);
    const cachedImgPath = path.join(cachePath, fileName);

    // Remove any stale TEMP file left by a previously interrupted or failed download.
    if (fs.existsSync(tempImgPath)) {
      try {
        fs.rmSync(tempImgPath);
      } catch {
        // ignore — another download may have just cleaned it up
      }
    }

    if (!fs.existsSync(cachedImgPath)) {
      if (!url.match('placeholder|2a96cbd8b46e442fc41c2b86b821562f')) {
        downloadFile(url, tempImgPath)
          .then(() => {
            fs.renameSync(tempImgPath, cachedImgPath);
            return null;
          })
          .catch(() => {
            try {
              if (fs.existsSync(tempImgPath)) fs.rmSync(tempImgPath);
            } catch {
              // ignore cleanup errors
            }
          });
      }
    }
  }
};

export default cacheImage;
