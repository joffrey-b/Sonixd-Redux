jest.mock('../api/controller', () => ({
  apiController: jest.fn(),
}));
jest.mock('../components/shared/toast', () => ({
  notifyToast: jest.fn(),
}));

import { apiController } from '../api/controller';
import { notifyToast } from '../components/shared/toast';
import {
  submitScrobbleWithQueueFallback,
  submitFavoriteWithQueueFallback,
  submitRatingWithQueueFallback,
} from '../shared/offlineSubmission';
import { readAllEntries, getOfflineQueuePath } from '../shared/offlineActionQueue';
import { Server } from '../types';

const mockApiController = apiController as jest.MockedFunction<typeof apiController>;

describe('submitScrobbleWithQueueFallback', () => {
  beforeEach(() => {
    mockApiController.mockReset();
    (window.bridge.recovery.read as jest.Mock) = jest.fn().mockResolvedValue(null);
    (window.bridge.recovery.write as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });

  it('calls the real Subsonic scrobble endpoint with the time parameter on success', async () => {
    mockApiController.mockResolvedValue({ status: 'ok' });

    await submitScrobbleWithQueueFallback({
      serverType: Server.Subsonic,
      id: 'song1',
      effectiveOffline: false,
    });

    expect(mockApiController).toHaveBeenCalledWith({
      serverType: Server.Subsonic,
      endpoint: 'scrobble',
      args: expect.objectContaining({ id: 'song1', submission: true, time: expect.any(Number) }),
    });
    expect(window.bridge.recovery.write).not.toHaveBeenCalled();
  });

  it('calls the real Jellyfin stopped-event endpoint on success', async () => {
    mockApiController.mockResolvedValue({ status: 'ok' });

    await submitScrobbleWithQueueFallback({
      serverType: Server.Jellyfin,
      id: 'song1',
      position: 500_000_000,
      effectiveOffline: false,
    });

    expect(mockApiController).toHaveBeenCalledWith({
      serverType: Server.Jellyfin,
      endpoint: 'scrobble',
      args: { id: 'song1', submission: true, position: 500_000_000 },
    });
    expect(window.bridge.recovery.write).not.toHaveBeenCalled();
  });

  it('queues the scrobble with the real listen timestamp when the call fails, and re-throws (Fix 3)', async () => {
    mockApiController.mockRejectedValue(new Error('network down'));
    const before = Date.now();

    await expect(
      submitScrobbleWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        albumId: 'album1',
        effectiveOffline: false,
      })
    ).rejects.toThrow('network down');

    expect(window.bridge.recovery.write).toHaveBeenCalledWith(
      getOfflineQueuePath(),
      expect.any(String)
    );
    const written = (window.bridge.recovery.write as jest.Mock).mock.calls[0][1];
    const entries = JSON.parse(written);
    expect(entries).toHaveLength(1);
    expect(entries[0].actionType).toBe('scrobble');
    expect(entries[0].payload.id).toBe('song1');
    expect(entries[0].payload.albumId).toBe('album1');
    expect(entries[0].payload.time).toBeGreaterThanOrEqual(before);
  });

  it('queues a Jellyfin scrobble when the call fails, with no backdating parameter', async () => {
    mockApiController.mockRejectedValue(new Error('network down'));

    await expect(
      submitScrobbleWithQueueFallback({
        serverType: Server.Jellyfin,
        id: 'song1',
        position: 300_000_000,
        effectiveOffline: false,
      })
    ).rejects.toThrow('network down');

    const written = (window.bridge.recovery.write as jest.Mock).mock.calls[0][1];
    const entries = JSON.parse(written);
    expect(entries[0].payload.position).toBe(300_000_000);
    // Jellyfin has no backdating field on the replayed call -- only `position`
    // (playback position) is meaningful, `time` is captured for diagnostics
    // only and is never sent as a backdating param for this server type.
    expect(entries[0].payload.serverType).toBe(Server.Jellyfin);
  });

  it('does not queue a malformed entry when options.id is undefined (Fix 7)', async () => {
    mockApiController.mockRejectedValue(new Error('network down'));

    await expect(
      submitScrobbleWithQueueFallback({
        serverType: Server.Subsonic,
        id: undefined,
        effectiveOffline: false,
      })
    ).rejects.toThrow('network down');

    // Nothing meaningful to retry without a song id -- the original failing
    // request never had an `id` param either (axios drops undefined), so
    // queuing `id: ''` would replay a differently-shaped request than what
    // was actually attempted.
    expect(window.bridge.recovery.write).not.toHaveBeenCalled();
  });
});

