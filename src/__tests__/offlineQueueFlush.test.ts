jest.mock('../components/shared/toast', () => ({
  notifyToast: jest.fn(),
}));
jest.mock('../shared/applyMutationSuccess', () => ({
  applyFavoriteSuccess: jest.fn(),
  applyRatingSuccess: jest.fn(),
}));

import { attemptQueueFlush } from '../shared/offlineQueueFlush';
import { addToQueue, readAllEntries, markEntryRetried } from '../shared/offlineActionQueue';
import { notifyToast } from '../components/shared/toast';
import { applyFavoriteSuccess, applyRatingSuccess } from '../shared/applyMutationSuccess';
import { Server } from '../types';

const QUEUE_PATH = '/cache/sonixd-redux-cache/offline-action-queue.json';

const makeStore = () => {
  let contents: string | null = null;
  const readFn = jest.fn(async () => contents);
  const writeFn = jest.fn(async (_path: string, data: string) => {
    contents = data;
  });
  return { readFn, writeFn };
};

describe('attemptQueueFlush', () => {
  beforeEach(() => {
    (notifyToast as jest.Mock).mockReset();
  });

  it('does nothing when the queue is empty (cheap early exit)', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn();

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    expect(callFn).not.toHaveBeenCalled();
    expect(writeFn).not.toHaveBeenCalled();
  });

  it('replays queued items in FIFO order', async () => {
    const { readFn, writeFn } = makeStore();
    const order: string[] = [];
    const callFn = jest.fn(async (opts: { args?: { id: string } }) => {
      order.push(opts.args?.id ?? '');
      return { status: 'ok' };
    });

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'first', time: 1 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );
    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'second', time: 2 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    expect(order).toEqual(['first', 'second']);
  });

  it('replays Subsonic scrobbles with their original queued timestamp', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockResolvedValue({ status: 'ok' });

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'song1', albumId: 'album1', time: 1234567 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    expect(callFn).toHaveBeenCalledWith({
      serverType: Server.Subsonic,
      endpoint: 'scrobble',
      args: { id: 'song1', albumId: 'album1', submission: true, time: 1234567 },
    });
  });

  it('replays Jellyfin scrobbles via the stopped-event call with no backdating', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockResolvedValue({ status: 'ok' });

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Jellyfin, id: 'song1', time: 1234567, position: 999 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    const call = callFn.mock.calls[0][0];
    expect(call.endpoint).toBe('scrobble');
    expect(call.args).toEqual({ id: 'song1', submission: true, position: 999 });
    // No backdating field (e.g. `time`) is present on the replayed Jellyfin call.
    expect(call.args.time).toBeUndefined();
  });

  it('marks a failed item as retried once rather than dropping it immediately', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockRejectedValue(new Error('still offline'));

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'song1', time: 1 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(1);
    expect(entries[0].hasBeenRetried).toBe(true);
    expect(notifyToast).not.toHaveBeenCalled();
  });

  it('drops an item and includes it in the summary after a second consecutive failure', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockRejectedValue(new Error('still offline'));

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'song1', time: 1 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    // First flush attempt: fails, marked retried.
    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });
    // Second flush attempt: fails again -- dropped.
    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(0);
    expect(notifyToast).toHaveBeenCalledWith('warning', expect.any(String));
  });

  // Audit fix (Section 3 finding): the 2-strikes drop rule was only ever
  // proven by test for scrobble entries -- the flush loop's bookkeeping
  // (hasBeenRetried/drop-on-second-failure) is written generically over
  // OfflineQueueEntry, not scrobble-specific, but per this audit's own
  // standard ("confirm by test, not inspection"), nothing actually proved a
  // queued rating entry gets dropped the same way after a second failure.
  it('drops a queued rating entry (not just scrobbles) after a second consecutive failure', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockRejectedValue(new Error('still offline'));

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'rating',
        payload: { serverType: Server.Subsonic, id: 'song1', rating: 4 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });
    const afterFirstAttempt = await readAllEntries(QUEUE_PATH, readFn);
    expect(afterFirstAttempt).toHaveLength(1);
    expect(afterFirstAttempt[0].hasBeenRetried).toBe(true);

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(0);
    expect(notifyToast).toHaveBeenCalledWith('warning', expect.any(String));
  });

  it('does not attempt to flush entries queued against a different server than the one currently connected', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockResolvedValue({ status: 'ok' });

    await addToQueue(
      {
        serverId: 'server-other',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'song1', time: 1 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    expect(callFn).not.toHaveBeenCalled();
    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(1);
    expect(entries[0].serverId).toBe('server-other');
  });

  it('does not start a second flush while one is already in progress', async () => {
    const { readFn, writeFn } = makeStore();
    // Resolved from the start (not deferred) -- the guard this test checks is
    // decided synchronously, before either flush's first await, so how long
    // the replay call itself takes doesn't matter for what's being asserted.
    const callFn = jest.fn().mockResolvedValue({ status: 'ok' });

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'song1', time: 1 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    const firstFlush = attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });
    // Started synchronously, before firstFlush has had a chance to reach its
    // own first await -- flushInProgress is already set by then, so this call
    // must bail out immediately rather than starting a second, overlapping flush.
    const secondFlush = attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
    });

    await Promise.all([firstFlush, secondFlush]);

    expect(callFn).toHaveBeenCalledTimes(1);
  });
});

