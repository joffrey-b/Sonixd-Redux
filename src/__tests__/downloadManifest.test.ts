import {
  readManifest,
  writeManifest,
  addManifestEntry,
  removeManifestEntries,
  getDownloadManifestPath,
  DownloadManifestEntry,
} from '../shared/downloadManifest';

const entry = (path: string): DownloadManifestEntry => ({
  path,
  artist: 'Artist',
  album: 'Album',
  title: 'Title',
  ext: 'flac',
  size: 1234,
});

describe('download manifest (Fix 1)', () => {
  it('getDownloadManifestPath is nested under the per-server root cache path', () => {
    // mockSettings (NODE_ENV=test) supplies cachePath/serverBase64 -- confirms
    // the manifest lives under the app-controlled cache dir, not the
    // user-chosen download root, and is per-server nested like
    // getSongCachePath()/getRecoveryPath().
    const path = getDownloadManifestPath();
    expect(path).toContain('sonixd-redux-cache');
    expect(path).toContain('download-manifest.json');
  });

  it('readManifest returns an empty object when the file does not exist', async () => {
    const readFn = jest.fn().mockResolvedValue(null);
    const manifest = await readManifest('/path/manifest.json', readFn);
    expect(manifest).toEqual({});
  });

  it('readManifest returns an empty object on malformed JSON', async () => {
    const readFn = jest.fn().mockResolvedValue('not json{{{');
    const manifest = await readManifest('/path/manifest.json', readFn);
    expect(manifest).toEqual({});
  });

  it('readManifest returns an empty object if the parsed JSON is an array (defensive)', async () => {
    const readFn = jest.fn().mockResolvedValue('[1,2,3]');
    const manifest = await readManifest('/path/manifest.json', readFn);
    expect(manifest).toEqual({});
  });

  it('writeManifest serializes the manifest as JSON', async () => {
    const writeFn = jest.fn().mockResolvedValue(undefined);
    await writeManifest('/path/manifest.json', { song1: entry('/downloads/a.flac') }, writeFn);
    expect(writeFn).toHaveBeenCalledWith(
      '/path/manifest.json',
      JSON.stringify({ song1: entry('/downloads/a.flac') })
    );
  });

  it('addManifestEntry adds a new entry to an existing manifest', async () => {
    const existing = { song1: entry('/downloads/a.flac') };
    const readFn = jest.fn().mockResolvedValue(JSON.stringify(existing));
    const writeFn = jest.fn().mockResolvedValue(undefined);

    await addManifestEntry(
      'song2',
      entry('/downloads/b.flac'),
      '/path/manifest.json',
      readFn,
      writeFn
    );

    const [, writtenRaw] = writeFn.mock.calls[0];
    const written = JSON.parse(writtenRaw);
    expect(Object.keys(written).sort()).toEqual(['song1', 'song2']);
    expect(written.song2.path).toBe('/downloads/b.flac');
  });

  it('removeManifestEntries removes only the specified ids', async () => {
    const existing = {
      song1: entry('/downloads/a.flac'),
      song2: entry('/downloads/b.flac'),
      song3: entry('/downloads/c.flac'),
    };
    const readFn = jest.fn().mockResolvedValue(JSON.stringify(existing));
    const writeFn = jest.fn().mockResolvedValue(undefined);

    await removeManifestEntries(['song2'], '/path/manifest.json', readFn, writeFn);

    const [, writtenRaw] = writeFn.mock.calls[0];
    const written = JSON.parse(writtenRaw);
    expect(Object.keys(written).sort()).toEqual(['song1', 'song3']);
  });

  it('removeManifestEntries is a no-op (no write) for an empty id list', async () => {
    const readFn = jest.fn().mockResolvedValue(JSON.stringify({ song1: entry('/a.flac') }));
    const writeFn = jest.fn().mockResolvedValue(undefined);

    await removeManifestEntries([], '/path/manifest.json', readFn, writeFn);

    expect(writeFn).not.toHaveBeenCalled();
  });

  it('removeManifestEntries is a no-op (no write) when none of the ids are present', async () => {
    const readFn = jest.fn().mockResolvedValue(JSON.stringify({ song1: entry('/a.flac') }));
    const writeFn = jest.fn().mockResolvedValue(undefined);

    await removeManifestEntries(['nonexistent'], '/path/manifest.json', readFn, writeFn);

    expect(writeFn).not.toHaveBeenCalled();
  });

  it('serializes concurrent add/remove calls against the same manifest (no clobbering)', async () => {
    // Mirrors offlineActionQueue.ts's withQueueLock test intent: two mutations
    // fired close together must not each read a stale pre-mutation snapshot
    // and clobber the other's write.
    let stored: Record<string, DownloadManifestEntry> = {};
    const readFn = jest.fn().mockImplementation(async () => JSON.stringify(stored));
    const writeFn = jest.fn().mockImplementation(async (_path: string, data: string) => {
      stored = JSON.parse(data);
    });

    await Promise.all([
      addManifestEntry('song1', entry('/a.flac'), '/path/manifest.json', readFn, writeFn),
      addManifestEntry('song2', entry('/b.flac'), '/path/manifest.json', readFn, writeFn),
    ]);

    expect(Object.keys(stored).sort()).toEqual(['song1', 'song2']);
  });
});
