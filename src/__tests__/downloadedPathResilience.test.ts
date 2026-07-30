import { resolveDownloadedPathWithResilience } from '../shared/downloadedPathResilience';
import { setDownloadedPathIndex, getDownloadedPath } from '../shared/downloadedPathIndex';
import { removeDownloadedSongIds } from '../redux/downloadedSongsSlice';

type BridgeWindow = Window & {
  bridge: {
    downloadDir: { exists: jest.Mock };
    recovery: { read: jest.Mock; write: jest.Mock };
  };
};

const bridgeWindow = () => window as unknown as BridgeWindow;

describe('manifest resilience (Fix 6)', () => {
  beforeEach(() => {
    setDownloadedPathIndex({ song1: '/downloads/Artist/Album/01 - Song.flac' });
    bridgeWindow().bridge.downloadDir.exists = jest.fn().mockResolvedValue(true);
    bridgeWindow().bridge.recovery.read = jest.fn().mockResolvedValue(
      JSON.stringify({
        song1: {
          path: '/downloads/Artist/Album/01 - Song.flac',
          artist: 'Artist',
          album: 'Album',
          albumId: 'album1',
          title: 'Song',
          ext: 'flac',
          size: 1,
        },
      })
    );
    bridgeWindow().bridge.recovery.write = jest.fn().mockResolvedValue(undefined);
  });

  it('returns the path unchanged when the file still exists', async () => {
    const dispatch = jest.fn();
    const path = await resolveDownloadedPathWithResilience('song1', dispatch);
    expect(path).toBe('/downloads/Artist/Album/01 - Song.flac');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns undefined for a song with no downloaded entry at all', async () => {
    const dispatch = jest.fn();
    const path = await resolveDownloadedPathWithResilience('nonexistent', dispatch);
    expect(path).toBeUndefined();
    expect(bridgeWindow().bridge.downloadDir.exists).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not crash or misreport availability when a manifest entry points to a missing file -- self-corrects the index instead', async () => {
    bridgeWindow().bridge.downloadDir.exists = jest.fn().mockResolvedValue(false);
    const dispatch = jest.fn();

    const path = await resolveDownloadedPathWithResilience('song1', dispatch);

    expect(path).toBeUndefined();
    // In-memory path index self-corrected -- immediately reflected for any
    // subsequent synchronous lookup, even before the async manifest write below lands.
    expect(getDownloadedPath('song1')).toBeUndefined();
    // Redux index self-corrected too.
    expect(dispatch).toHaveBeenCalledWith(removeDownloadedSongIds(['song1']));
  });

  it('removes the stale entry from the persistent manifest too', async () => {
    bridgeWindow().bridge.downloadDir.exists = jest.fn().mockResolvedValue(false);
    const dispatch = jest.fn();

    await resolveDownloadedPathWithResilience('song1', dispatch);
    // The manifest write is fire-and-forget (not awaited by the resolver
    // itself) -- flush microtasks so it lands before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridgeWindow().bridge.recovery.write).toHaveBeenCalled();
    const [, writtenRaw] = bridgeWindow().bridge.recovery.write.mock.calls[0];
    expect(JSON.parse(writtenRaw)).toEqual({});
  });
});
