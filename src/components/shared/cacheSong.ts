import fs from 'fs';
import http from 'http';
import https from 'https';
import { getSongCachePath } from '../../shared/utils';

// Dedicated agent that skips TLS verification for locally-trusted servers.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const downloadFile = (url: string, dest: string, redirects = 0): Promise<void> => {
  if (redirects > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const options = url.startsWith('https:') ? { agent: httpsAgent } : {};
    protocol
      .get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          downloadFile(res.headers.location || '', dest, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      })
      .on('error', reject);
  });
};

const cacheSong = (fileName: string, url: string) => {
  if (!fileName.includes('undefined')) {
    const cachePath = getSongCachePath();

    // We save the song to a temp path first so that React does not try to use the
    // in-progress downloaded image which would cause the image to be cut off.
    // Also we use string concatenation here instead of path joins because too many
    // joins start to kill performance.
    const tempSongPath = `${cachePath}TEMP_${fileName}`;
    const cachedSongPath = `${cachePath}${fileName}`;

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
