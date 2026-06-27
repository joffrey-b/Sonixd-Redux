import fs from 'fs';
import path from 'path';
import { evictOldestFilesUntilUnderLimit } from '../shared/cacheEviction';

const DIR = '/fake/cache';

type StatResult = {
  isFile: () => boolean;
  size: number;
  mtimeMs: number;
};

const makeStatResult = (size: number, mtimeMs: number, isFile = true): StatResult => ({
  isFile: () => isFile,
  size,
  mtimeMs,
});

describe('evictOldestFilesUntilUnderLimit', () => {
  let readdirSpy: jest.SpyInstance;
  let statSpy: jest.SpyInstance;
  let unlinkSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    readdirSpy = jest.spyOn(fs.promises, 'readdir');
    statSpy = jest.spyOn(fs.promises, 'stat');
    unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing when total size is below the limit', async () => {
    readdirSpy.mockResolvedValue(['a.mp3', 'b.mp3'] as unknown as fs.Dirent[]);
    statSpy
      .mockResolvedValueOnce(makeStatResult(100, 1000))
      .mockResolvedValueOnce(makeStatResult(100, 2000));

    await evictOldestFilesUntilUnderLimit(DIR, 500);

    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('does nothing when total size equals the limit exactly', async () => {
    readdirSpy.mockResolvedValue(['a.mp3'] as unknown as fs.Dirent[]);
    statSpy.mockResolvedValue(makeStatResult(500, 1000));

    await evictOldestFilesUntilUnderLimit(DIR, 500);

    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('deletes the oldest file first when over the limit', async () => {
    readdirSpy.mockResolvedValue(['new.mp3', 'old.mp3'] as unknown as fs.Dirent[]);
    statSpy
      .mockResolvedValueOnce(makeStatResult(300, 2000)) // new.mp3
      .mockResolvedValueOnce(makeStatResult(300, 1000)); // old.mp3 — older

    await evictOldestFilesUntilUnderLimit(DIR, 400);

    // old.mp3 should be deleted first (lowest mtimeMs)
    expect(unlinkSpy).toHaveBeenCalledWith(path.join(DIR, 'old.mp3'));
    expect(unlinkSpy).not.toHaveBeenCalledWith(path.join(DIR, 'new.mp3'));
  });

  it('deletes multiple files until under the limit', async () => {
    readdirSpy.mockResolvedValue(['a.mp3', 'b.mp3', 'c.mp3'] as unknown as fs.Dirent[]);
    statSpy
      .mockResolvedValueOnce(makeStatResult(200, 1000)) // a — oldest
      .mockResolvedValueOnce(makeStatResult(200, 2000)) // b
      .mockResolvedValueOnce(makeStatResult(200, 3000)); // c — newest

    await evictOldestFilesUntilUnderLimit(DIR, 250);
    // Total = 600, limit = 250. Need to delete until ≤ 250.
    // Delete a (200) → 400 > 250, delete b (200) → 200 ≤ 250, stop.
    expect(unlinkSpy).toHaveBeenCalledTimes(2);
    expect(unlinkSpy).toHaveBeenCalledWith(path.join(DIR, 'a.mp3'));
    expect(unlinkSpy).toHaveBeenCalledWith(path.join(DIR, 'b.mp3'));
    expect(unlinkSpy).not.toHaveBeenCalledWith(path.join(DIR, 'c.mp3'));
  });

  it('stops deleting once total size is at or below the limit', async () => {
    readdirSpy.mockResolvedValue(['a.mp3', 'b.mp3'] as unknown as fs.Dirent[]);
    statSpy
      .mockResolvedValueOnce(makeStatResult(300, 1000))
      .mockResolvedValueOnce(makeStatResult(300, 2000));

    await evictOldestFilesUntilUnderLimit(DIR, 300);
    // Total = 600 > 300. Delete oldest (a.mp3, 300) → 300 ≤ 300, stop.
    expect(unlinkSpy).toHaveBeenCalledTimes(1);
    expect(unlinkSpy).toHaveBeenCalledWith(path.join(DIR, 'a.mp3'));
  });

  it('does not throw when a file deletion fails — logs and continues', async () => {
    readdirSpy.mockResolvedValue(['a.mp3', 'b.mp3'] as unknown as fs.Dirent[]);
    statSpy
      .mockResolvedValueOnce(makeStatResult(300, 1000)) // a — oldest
      .mockResolvedValueOnce(makeStatResult(300, 2000)); // b

    const deleteError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    unlinkSpy
      .mockRejectedValueOnce(deleteError) // a.mp3 fails
      .mockResolvedValueOnce(undefined); // b.mp3 succeeds

    await expect(evictOldestFilesUntilUnderLimit(DIR, 100)).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    expect(unlinkSpy).toHaveBeenCalledTimes(2);
  });

  it('handles an empty cache directory without throwing', async () => {
    readdirSpy.mockResolvedValue([] as unknown as fs.Dirent[]);

    await expect(evictOldestFilesUntilUnderLimit(DIR, 100)).resolves.not.toThrow();
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('correctly sums file sizes before comparing to limit', async () => {
    readdirSpy.mockResolvedValue(['a.mp3', 'b.mp3', 'c.mp3'] as unknown as fs.Dirent[]);
    statSpy
      .mockResolvedValueOnce(makeStatResult(100, 1000))
      .mockResolvedValueOnce(makeStatResult(100, 2000))
      .mockResolvedValueOnce(makeStatResult(100, 3000));

    // Total = 300; limit = 350 → no deletions
    await evictOldestFilesUntilUnderLimit(DIR, 350);
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('skips non-file entries (directories) when tallying total size', async () => {
    readdirSpy.mockResolvedValue(['subdir', 'a.mp3'] as unknown as fs.Dirent[]);
    statSpy
      .mockResolvedValueOnce(makeStatResult(0, 1000, false)) // subdir — isFile returns false
      .mockResolvedValueOnce(makeStatResult(200, 2000, true)); // a.mp3

    // Total from files only = 200; limit = 300 → no deletions
    await evictOldestFilesUntilUnderLimit(DIR, 300);
    expect(unlinkSpy).not.toHaveBeenCalled();
  });
});
