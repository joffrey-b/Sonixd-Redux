import fs from 'fs';
import path from 'path';

interface FileEntry {
  name: string;
  fullPath: string;
  size: number;
  mtimeMs: number;
}

// Returns the bare filenames actually deleted (FIX D) -- so the caller can
// notify the renderer's cached-songs index to remove exactly those ids
// without needing a second directory listing. Empty array if nothing needed
// evicting or every delete attempt failed.
export async function evictOldestFilesUntilUnderLimit(
  dirPath: string,
  limitBytes: number
): Promise<string[]> {
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
  if (totalSize <= limitBytes) return [];
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  const deletedFileNames: string[] = [];
  for (const f of files) {
    if (totalSize <= limitBytes) break;
    try {
      await fs.promises.unlink(f.fullPath);
      totalSize -= f.size;
      deletedFileNames.push(f.name);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[cache eviction] could not delete',
        f.fullPath,
        (err as NodeJS.ErrnoException).code
      );
    }
  }
  return deletedFileNames;
}
