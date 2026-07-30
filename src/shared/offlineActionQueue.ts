// Durable, restart-surviving queue for scrobble/star/rating actions that failed
// while offline. Storage primitive is the `recovery` bridge API (validated
// write/read/remove of a string to a path under the cache dir) -- read/write
// functions are dependency-injected (mirroring resolveSongPlaybackSource.ts)
// rather than imported directly, so this module stays testable without the
// real bridge. The whole queue lives as one JSON array in one file (see
// getOfflineQueuePath below) -- `recovery` has no listing/enumeration
// capability, so a per-item file scheme would need its own index anyway,
// which the single-array-file approach avoids.
import { nanoid } from 'nanoid/non-secure';
import { settings } from '../components/shared/bridge';
import { joinPath } from './baseCachePath';
import { createAsyncLock } from './asyncLock';
import type { ServerType } from '../types';

// --- cachePath / serverId resolution, cached in memory ----------------------
//
// attemptQueueFlush() (offlineQueueFlush.ts) calls getOfflineQueuePath() and
// getCachedServerId() on every single successful HTTP response, so both must
// resolve with zero IPC calls in the common (cache warm) case. Mirrors
// api.ts's credentialCache pattern exactly: resolved once via async invoke
// (settings.getCachePath() / settings.getCredentials(), never the sync
// sendSync-backed settings.get()), cached in memory, invalidated explicitly
// by clearOfflineQueuePathCache() on login/disconnect (called from the same
// two places clearCredentialCache() already is). Before the first async
// resolution completes, falls back to the synchronous settings.get() this
// module used exclusively before this fix -- so the very first call after
// app boot still returns a correct value, at the cost of one sync IPC call,
// exactly like getCachedCredentials()'s own documented tradeoff. Every call
// after that first one resolves purely from memory.
//
// Audit fix (Section 5 reuse finding): tried migrating this to the new
// createAsyncCachedValue factory (shared/createAsyncCachedValue.ts) as a
// composite { cachePath, serverId } value. Reverted -- a live test run
// caught a real regression: getCachedBaseCachePath() and getCachedServerId()
// are called independently by different callers, each needing only its own
// key, but a single composite cache's cold-path sync fallback resolves BOTH
// settings.get() calls on every cold get(), not just the one the caller
// actually needed -- doubling sync IPC calls versus this hand-written
// version, exactly what Lesson #1 exists to prevent. The two values are only
// atomic on the WARM (async-refreshed) path, not the cold sync-fallback path,
// which the generic factory's one-fallback-function contract can't express.
// Kept as its own implementation rather than forcing a shared shape that
// doesn't actually fit -- same judgment call as offlineQueueFlush.ts's
// replay+bookkeeping fan-out not fitting mapWithConcurrency.
let cachedCachePath: string | null = null;
let cachedServerId: string | null = null;
let queueCacheRefreshing = false;

const refreshQueueCache = (): void => {
  if (queueCacheRefreshing) return;
  queueCacheRefreshing = true;
  Promise.all([settings.getCachePath(), settings.getCredentials()])
    .then(([cachePath, credentials]) => {
      cachedCachePath = String(cachePath || '');
      cachedServerId = String(credentials.serverBase64 || '');
      queueCacheRefreshing = false;
      return null;
    })
    .catch(() => {
      queueCacheRefreshing = false;
    });
};

export const clearOfflineQueuePathCache = (): void => {
  cachedCachePath = null;
  cachedServerId = null;
};

const testMockSettings = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require is intentional: avoids bundling mockSettings in production
  return process.env.NODE_ENV === 'test' ? require('./mockSettings').mockSettings : null;
};

const getCachedBaseCachePath = (): string => {
  const ms = testMockSettings();
  if (ms) return ms.cachePath;
  if (cachedCachePath !== null) return cachedCachePath;
  refreshQueueCache();
  return String(settings.get('cachePath'));
};

export const getCachedServerId = (): string => {
  const ms = testMockSettings();
  if (ms) return String(ms.serverBase64 || '');
  if (cachedServerId !== null) return cachedServerId;
  refreshQueueCache();
  return String(settings.get('serverBase64') || '');
};

// Deliberately NOT nested under a per-server serverBase64 segment (unlike the
// song/image cache or the recovery dir PlaylistView.tsx uses) -- the offline
// action queue holds entries tagged with their own serverId and must stay
// readable/writable as one file across a server switch, so entries queued
// against a since-abandoned server remain on disk (and filterable via
// getQueueForServer) rather than becoming invisible the moment the active
// serverBase64 changes.
export const getOfflineQueuePath = (): string => {
  return joinPath(getCachedBaseCachePath(), 'sonixd-redux-cache', 'offline-action-queue.json');
};

export interface ScrobbleQueuePayload {
  serverType: ServerType;
  id: string;
  albumId?: string;
  // Real listen timestamp. Subsonic: ms since epoch, replayed via scrobble.view's
  // `time` param. Jellyfin: not used for backdating (no such param exists on
  // /sessions/playing/stopped) -- kept only for potential future diagnostics.
  time: number;
  // Jellyfin PositionTicks (position seconds * 1e7). Undefined for Subsonic.
  position?: number;
}