// Audit fix: none of the three wrappers previously checked connectivity
// state before attempting a live call -- fine for genuinely detected
// offline (the call naturally fails into the queue path below), but "Force
// offline mode" is a user request to not touch the network at all, and a
// still-live connection meant the request just silently succeeded instead.
describe('effectiveOffline skips the live call entirely (forced offline mode)', () => {
  beforeEach(() => {
    mockApiController.mockReset();
    mockApiController.mockResolvedValue({ status: 'ok' });
    (window.bridge.recovery.read as jest.Mock) = jest.fn().mockResolvedValue(null);
    (window.bridge.recovery.write as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });

  it('submitScrobbleWithQueueFallback never calls apiController and queues immediately', async () => {
    await expect(
      submitScrobbleWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        effectiveOffline: true,
      })
    ).rejects.toThrow();

    expect(mockApiController).not.toHaveBeenCalled();
    const written = (window.bridge.recovery.write as jest.Mock).mock.calls[0][1];
    const entries = JSON.parse(written);
    expect(entries[0].actionType).toBe('scrobble');
    expect(entries[0].payload.id).toBe('song1');
  });

  it('submitFavoriteWithQueueFallback never calls apiController and queues immediately', async () => {
    await expect(
      submitFavoriteWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        itemType: 'music',
        starred: true,
        effectiveOffline: true,
      })
    ).rejects.toThrow();

    expect(mockApiController).not.toHaveBeenCalled();
    const written = (window.bridge.recovery.write as jest.Mock).mock.calls[0][1];
    const entries = JSON.parse(written);
    expect(entries[0].actionType).toBe('favorite');
    expect(entries[0].payload.id).toBe('song1');
  });

  it('submitRatingWithQueueFallback never calls apiController and queues immediately', async () => {
    await expect(
      submitRatingWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        rating: 4,
        effectiveOffline: true,
      })
    ).rejects.toThrow();

    expect(mockApiController).not.toHaveBeenCalled();
    const written = (window.bridge.recovery.write as jest.Mock).mock.calls[0][1];
    const entries = JSON.parse(written);
    expect(entries[0].actionType).toBe('rating');
    expect(entries[0].payload.id).toBe('song1');
  });
});

describe('submitFavoriteWithQueueFallback', () => {
  beforeEach(() => {
    mockApiController.mockReset();
    (window.bridge.recovery.read as jest.Mock) = jest.fn().mockResolvedValue(null);
    (window.bridge.recovery.write as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });

  it('calls the real star endpoint on success and does not queue anything', async () => {
    mockApiController.mockResolvedValue({ status: 'ok' });

    await submitFavoriteWithQueueFallback({
      serverType: Server.Subsonic,
      id: 'song1',
      itemType: 'music',
      starred: true,
      effectiveOffline: false,
    });

    expect(mockApiController).toHaveBeenCalledWith({
      serverType: Server.Subsonic,
      endpoint: 'star',
      args: { id: 'song1', type: 'music' },
    });
    expect(window.bridge.recovery.write).not.toHaveBeenCalled();
  });

  it('calls unstar when starred is false', async () => {
    mockApiController.mockResolvedValue({ status: 'ok' });

    await submitFavoriteWithQueueFallback({
      serverType: Server.Subsonic,
      id: 'song1',
      itemType: 'music',
      starred: false,
      effectiveOffline: false,
    });

    expect(mockApiController).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'unstar' }));
  });

  it('queues the favorite change on failure AND re-throws to the caller (Fix 3)', async () => {
    mockApiController.mockRejectedValue(new Error('offline'));

    await expect(
      submitFavoriteWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        itemType: 'music',
        starred: true,
        effectiveOffline: false,
      })
    ).rejects.toThrow('offline');

    // Both things are true simultaneously: queued for replay, AND the
    // caller still sees the exact failure signal it always did.
    const written = (window.bridge.recovery.write as jest.Mock).mock.calls[0][1];
    const entries = JSON.parse(written);
    expect(entries[0].actionType).toBe('favorite');
    expect(entries[0].payload.starred).toBe(true);
  });
});

