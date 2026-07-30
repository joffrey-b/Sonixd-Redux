import {
  addToQueue,
  removeFromQueue,
  getQueueForServer,
  readAllEntries,
  getOfflineQueuePath,
  getCachedServerId,
  clearOfflineQueuePathCache,
  type OfflineQueueEntry,
} from '../shared/offlineActionQueue';

const QUEUE_PATH = '/cache/sonixd-redux-cache/offline-action-queue.json';

// In-memory fake backing store standing in for the recovery bridge -- mirrors
// how resolveSongPlaybackSource.test.ts stubs its injected IO function.
const makeStore = () => {
  let contents: string | null = null;
  const readFn = jest.fn(async () => contents);
  const writeFn = jest.fn(async (_path: string, data: string) => {
    contents = data;
  });
  return { readFn, writeFn, get: () => contents };
};

describe('offlineActionQueue', () => {
  it('adds a scrobble entry without coalescing duplicate scrobbles for the same song', async () => {
    const { readFn, writeFn } = makeStore();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: 'subsonic' as never, id: 'song1', time: 1000 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );
    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: 'subsonic' as never, id: 'song1', time: 2000 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.actionType === 'scrobble')).toBe(true);
  });

  it('coalesces a second star/rating change for the same song into one entry', async () => {
    const { readFn, writeFn } = makeStore();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'rating',
        payload: { serverType: 'subsonic' as never, id: 'song1', rating: 3 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );
    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'rating',
        payload: { serverType: 'subsonic' as never, id: 'song1', rating: 5 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(1);
    expect(entries[0].actionType === 'rating' && entries[0].payload.rating).toBe(5);
  });

  it('coalesces a rapid star-then-unstar of the same song into one favorite entry', async () => {
    const { readFn, writeFn } = makeStore();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'favorite',
        payload: { serverType: 'subsonic' as never, id: 'song1', itemType: 'music', starred: true },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );
    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'favorite',
        payload: {
          serverType: 'subsonic' as never,
          id: 'song1',
          itemType: 'music',
          starred: false,
        },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(1);
    expect(entries[0].actionType === 'favorite' && entries[0].payload.starred).toBe(false);
  });

  it('assigns a unique, stable id to each entry', async () => {
    const { readFn, writeFn } = makeStore();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: 'subsonic' as never, id: 'song1', time: 1000 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );
    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: 'subsonic' as never, id: 'song2', time: 1000 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries[0].id).toEqual(expect.any(String));
    expect(entries[1].id).toEqual(expect.any(String));
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  it('records the server identifier on each entry', async () => {
    const { readFn, writeFn } = makeStore();

    await addToQueue(
      {
        serverId: 'server-xyz',
        actionType: 'scrobble',
        payload: { serverType: 'subsonic' as never, id: 'song1', time: 1000 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries[0].serverId).toBe('server-xyz');
  });

  it('removes an entry by id', async () => {
    const { readFn, writeFn } = makeStore();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: 'subsonic' as never, id: 'song1', time: 1000 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );
    const [entry] = await readAllEntries(QUEUE_PATH, readFn);

    await removeFromQueue(entry.id, QUEUE_PATH, readFn, writeFn);

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(0);
  });

  it('getQueueForServer only returns entries matching the given server id', async () => {
    const { readFn, writeFn } = makeStore();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: 'subsonic' as never, id: 'song1', time: 1000 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );
    await addToQueue(
      {
        serverId: 'server-b',
        actionType: 'scrobble',
        payload: { serverType: 'subsonic' as never, id: 'song2', time: 1000 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    const forA = await getQueueForServer('server-a', QUEUE_PATH, readFn);
    const forB = await getQueueForServer('server-b', QUEUE_PATH, readFn);

    expect(forA).toHaveLength(1);
    expect((forA[0] as OfflineQueueEntry & { payload: { id: string } }).payload.id).toBe('song1');
    expect(forB).toHaveLength(1);
    expect((forB[0] as OfflineQueueEntry & { payload: { id: string } }).payload.id).toBe('song2');
  });

  it('returns an empty array when the backing file has never been written', async () => {
    const readFn = jest.fn(async () => null);
    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toEqual([]);
  });
});

describe('offline queue path caching (Fix 1)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Force the real (non-test-mode) code path -- every other test in this
    // file relies on the NODE_ENV==='test' mockSettings shortcut, which
    // bypasses the async cache entirely by design (deterministic, zero-IPC
    // test behavior). This block specifically exercises the cache-then-reuse
    // logic that actually runs in production.
    (process.env as { NODE_ENV: string }).NODE_ENV = 'production';
    clearOfflineQueuePathCache();
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue('/fallback-cache');
    (window.bridge.settings.getCachePath as jest.Mock) = jest.fn().mockResolvedValue('/cache');
    (window.bridge.settings.getCredentials as jest.Mock) = jest
      .fn()
      .mockResolvedValue({ serverBase64: 'server-a' });
  });

  afterEach(() => {
    (process.env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv ?? 'test';
    clearOfflineQueuePathCache();
  });

  it('does not call settings.get (or its async equivalent) more than once across multiple flush attempts', async () => {
    getOfflineQueuePath();
    getCachedServerId();
    // Let the in-flight async refresh resolve and populate the cache.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    getOfflineQueuePath();
    getCachedServerId();
    getOfflineQueuePath();
    getCachedServerId();

    // One sync fallback call each, on the very first invocation only (before
    // the cache was warm) -- matches getCachedCredentials()'s own documented
    // tradeoff in api.ts.
    expect(window.bridge.settings.get).toHaveBeenCalledTimes(2);
    expect(window.bridge.settings.getCachePath).toHaveBeenCalledTimes(1);
    expect(window.bridge.settings.getCredentials).toHaveBeenCalledTimes(1);
  });

  it('resolves zero IPC calls when checking an empty queue after the path is already cached', async () => {
    getOfflineQueuePath();
    getCachedServerId();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    jest.clearAllMocks();

    const path = getOfflineQueuePath();
    const serverId = getCachedServerId();

    expect(path).toBe('/cache/sonixd-redux-cache/offline-action-queue.json');
    expect(serverId).toBe('server-a');
    expect(window.bridge.settings.get).not.toHaveBeenCalled();
    expect(window.bridge.settings.getCachePath).not.toHaveBeenCalled();
    expect(window.bridge.settings.getCredentials).not.toHaveBeenCalled();
  });

  it('re-resolves the cached path after clearOfflineQueuePathCache() is called', async () => {
    getOfflineQueuePath();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    jest.clearAllMocks();
    (window.bridge.settings.get as jest.Mock) = jest.fn().mockReturnValue('/new-fallback');
    (window.bridge.settings.getCachePath as jest.Mock) = jest.fn().mockResolvedValue('/new-cache');

    clearOfflineQueuePathCache();
    const path = getOfflineQueuePath();

    // Immediately after clearing, the cache is cold again -- falls back to
    // the sync read once more, exactly like the very first call ever did.
    expect(path).toBe('/new-fallback/sonixd-redux-cache/offline-action-queue.json');
    expect(window.bridge.settings.get).toHaveBeenCalledTimes(1);
  });
});