export interface FavoriteQueuePayload {
  serverType: ServerType;
  id: string;
  itemType: string; // 'music' | 'album' | 'artist' (matches rowData.type)
  starred: boolean; // true = star, false = unstar
}

export interface RatingQueuePayload {
  serverType: ServerType;
  id: string;
  rating: number;
}

interface QueueEntryBase {
  id: string;
  serverId: string;
  hasBeenRetried: boolean;
}

export type OfflineQueueEntry =
  | (QueueEntryBase & { actionType: 'scrobble'; payload: ScrobbleQueuePayload })
  | (QueueEntryBase & { actionType: 'favorite'; payload: FavoriteQueuePayload })
  | (QueueEntryBase & { actionType: 'rating'; payload: RatingQueuePayload });

export type NewQueueEntry =
  | { serverId: string; actionType: 'scrobble'; payload: ScrobbleQueuePayload }
  | { serverId: string; actionType: 'favorite'; payload: FavoriteQueuePayload }
  | { serverId: string; actionType: 'rating'; payload: RatingQueuePayload };

export type ReadQueueFn = (path: string) => Promise<string | null>;
export type WriteQueueFn = (path: string, data: string) => Promise<void>;

const parseEntries = (raw: string | null): OfflineQueueEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueueEntry[]) : [];
  } catch {
    return [];
  }
};

export const readAllEntries = async (
  queuePath: string,
  readFn: ReadQueueFn
): Promise<OfflineQueueEntry[]> => {
  return parseEntries(await readFn(queuePath));
};

export const writeAllEntries = async (
  queuePath: string,
  entries: OfflineQueueEntry[],
  writeFn: WriteQueueFn
): Promise<void> => {
  await writeFn(queuePath, JSON.stringify(entries));
};

// Every mutation below is read-modify-write against the same one file, which
// is not atomic on its own -- two calls fired close together (e.g. a rapid
// star-then-unstar, or a submission wrapper's queue-on-failure racing the
// flush's own bookkeeping) can each read the pre-mutation state and clobber
// each other's write. This serializes every mutation against every other one
// in this renderer process, regardless of which wrapper triggered it, with a
// fallback handler so one rejected mutation doesn't wedge the chain for
// everything queued after it.
const withQueueLock = createAsyncLock();

export const addToQueue = (
  entry: NewQueueEntry,
  queuePath: string,
  readFn: ReadQueueFn,
  writeFn: WriteQueueFn
): Promise<void> =>
  withQueueLock(async () => {
    const entries = await readAllEntries(queuePath, readFn);
    const fullEntry = { ...entry, id: nanoid(), hasBeenRetried: false } as OfflineQueueEntry;

    if (entry.actionType === 'scrobble') {
      // Never coalesced -- every failed scrobble is a distinct, real listen.
      entries.push(fullEntry);
    } else {
      // Star/rating: coalesce on {serverId, actionType, target id} -- only the
      // final desired state matters, so replace rather than append.
      const existingIndex = entries.findIndex(
        (e) =>
          e.actionType === entry.actionType &&
          e.serverId === entry.serverId &&
          e.payload.id === entry.payload.id
      );

      if (existingIndex >= 0) {
        entries[existingIndex] = fullEntry;
      } else {
        entries.push(fullEntry);
      }
    }

    await writeAllEntries(queuePath, entries, writeFn);
  });

export const removeFromQueue = (
  entryId: string,
  queuePath: string,
  readFn: ReadQueueFn,
  writeFn: WriteQueueFn
): Promise<void> =>
  withQueueLock(async () => {
    const entries = await readAllEntries(queuePath, readFn);
    const next = entries.filter((e) => e.id !== entryId);

    if (next.length !== entries.length) {
      await writeAllEntries(queuePath, next, writeFn);
    }
  });

// Used only by the flush mechanism, between a failed replay's first and
// second attempt -- targets a single entry by id (a fresh read-modify-write,
// not a stale snapshot from before the replay's network call), so it can't
// clobber an unrelated mutation that happened while the replay was in flight.
export const markEntryRetried = (
  entryId: string,
  queuePath: string,
  readFn: ReadQueueFn,
  writeFn: WriteQueueFn
): Promise<void> =>
  withQueueLock(async () => {
    const entries = await readAllEntries(queuePath, readFn);
    const index = entries.findIndex((e) => e.id === entryId);

    if (index >= 0) {
      entries[index] = { ...entries[index], hasBeenRetried: true };
      await writeAllEntries(queuePath, entries, writeFn);
    }
  });

export const getQueueForServer = async (
  serverId: string,
  queuePath: string,
  readFn: ReadQueueFn
): Promise<OfflineQueueEntry[]> => {
  const entries = await readAllEntries(queuePath, readFn);
  return entries.filter((e) => e.serverId === serverId);
};
