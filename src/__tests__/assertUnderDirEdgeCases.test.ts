import { assertUnderDir } from '../shared/assertUnderDir';

describe('assertUnderDir — additional cases', () => {
  it('does not throw for a valid nested path', () => {
    expect(() => assertUnderDir('/base/dir/file.txt', '/base/dir')).not.toThrow();
  });

  it('handles paths with trailing slashes correctly', () => {
    // Trailing slash on baseDir — path.resolve removes it, so /base/dir/ → /base/dir
    expect(() => assertUnderDir('/base/dir/file.txt', '/base/dir/')).not.toThrow();
  });

  it('handles paths that are exactly the base directory', () => {
    // The path IS the base dir — this is allowed (resolved === base)
    expect(() => assertUnderDir('/base/dir', '/base/dir')).not.toThrow();
  });

  it('throws when given an empty string as filePath', () => {
    // path.resolve('') returns process.cwd(), which is likely not under /base/dir
    // so it should throw
    expect(() => assertUnderDir('', '/base/dir')).toThrow('Path outside allowed directory');
  });

  it('handles deeply nested valid paths', () => {
    expect(() => assertUnderDir('/base/dir/a/b/c/d/e/f.txt', '/base/dir')).not.toThrow();
  });

  it('rejects a path that shares the base as a prefix but is not under it', () => {
    // /base-evil starts with /base but is NOT under /base
    expect(() => assertUnderDir('/base-evil/file.txt', '/base')).toThrow(
      'Path outside allowed directory'
    );
  });

  it('rejects a path traversal attempt', () => {
    expect(() => assertUnderDir('/base/dir/../../../etc/passwd', '/base/dir')).toThrow(
      'Path outside allowed directory'
    );
  });

  it('rejects a path that jumps outside via ..', () => {
    expect(() => assertUnderDir('/base/dir/subdir/../../outside.txt', '/base/dir')).toThrow(
      'Path outside allowed directory'
    );
  });

  it('accepts a path that normalises to a valid location', () => {
    // /base/dir/./file.txt normalises to /base/dir/file.txt
    expect(() => assertUnderDir('/base/dir/./file.txt', '/base/dir')).not.toThrow();
  });

  it('rejects a sibling directory', () => {
    expect(() => assertUnderDir('/base/other/file.txt', '/base/dir')).toThrow(
      'Path outside allowed directory'
    );
  });

  it('rejects an absolute path outside the base when base is a subdirectory', () => {
    expect(() => assertUnderDir('/tmp/evil.sh', '/base/dir')).toThrow(
      'Path outside allowed directory'
    );
  });

  it('handles a Windows-style path separator in the string (on Linux, treated as part of filename)', () => {
    // On Linux, path.resolve handles POSIX paths only.
    // A "Windows-style" path like C:\\windows is a relative path on Linux.
    // This test just ensures the function doesn't crash on unexpected strings.
    const windowsPath = 'C:\\windows\\system32';
    // On Linux, this resolves relative to cwd — almost certainly outside /base/dir
    expect(() => assertUnderDir(windowsPath, '/base/dir')).toThrow(
      'Path outside allowed directory'
    );
  });
});