describe('flush bookkeeping isolation (Fix 4)', () => {
  it('a bookkeeping failure for one entry does not prevent the drop-summary toast for other entries in the same pass', async () => {
    const { readFn, writeFn: realWriteFn } = makeStore();
    const callFn = jest.fn().mockRejectedValue(new Error('still offline'));

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'song1', time: 1 },
      },
      QUEUE_PATH,
      readFn,
      realWriteFn
    );
    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'scrobble',
        payload: { serverType: Server.Subsonic, id: 'song2', time: 2 },
      },
      QUEUE_PATH,
      readFn,
      realWriteFn
    );

    // Both entries already failed once -- this flush pass will drop both.
    const preEntries = await readAllEntries(QUEUE_PATH, readFn);
    for (const entry of preEntries) {
      await markEntryRetried(entry.id, QUEUE_PATH, readFn, realWriteFn);
    }

    // The underlying persistence write fails exactly once (simulating a
    // transient disk/IPC fault for whichever entry's bookkeeping mutation
    // happens to reach the write first) -- Fix 4's per-entry try/catch means
    // this must not abort the other entry's bookkeeping or suppress the
    // toast for entries whose "drop" outcome was already decided.
    let writeCount = 0;
    const flakyWriteFn = jest.fn(async (path: string, data: string) => {
      writeCount += 1;
      if (writeCount === 1) throw new Error('disk fault');
      await realWriteFn(path, data);
    });

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn: flakyWriteFn,
      callFn,
    });

    expect(notifyToast).toHaveBeenCalledWith('warning', expect.any(String));
    const [, message] = (notifyToast as jest.Mock).mock.calls[0];
    expect(message).toContain('2');
  });
});

describe('UI-refresh-on-replay (Fix 7)', () => {
  beforeEach(() => {
    (applyFavoriteSuccess as jest.Mock).mockReset().mockResolvedValue(undefined);
    (applyRatingSuccess as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('a successfully replayed rating change triggers the same UI-update side effects as a live successful change', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockResolvedValue({ status: 'ok' });
    const dispatch = jest.fn();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'rating',
        payload: { serverType: Server.Subsonic, id: 'song1', rating: 4 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
      dispatch,
    });

    expect(applyRatingSuccess).toHaveBeenCalledWith({ id: 'song1', rating: 4 }, dispatch);
    expect(applyFavoriteSuccess).not.toHaveBeenCalled();
  });

  it('a successfully replayed favorite change triggers the same UI-update side effects as a live successful change', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockResolvedValue({ status: 'ok' });
    const dispatch = jest.fn();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'favorite',
        payload: { serverType: Server.Subsonic, id: 'song1', itemType: 'music', starred: true },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
      dispatch,
    });

    expect(applyFavoriteSuccess).toHaveBeenCalledWith({ id: 'song1', starred: true }, dispatch);
    expect(applyRatingSuccess).not.toHaveBeenCalled();
  });

  it('a failed rating replay does not trigger the UI-update side effect', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockRejectedValue(new Error('still offline'));
    const dispatch = jest.fn();

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'rating',
        payload: { serverType: Server.Subsonic, id: 'song1', rating: 4 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
      dispatch,
    });

    expect(applyRatingSuccess).not.toHaveBeenCalled();
  });

  it('a UI-update side-effect failure does not cause a successfully replayed entry to be treated as failed', async () => {
    const { readFn, writeFn } = makeStore();
    const callFn = jest.fn().mockResolvedValue({ status: 'ok' });
    const dispatch = jest.fn();
    (applyRatingSuccess as jest.Mock).mockRejectedValue(new Error('cache update failed'));

    await addToQueue(
      {
        serverId: 'server-a',
        actionType: 'rating',
        payload: { serverType: Server.Subsonic, id: 'song1', rating: 4 },
      },
      QUEUE_PATH,
      readFn,
      writeFn
    );

    await attemptQueueFlush({
      serverId: 'server-a',
      queuePath: QUEUE_PATH,
      readFn,
      writeFn,
      callFn,
      dispatch,
    });

    // The server mutation (callFn) succeeded -- the entry must be removed
    // from the queue (not retried/dropped) regardless of the UI-refresh
    // failure above.
    const entries = await readAllEntries(QUEUE_PATH, readFn);
    expect(entries).toHaveLength(0);
  });
});
