import fs from 'fs';
import path from 'path';

interface FileEntry {
  name: string;
  fullPath: string;
  size: number;
  mtimeMs: number;
}

export async function evictOldestFilesUntilUnderLimit(
  dirPath: string,
  limitBytes: number
): Promise<void> {
  const entries = await fs.promises.readdir(dirPath);
  const stats = await Promise.all(
    entries.map(async (name) => {
      const fullPath = path.join(dirPath, name);
      try {
        const s = await fs.promises.stat(fullPath);
        if (!s.isFile()) return null;
        return { name, fullPath, size: s.size, mtimeMs: s.mtimeMs };
      } catch {
        return null;
      }
    })
  );
  const files = stats.filter((f): f is FileEntry => f !== null);
  let totalSize = files.reduce((acc, f) => acc + f.size, 0);
  if (totalSize <= limitBytes) return;
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const f of files) {
    if (totalSize <= limitBytes) break;
    try {
      await fs.promises.unlink(f.fullPath);
      totalSize -= f.size;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[cache eviction] could not delete',
        f.fullPath,
        (err as NodeJS.ErrnoException).code
      );
    }
  }
}
