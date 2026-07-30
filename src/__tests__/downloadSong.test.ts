import {
  resolveAlbumFolder,
  downloadSongFile,
  downloadAlbumArtForAlbums,
  cleanupEmptyAlbumFolders,
} from '../shared/downloadSong';
import { assertUnderDir } from '../shared/assertUnderDir';
import { buildDownloadFileName } from '../shared/sanitizeDownloadPath';
import type { DownloadManifest, DownloadManifestEntry } from '../shared/downloadManifest';

type BridgeWindow = Window & {
  bridge: {
    downloadDir: {
      ensureDir: jest.Mock;
      exists: jest.Mock;
      removeIfExists: jest.Mock;
      commit: jest.Mock;
      removeDirIfEmpty: jest.Mock;
      listEntries: jest.Mock;
    };
  };
};

const bridgeWindow = () => window as unknown as BridgeWindow;

const manifestEntry = (overrides: Partial<DownloadManifestEntry> = {}): DownloadManifestEntry => ({
  path: '/downloads/Artist/Album/01 - Title.flac',
  artist: 'Artist',
  album: 'Album',
  albumId: 'album1',
  title: 'Title',
  ext: 'flac',
  size: 100,
  ...overrides,
});

beforeEach(() => {
  bridgeWindow().bridge.downloadDir.ensureDir = jest.fn().mockResolvedValue(undefined);
  bridgeWindow().bridge.downloadDir.exists = jest.fn().mockResolvedValue(false);
  bridgeWindow().bridge.downloadDir.removeIfExists = jest.fn().mockResolvedValue(undefined);
  bridgeWindow().bridge.downloadDir.commit = jest.fn().mockResolvedValue(undefined);
  bridgeWindow().bridge.downloadDir.removeDirIfEmpty = jest.fn().mockResolvedValue(true);
  bridgeWindow().bridge.downloadDir.listEntries = jest.fn().mockResolvedValue([]);
  global.fetch = jest.fn();
});

