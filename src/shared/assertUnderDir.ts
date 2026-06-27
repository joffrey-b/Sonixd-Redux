import path from 'path';

export function assertUnderDir(p: string, baseDir: string): void {
  const resolved = path.resolve(p);
  const base = path.resolve(baseDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Path outside allowed directory');
  }
}
