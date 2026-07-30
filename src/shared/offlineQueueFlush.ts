// Replays queued scrobble/star/rating actions once a network call succeeds
// again. Triggered by api.ts/jellyfinApi.ts's success interceptors (any
// successful response is itself evidence of connectivity) via the
// onRequestSuccess subscription at the bottom of this file -- an event
// rather than those interceptors calling attemptQueueFlush directly, to avoid
// a real import/no-cycle dependency cycle (see connectivityEvents.ts).
// Exposed as a clean, independently-callable, zero-arg export so Phase 2's
// connectivity-restored trigger (useConnectivityMonitor.ts) can call the
// exact same function.
//
// Deliberately no separate post-login flush hook: Login.tsx's success paths
// (both Subsonic and Jellyfin) end with a full window.location.reload(), so
// the first successful post-reload request -- almost always the library
// sync's own getAllSongs call -- already flows through the exact same
// interceptor success handler this function is hooked into. A dedicated
// "flush right after login" call would just race that same first request
// for no benefit, since the interceptor hook already covers it.
import { apiController } from '../api/controller';
import { notifyToast } from '../components/shared/toast';
import { recovery } from '../components/shared/bridge';
import i18n from '../i18n/i18n';
import {
  applyFavoriteSuccess,
  applyRatingSuccess,
  type UIEffectDispatch,
} from './applyMutationSuccess';
import { onRequestSuccess } from './connectivityEvents';
import {
  readAllEntries,
  getOfflineQueuePath,
  getCachedServerId,
  removeFromQueue,
  markEntryRetried,
  type OfflineQueueEntry,
  type ReadQueueFn,
  type WriteQueueFn,
} from './offlineActionQueue';
import { Server } from '../types';

// No genuine existing precedent for limiting concurrent in-flight requests
// (batchStar's 325-item chunking is request-size pagination, not concurrency
// limiting). api.ts's getArtistSongs does have a real one -- CONCURRENCY = 5,
// chunked Promise.all -- reused here rather than inventing an unrelated number.
const FLUSH_CONCURRENCY = 5;

type ApiCallFn = typeof apiController;

// Loaded lazily -- redux/store.ts's configureStore() call runs electron-redux's
// stateSyncEnhancer() at module-evaluation time, which requires a real
// __ElectronReduxBridge global (only present in an actual Electron renderer,
// or a test that explicitly sets it up). Unlike apiController/i18n/
// applyMutationSuccess above (all safe to import statically now that api.ts/
// jellyfinApi.ts no longer import back into this module -- see
// connectivityEvents.ts), this one has nothing to do with that cycle: it's
// specifically about not eagerly evaluating the whole Redux store for every
// test that transitively imports this file, most of which have nothing to do
// with Redux at all. Deferred until a favorite/rating entry is actually
// replayed and no dispatch was injected.
const loadDefaultDispatch = async (): Promise<UIEffectDispatch> => {
  const mod = await import('../redux/store');
  return mod.store.dispatch;
};

const replayEntry = async (
  entry: OfflineQueueEntry,
  callFn: ApiCallFn,
  dispatch?: UIEffectDispatch
): Promise<boolean> => {
  try {
    if (entry.actionType === 'scrobble') {
      // No equivalent Fix 7 gap exists for scrobbles (investigated during
      // Phase 2): incrementPlayCountInCache/incrementEntryPlayCount fire
      // unconditionally at all four live scrobble call sites (Player.tsx,
      // PlayerBar.tsx), BEFORE submitScrobbleWithQueueFallback is even
      // called -- not gated on submission success. The local play count is
      // already bumped at the moment of listening, live or offline, so a
      // replayed scrobble has nothing left to apply locally.
      const { serverType, id, albumId, time, position } = entry.payload;
      await callFn({
        serverType,
        endpoint: 'scrobble',
        args:
          serverType === Server.Subsonic
            ? { id, albumId, submission: true, time }
            : { id, submission: true, position },
      });
    } else if (entry.actionType === 'favorite') {
      const { serverType, id, itemType, starred } = entry.payload;
      await callFn({
        serverType,
        endpoint: starred ? 'star' : 'unstar',
        args: { id, type: itemType },
      });
      try {
        // Fix 7 (Phase 2): the same UI-update side effects a live successful
        // favorite change triggers, so a song favorited while offline updates
        // visually once replayed rather than only after navigating away and
        // back. Best-effort -- the server mutation above already succeeded,
        // so a failure here must not cause this entry to be treated as
        // failed and retried/dropped.
        const effectiveDispatch = dispatch ?? (await loadDefaultDispatch());
        await applyFavoriteSuccess({ id, starred }, effectiveDispatch);
      } catch {
        // Swallowed -- see comment above.
      }
    } else {
      const { serverType, id, rating } = entry.payload;
      await callFn({
        serverType,
        endpoint: 'setRating',
        args: { ids: [id], rating },
      });
      try {
        // Fix 7 (Phase 2) -- see the favorite branch above for rationale.
        const effectiveDispatch = dispatch ?? (await loadDefaultDispatch());
        await applyRatingSuccess({ id, rating }, effectiveDispatch);
      } catch {
        // Swallowed -- see comment above.
      }
    }
    return true;
  } catch {
    return false;
  }
};

let flushInProgress = false;

