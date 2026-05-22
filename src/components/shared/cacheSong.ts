import fs from 'fs';
import path from 'path';
import { getSongCachePath } from '../../shared/utils';

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

const cacheSong = (fileName: string, url: string) => {
  if (!fileName.includes('undefined')) {
    const cachePath = getSongCachePath();

    // We save the song to a temp path first so that React does not try to use the
    // in-progress downloaded image which would cause the image to be cut off.
    const tempSongPath = path.join(cachePath, `TEMP_${fileName}`);
    const cachedSongPath = path.join(cachePath, fileName);

    // Remove any stale TEMP file left by a previously interrupted or failed download.
    if (fs.existsSync(tempSongPath)) {
      try {
        fs.rmSync(tempSongPath);
      } catch {
        // ignore
      }
    }

    if (!fs.existsSync(cachedSongPath)) {
      if (!url.includes('placeholder')) {
        downloadFile(url, tempSongPath)
          .then(() => fs.renameSync(tempSongPath, cachedSongPath))
          .catch(() => {
            try {
              if (fs.existsSync(tempSongPath)) fs.rmSync(tempSongPath);
            } catch {
              // ignore cleanup errors
            }
          });
      }
    }
  }
};

export default cacheSong;