describe('submitRatingWithQueueFallback', () => {
  beforeEach(() => {
    mockApiController.mockReset();
    (notifyToast as jest.Mock).mockReset();
    (window.bridge.recovery.read as jest.Mock) = jest.fn().mockResolvedValue(null);
    (window.bridge.recovery.write as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });

  it('calls the real setRating endpoint on success and does not queue anything', async () => {
    mockApiController.mockResolvedValue([{ status: 'ok' }]);

    await submitRatingWithQueueFallback({
      serverType: Server.Subsonic,
      id: 'song1',
      rating: 4,
      effectiveOffline: false,
    });

    expect(mockApiController).toHaveBeenCalledWith({
      serverType: Server.Subsonic,
      endpoint: 'setRating',
      args: { ids: ['song1'], rating: 4 },
    });
    expect(window.bridge.recovery.write).not.toHaveBeenCalled();
  });

  it('queues the rating change on failure AND re-throws to the caller (Fix 3)', async () => {
    mockApiController.mockRejectedValue(new Error('offline'));

    await expect(
      submitRatingWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        rating: 2,
        effectiveOffline: false,
      })
    ).rejects.toThrow('offline');

    const written = (window.bridge.recovery.write as jest.Mock).mock.calls[0][1];
    const entries = JSON.parse(written);
    expect(entries[0].actionType).toBe('rating');
    expect(entries[0].payload.rating).toBe(2);
  });

  it('surfaces a clear "not supported" toast for Jellyfin ratings instead of silently succeeding (Fix 2)', async () => {
    await expect(
      submitRatingWithQueueFallback({
        serverType: Server.Jellyfin,
        id: 'song1',
        rating: 3,
        effectiveOffline: false,
      })
    ).rejects.toThrow();

    expect(notifyToast).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('not supported on Jellyfin')
    );
    // Never attempted (no real endpoint exists) and never queued (a replay
    // would fail identically every time -- there's nothing to retry).
    expect(mockApiController).not.toHaveBeenCalled();
    expect(window.bridge.recovery.write).not.toHaveBeenCalled();
  });
});

describe('offline submission wrappers -- queue durability', () => {
  it('a queued entry can be read back via readAllEntries', async () => {
    mockApiController.mockReset();
    mockApiController.mockRejectedValue(new Error('offline'));
    let stored: string | null = null;
    (window.bridge.recovery.read as jest.Mock) = jest.fn(async () => stored);
    (window.bridge.recovery.write as jest.Mock) = jest.fn(async (_p: string, data: string) => {
      stored = data;
    });

    await expect(
      submitScrobbleWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        effectiveOffline: false,
      })
    ).rejects.toThrow('offline');

    const entries = await readAllEntries(getOfflineQueuePath(), window.bridge.recovery.read);
    expect(entries).toHaveLength(1);
  });
});

describe('bulk rating queueing (Fix 5)', () => {
  // ContextMenu.tsx's bulk handleRating now calls submitRatingWithQueueFallback
  // once per selected id (Promise.all of individual calls) instead of one
  // apiController({endpoint:'setRating', args:{ids, rating}}) call -- these
  // tests exercise that exact mechanism directly, at the level it actually
  // operates (the queue), rather than rendering the whole ContextMenu component.
  beforeEach(() => {
    mockApiController.mockReset();
    mockApiController.mockRejectedValue(new Error('offline'));
    (window.bridge.recovery.read as jest.Mock) = jest.fn().mockResolvedValue(null);
    (window.bridge.recovery.write as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });

  it('a failed bulk rating change queues one entry per selected song id', async () => {
    const ids = ['song1', 'song2', 'song3'];
    let stored: string | null = null;
    (window.bridge.recovery.read as jest.Mock) = jest.fn(async () => stored);
    (window.bridge.recovery.write as jest.Mock) = jest.fn(async (_p: string, data: string) => {
      stored = data;
    });

    await Promise.allSettled(
      ids.map((id) =>
        submitRatingWithQueueFallback({
          serverType: Server.Subsonic,
          id,
          rating: 4,
          effectiveOffline: false,
        })
      )
    );

    const entries = await readAllEntries(getOfflineQueuePath(), window.bridge.recovery.read);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => (e.actionType === 'rating' ? e.payload.id : null)).sort()).toEqual([
      'song1',
      'song2',
      'song3',
    ]);
  });

  it('bulk rating entries coalesce correctly if the same song is rated twice while offline', async () => {
    let stored: string | null = null;
    (window.bridge.recovery.read as jest.Mock) = jest.fn(async () => stored);
    (window.bridge.recovery.write as jest.Mock) = jest.fn(async (_p: string, data: string) => {
      stored = data;
    });

    await expect(
      submitRatingWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        rating: 2,
        effectiveOffline: false,
      })
    ).rejects.toThrow();
    await expect(
      submitRatingWithQueueFallback({
        serverType: Server.Subsonic,
        id: 'song1',
        rating: 5,
        effectiveOffline: false,
      })
    ).rejects.toThrow();

    const entries = await readAllEntries(getOfflineQueuePath(), window.bridge.recovery.read);
    expect(entries).toHaveLength(1);
    expect(entries[0].actionType === 'rating' && entries[0].payload.rating).toBe(5);
  });
});