export const attemptQueueFlush = async (deps?: {
  serverId?: string;
  queuePath?: string;
  readFn?: ReadQueueFn;
  writeFn?: WriteQueueFn;
  callFn?: ApiCallFn;
  dispatch?: UIEffectDispatch;
}): Promise<void> => {
  if (flushInProgress) return;
  // Set before any await -- closes the check-then-set race window so two
  // near-simultaneous successful responses can't both start a flush.
  flushInProgress = true;

  try {
    const serverId = deps?.serverId ?? getCachedServerId();
    const queuePath = deps?.queuePath ?? getOfflineQueuePath();
    const readFn = deps?.readFn ?? recovery.read;
    const writeFn = deps?.writeFn ?? recovery.write;

    // This initial read is just a snapshot to decide what to attempt --
    // replaying an entry that's meanwhile been removed by something else is
    // a safe no-op (see removeFromQueue/markEntryRetried below), so slight
    // staleness here is fine. Entries queued against a different or
    // no-longer-connected server are simply never selected -- never replayed
    // against the wrong server, never touched, never discarded. Known,
    // accepted edge case: a permanent server switch leaves these orphaned
    // with no further cleanup in this phase.
    const allEntries = await readAllEntries(queuePath, readFn);
    const relevant = allEntries.filter((e) => e.serverId === serverId);

    // Cheap early exit -- the common case for nearly every user/request.
    if (relevant.length === 0) return;

    const callFn = deps?.callFn ?? apiController;

    const dropped: OfflineQueueEntry[] = [];

    // Real total attempt count and latency budget for a persistently-failing
    // entry (worth knowing before tuning either number): axios-retry already
    // retries every scrobble/star/rating HTTP call (original attempt AND
    // each replay) up to 3 times with 1s/2s/3s backoff before rejecting --
    // that's independent of, and underneath, this function's own
    // hasBeenRetried/2-strikes bookkeeping below. So a queued entry that
    // ultimately gets dropped has actually gone through up to 2 flush-level
    // attempts x up to 4 real HTTP attempts each (1 initial + 3 retries) =
    // up to 8 real network attempts, not "2" -- and each flush-level attempt
    // can silently cost ~6-7s of backoff before this loop even observes the
    // failure. Not a bug, just two independent retry layers stacked on top
    // of each other; noted here since nothing else records that the two are
    // related.
    //
    // FIFO (oldest first) in waves of FLUSH_CONCURRENCY. Each entry's outcome
    // is applied as its own targeted, locked read-modify-write (remove on
    // success/drop, mark-retried on a first failure) rather than one bulk
    // write computed from the snapshot above -- replay calls can take several
    // seconds each (axios-retry's backoff on a still-failing endpoint), and a
    // single final write based on a now-stale snapshot would silently
    // clobber any submission queued by something else in the meantime.
    for (let i = 0; i < relevant.length; i += FLUSH_CONCURRENCY) {
      const chunk = relevant.slice(i, i + FLUSH_CONCURRENCY);

      const results = await Promise.all(
        chunk.map((entry) => replayEntry(entry, callFn, deps?.dispatch))
      );

      // Each entry's bookkeeping mutation gets its own try/catch, same
      // isolation replayEntry already has for the network call itself -- a
      // disk/IPC fault persisting ONE entry's outcome must not abort the
      // rest of this pass (which would also suppress the drop-summary toast
      // for entries whose outcome was already decided earlier in the same
      // pass). A failed bookkeeping write just leaves that entry as-is;
      // it's reconsidered on the next successful flush trigger.
      await Promise.all(
        chunk.map(async (entry, idx) => {
          try {
            if (results[idx]) {
              // Audit finding, documented rather than "fixed": if the app
              // closes in the gap between replayEntry resolving true and
              // this removeFromQueue write actually landing on disk, the
              // entry survives and replays again next launch -- an
              // at-least-once, not exactly-once, delivery guarantee.
              // Reordering this (e.g. marking removed before replaying)
              // would trade a rare duplicate scrobble/star/rating for the
              // strictly worse failure of losing one outright on a crash
              // mid-replay -- worse for this specific domain, where the
              // servers involved (Subsonic/Jellyfin) have no idempotency-key
              // support for us to de-duplicate against, so genuine
              // exactly-once delivery isn't achievable here without
              // server-side changes outside this app's control. Known,
              // accepted edge case -- same category as the
              // orphaned-entries-after-a-server-switch case documented in
              // attemptQueueFlush's own comment above.
              await removeFromQueue(entry.id, queuePath, readFn, writeFn);
              return;
            }

            if (entry.hasBeenRetried) {
              dropped.push(entry);
              await removeFromQueue(entry.id, queuePath, readFn, writeFn);
            } else {
              await markEntryRetried(entry.id, queuePath, readFn, writeFn);
            }
          } catch {
            // Swallowed -- see comment above. This entry's bookkeeping
            // didn't land, but it stays queued and gets a fresh attempt
            // next time, rather than derailing everything else in this pass.
          }
        })
      );
    }

    if (dropped.length > 0) {
      notifyToast(
        'warning',
        i18n.t('{{count}} offline actions could not be synced.', { count: dropped.length })
      );
    }
  } finally {
    flushInProgress = false;
  }
};

// Subscribes to "a request just succeeded" events from api.ts/jellyfinApi.ts
// (see connectivityEvents.ts) -- this replaces what used to be those
// interceptors calling attemptQueueFlush directly, which created a real
// import/no-cycle dependency cycle (api.ts -> offlineQueueFlush.ts ->
// controller.ts -> api.ts). This module must be loaded before the first real
// successful request for this subscription to be in place in time --
// guaranteed today because App.tsx statically imports useConnectivityMonitor,
// which statically imports attemptQueueFlush from this file, and that import
// chain is evaluated at bundle load, well before any request can fire. If
// that import path is ever removed, something must still import this module
// early enough to preserve this ordering.
onRequestSuccess(() => {
  attemptQueueFlush().catch(() => {});
});
