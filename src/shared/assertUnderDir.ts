import path from 'path';

// Audit fix (Section 3 finding): "not configured" (getDownloadBaseDir()
// returning null when downloadPath is unset) used to fail closed only as an
// accidental side effect of path.resolve(null) throwing a TypeError -- not a
// guarantee this function itself makes. A sibling case (cachePath resolving
// to '', where path.resolve('') is process.cwd(), a real directory that does
// NOT fail closed) was a real near-miss already found once; relying on an
// implicit throw here rather than an explicit check leaves this one
// vulnerable to the same class of regression if the falsy-check upstream
// ever changes shape. Explicitly rejecting any falsy baseDir up front makes
// the fail-closed behavior this function's own guaranteed contract, not an
// incidental consequence of what a missing argument happens to do inside
// path.resolve.
export function assertUnderDir(p: string, baseDir: string | null | undefined): void {
  if (!baseDir) {
    throw new Error('No base directory configured');
  }
  const resolved = path.resolve(p);
  const base = path.resolve(baseDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Path outside allowed directory');
  }
}