describe('download mechanism (Fix 2)', () => {
  it('writes to the sanitized path under the current download root', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    const result = await downloadSongFile(
      { id: 'song1', title: 'My Song', suffix: 'flac', track: 3 },
      '/downloads/Artist/Album',
      () => Promise.resolve('https://server/download.view?id=song1')
    );

    expect(result.success).toBe(true);
    expect(result.path).toBe('/downloads/Artist/Album/03 - My Song.flac');
    expect(bridgeWindow().bridge.downloadDir.commit).toHaveBeenCalledWith(
      '/downloads/Artist/Album/TEMP_03 - My Song.flac',
      '/downloads/Artist/Album/03 - My Song.flac',
      expect.any(ArrayBuffer)
    );
  });

  it('does not re-fetch when the file already exists (additive fill-in-the-remainder)', async () => {
    bridgeWindow().bridge.downloadDir.exists = jest.fn().mockResolvedValue(true);

    const result = await downloadSongFile(
      { id: 'song1', title: 'My Song', suffix: 'flac', track: 1 },
      '/downloads/Artist/Album',
      () => Promise.resolve('https://server/download.view?id=song1')
    );

    expect(result.success).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(bridgeWindow().bridge.downloadDir.commit).not.toHaveBeenCalled();
  });

  it('cleans up the temp file and reports failure when the fetch fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

    const result = await downloadSongFile(
      { id: 'song1', title: 'My Song', suffix: 'flac', track: 1 },
      '/downloads/Artist/Album',
      () => Promise.resolve('https://server/download.view?id=song1')
    );

    expect(result.success).toBe(false);
    expect(bridgeWindow().bridge.downloadDir.removeIfExists).toHaveBeenCalledWith(
      '/downloads/Artist/Album/TEMP_01 - My Song.flac'
    );
    expect(bridgeWindow().bridge.downloadDir.commit).not.toHaveBeenCalled();
  });

  it('fetches album art once per album, not once per song in a batch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    });

    // 3 songs from the same album, 1 song from another album -- simulates a
    // batch download's per-song list collapsed to per-album art targets.
    await downloadAlbumArtForAlbums([
      { destDir: '/downloads/Artist/AlbumA', coverArtUrl: 'https://server/art/a.jpg' },
      { destDir: '/downloads/Artist/AlbumA', coverArtUrl: 'https://server/art/a.jpg' },
      { destDir: '/downloads/Artist/AlbumA', coverArtUrl: 'https://server/art/a.jpg' },
      { destDir: '/downloads/Artist/AlbumB', coverArtUrl: 'https://server/art/b.jpg' },
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(bridgeWindow().bridge.downloadDir.commit).toHaveBeenCalledTimes(2);
  });

  it('self-audit fix: one album art failure (even in ensureDir) does not abort the others in the batch', async () => {
    bridgeWindow().bridge.downloadDir.ensureDir = jest
      .fn()
      .mockImplementation(async (destDir: string) => {
        if (destDir.includes('AlbumBroken')) throw new Error('permission denied');
      });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    });

    await expect(
      downloadAlbumArtForAlbums([
        { destDir: '/downloads/Artist/AlbumBroken', coverArtUrl: 'https://server/art/broken.jpg' },
        { destDir: '/downloads/Artist/AlbumOk', coverArtUrl: 'https://server/art/ok.jpg' },
      ])
    ).resolves.toBeUndefined();

    // The healthy album's art still got fetched despite the broken one.
    expect(bridgeWindow().bridge.downloadDir.commit).toHaveBeenCalledWith(
      '/downloads/Artist/AlbumOk/TEMP_cover.jpg',
      '/downloads/Artist/AlbumOk/cover.jpg',
      expect.any(ArrayBuffer)
    );
  });

  it('skips album art entirely for a placeholder/missing cover URL', async () => {
    await downloadAlbumArtForAlbums([
      { destDir: '/downloads/Artist/AlbumA', coverArtUrl: undefined },
    ]);
    await downloadAlbumArtForAlbums([
      { destDir: '/downloads/Artist/AlbumB', coverArtUrl: 'img/placeholder.png' },
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('album folder resolution / collision detection (Fix 2)', () => {
  it('reuses the existing folder for an already-downloaded album (additive Download)', async () => {
    const manifest: DownloadManifest = {
      song1: manifestEntry({ artist: 'My Artist', album: 'My Album (2)', albumId: 'album1' }),
    };
    const pathExists = jest.fn().mockResolvedValue(false);

    const result = await resolveAlbumFolder(
      '/downloads',
      'My Artist',
      'My Album',
      'album1',
      manifest,
      pathExists
    );

    expect(result).toEqual({ artistSegment: 'My Artist', albumSegment: 'My Album (2)' });
    // Reused from the manifest -- no filesystem check needed at all.
    expect(pathExists).not.toHaveBeenCalled();
  });

  it('produces clean names when no collision exists', async () => {
    const pathExists = jest.fn().mockResolvedValue(false);
    const result = await resolveAlbumFolder(
      '/downloads',
      'Artist',
      'Album',
      'album1',
      {},
      pathExists
    );
    expect(result).toEqual({ artistSegment: 'Artist', albumSegment: 'Album' });
  });

  it('appends a disambiguating suffix only on a genuine detected collision', async () => {
    // A folder named 'Album' already exists on disk, and the manifest shows
    // it belongs to a DIFFERENT albumId -- a genuine collision.
    const manifest: DownloadManifest = {
      otherSong: manifestEntry({ artist: 'Artist', album: 'Album', albumId: 'some-other-album' }),
    };
    const pathExists = jest
      .fn()
      .mockImplementation(async (p: string) => p.endsWith('/Artist/Album'));

    const result = await resolveAlbumFolder(
      '/downloads',
      'Artist',
      'Album',
      'album1',
      manifest,
      pathExists
    );

    expect(result).toEqual({ artistSegment: 'Artist', albumSegment: 'Album (2)' });
  });

  it('treats an existing foreign folder (no manifest record at all) as a collision too', async () => {
    const pathExists = jest
      .fn()
      .mockImplementation(async (p: string) => p.endsWith('/Artist/Album'));

    const result = await resolveAlbumFolder(
      '/downloads',
      'Artist',
      'Album',
      'album1',
      {},
      pathExists
    );

    expect(result).toEqual({ artistSegment: 'Artist', albumSegment: 'Album (2)' });
  });

  it('finds the next free suffix if multiple collisions already exist', async () => {
    const pathExists = jest
      .fn()
      .mockImplementation(
        async (p: string) =>
          p.endsWith('/Artist/Album') ||
          p.endsWith('/Artist/Album (2)') ||
          p.endsWith('/Artist/Album (3)')
      );

    const result = await resolveAlbumFolder(
      '/downloads',
      'Artist',
      'Album',
      'album1',
      {},
      pathExists
    );

    expect(result).toEqual({ artistSegment: 'Artist', albumSegment: 'Album (4)' });
  });
});

describe('empty-folder cleanup (Fix 2, used by Fix 5/6)', () => {
  it('removes the album folder, then the artist folder, when both become empty', async () => {
    bridgeWindow().bridge.downloadDir.removeDirIfEmpty = jest.fn().mockResolvedValue(true);

    await cleanupEmptyAlbumFolders('/downloads/Artist/Album/01 - Song.flac');

    expect(bridgeWindow().bridge.downloadDir.removeDirIfEmpty).toHaveBeenNthCalledWith(
      1,
      '/downloads/Artist/Album'
    );
    expect(bridgeWindow().bridge.downloadDir.removeDirIfEmpty).toHaveBeenNthCalledWith(
      2,
      '/downloads/Artist'
    );
  });

  it('never force-deletes: stops after the album check if it is not actually empty', async () => {
    bridgeWindow().bridge.downloadDir.removeDirIfEmpty = jest.fn().mockResolvedValue(false);

    await cleanupEmptyAlbumFolders('/downloads/Artist/Album/01 - Song.flac');

    expect(bridgeWindow().bridge.downloadDir.removeDirIfEmpty).toHaveBeenCalledTimes(1);
    expect(bridgeWindow().bridge.downloadDir.removeDirIfEmpty).toHaveBeenCalledWith(
      '/downloads/Artist/Album'
    );
  });

  it('audit fix: removes leftover album art before checking emptiness, so the folder still gets cleaned up', async () => {
    // The last song was just removed -- all that's left in the album folder
    // is the cover.jpg this feature itself downloaded alongside it.
    bridgeWindow().bridge.downloadDir.listEntries = jest
      .fn()
      .mockResolvedValue([{ name: 'cover.jpg', isDirectory: false }]);
    bridgeWindow().bridge.downloadDir.removeDirIfEmpty = jest.fn().mockResolvedValue(true);

    await cleanupEmptyAlbumFolders('/downloads/Artist/Album/01 - Song.flac');

    expect(bridgeWindow().bridge.downloadDir.removeIfExists).toHaveBeenCalledWith(
      '/downloads/Artist/Album/cover.jpg'
    );
    expect(bridgeWindow().bridge.downloadDir.removeDirIfEmpty).toHaveBeenCalledWith(
      '/downloads/Artist/Album'
    );
  });

  it('audit fix: does not remove cover.jpg (or anything else) if another song file still remains', async () => {
    bridgeWindow().bridge.downloadDir.listEntries = jest.fn().mockResolvedValue([
      { name: 'cover.jpg', isDirectory: false },
      { name: '02 - Other Song.flac', isDirectory: false },
    ]);

    await cleanupEmptyAlbumFolders('/downloads/Artist/Album/01 - Song.flac');

    expect(bridgeWindow().bridge.downloadDir.removeIfExists).not.toHaveBeenCalled();
  });

  it('audit fix: does not remove a genuinely foreign file the user placed in the folder', async () => {
    bridgeWindow().bridge.downloadDir.listEntries = jest
      .fn()
      .mockResolvedValue([{ name: 'my-notes.txt', isDirectory: false }]);

    await cleanupEmptyAlbumFolders('/downloads/Artist/Album/01 - Song.flac');

    expect(bridgeWindow().bridge.downloadDir.removeIfExists).not.toHaveBeenCalled();
    // removeDirIfEmpty's own honest readdir check still correctly refuses to
    // remove a non-empty folder.
    expect(bridgeWindow().bridge.downloadDir.removeDirIfEmpty).toHaveBeenCalledWith(
      '/downloads/Artist/Album'
    );
  });
});

// Defense-in-depth: the ultimate enforcement is main.dev.mjs's assertUnderDir
// checks on every bridge:download:* handler (unchanged, already covered by
// the pre-existing assertUnderDir.test.ts), but this confirms the renderer's
// own path CONSTRUCTION never even produces an escaping path in the first
// place, for maximally hostile server-provided metadata.
describe('rejects a path that would escape the download root (assertUnderDir, Fix 2)', () => {
  it('resolveAlbumFolder + buildDownloadFileName never produce a path outside the download root', async () => {
    const downloadRoot = '/downloads';
    const pathExists = jest.fn().mockResolvedValue(false);
    const hostileInputs = [
      { artist: '../../../etc', album: '../../passwd', title: '../../../root/.ssh/id_rsa' },
      { artist: '..', album: '..', title: '..' },
      { artist: '/etc/passwd', album: '/root', title: '/etc/shadow' },
    ];

    await Promise.all(
      hostileInputs.map(async ({ artist, album, title }) => {
        const { artistSegment, albumSegment } = await resolveAlbumFolder(
          downloadRoot,
          artist,
          album,
          undefined,
          {},
          pathExists
        );
        const fileName = buildDownloadFileName(1, title, 'mp3');
        const finalPath = `${downloadRoot}/${artistSegment}/${albumSegment}/${fileName}`;

        expect(() => assertUnderDir(finalPath, downloadRoot)).not.toThrow();
      })
    );
  });
});
