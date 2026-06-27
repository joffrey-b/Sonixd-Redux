import path from 'path';
import { assertUnderDir } from '../shared/assertUnderDir';

describe('assertUnderDir', () => {
  const base = '/allowed/cache';

  it('does not throw for a path directly inside the allowed directory', () => {
    expect(() => assertUnderDir(`${base}/song.mp3`, base)).not.toThrow();
  });

  it('does not throw for a path in a subdirectory of the allowed directory', () => {
    expect(() => assertUnderDir(`${base}/images/cover.jpg`, base)).not.toThrow();
  });

  it('does not throw when path equals the allowed directory itself', () => {
    expect(() => assertUnderDir(base, base)).not.toThrow();
  });

  it('throws for a path outside the allowed directory', () => {
    expect(() => assertUnderDir('/other/dir/file.txt', base)).toThrow(
      'Path outside allowed directory'
    );
  });

  it('throws for a path traversal attempt using ..', () => {
    expect(() => assertUnderDir(`${base}/../../../etc/passwd`, base)).toThrow(
      'Path outside allowed directory'
    );
  });

  it('throws for a path that merely starts with the base string but is not under it', () => {
    // /allowed/cache-evil is NOT under /allowed/cache — the sep check prevents this
    expect(() => assertUnderDir('/allowed/cache-evil/file.txt', base)).toThrow(
      'Path outside allowed directory'
    );
  });

  it('throws for the parent directory of the allowed directory', () => {
    // /allowed/cache/.. resolves to /allowed — outside /allowed/cache
    expect(() => assertUnderDir(`${base}/..`, base)).toThrow('Path outside allowed directory');
  });

  it('uses path.resolve() — resolves relative traversal to absolute before checking', () => {
    // Construct a path that uses .. to escape the base, even if stated relatively
    const escaped = path.join(base, '..', '..', 'secret');
    expect(() => assertUnderDir(escaped, base)).toThrow('Path outside allowed directory');
  });

  it('URL-encoded dots are treated as literal directory names and do NOT traverse', () => {
    // On the filesystem, %2e%2e is a literal name, not .., so it stays under base
    expect(() => assertUnderDir(`${base}/%2e%2e/secret`, base)).not.toThrow();
  });
});
