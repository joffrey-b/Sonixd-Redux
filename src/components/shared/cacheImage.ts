import fs from 'fs';
import http from 'http';
import https from 'https';
import { getImageCachePath } from '../../shared/utils';

// Dedicated agent that skips TLS verification for locally-trusted servers
// (e.g. self-signed or private-CA certs). Node.js does not use the OS
// certificate store on Windows/macOS, so downloads would otherwise fail.
// The user has already established trust with this server via Chromium.
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

const cacheImage = (fileName: string, url: string) => {
  if (!fileName.includes('undefined')) {
    const cachePath = getImageCachePath();

    // We save the img to a temp path first so that React does not try to use the
    // in-progress downloaded image which would cause the image to be cut off.
    // Also we use string concatenation here instead of path joins because too many
    // joins start to kill performance.
    const tempImgPath = `${cachePath}TEMP_${fileName}`;
    const cachedImgPath = `${cachePath}${fileName}`;

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
