// Shared submission wrappers for scrobble/star/rating actions. Each wrapper
// attempts the real network call first -- on success this is byte-for-byte
// what the call site did before (same endpoint, same args), so online
// behavior is unchanged. On failure, the attempt is queued for replay instead
// of being silently dropped (today's behavior at every one of these call
// sites: fire-and-forget, unhandled rejection, zero recovery) -- but the
// original error is always re-thrown after queueing, so a caller's own
// error-handling contract (e.g. useRating.ts's post-submission refetch,
// which must not run against a change that didn't actually land) is exactly
// as it was before this queue existed. Callers that never expected this call
// to throw in the first place (the four fire-and-forget scrobble call sites
// in Player.tsx/PlayerBar.tsx) are responsible for their own local
// `.catch(() => {})`, same as they'd need for any other rejected promise.
import { apiController } from '../api/controller';
import { recovery } from '../components/shared/bridge';
import { notifyToast } from '../components/shared/toast';
import { addToQueue, getOfflineQueuePath, getCachedServerId } from './offlineActionQueue';
import { Server, type ServerType } from '../types';

// Loaded lazily, not a static top-level import -- i18n.js runs real
// i18next.use(...).init(...) side effects at module-load time, and this
// module is imported by Player.tsx/PlayerBar.tsx/useFavorite.ts/useRating.ts.
// None of those currently sit on the same require-cycle-sensitive path
// offlineQueueFlush.ts does (api.ts/jellyfinApi.ts don't import this module),
// but the same class of surprise transitive-dependency regression bit this
// project once already (see offlineQueueFlush.ts's identical comment) --
// deferring here costs nothing and removes the risk entirely.
const loadI18n = async () => {
  const mod = await import('../i18n/i18n');
  return mod.default;
};

export const submitScrobbleWithQueueFallback = async (options: {
  serverType: ServerType;
  id: string | undefined;
  albumId?: string;
  // Jellyfin PositionTicks (position seconds * 1e7); undefined for Subsonic --
  // matches exactly what each existing scrobble call site already builds.
  position?: number;
  // Audit finding: this wrapper never checked connectivity state before
  // attempting a live call -- fine for genuinely detected offline (the call
  // naturally fails and falls into the queue path), but "Force offline mode"
  // is a user request to not touch the network at all, and a still-live
  // connection meant the request just silently succeeded instead. Passed in
  // by the caller (which already has it via useAppSelector) rather than read
  // here via a store import -- this module is imported broadly, and a static
  // *or* lazy import of the real Redux store still runs configureStore()
  // (and its electron-redux stateSyncEnhancer, which needs a real
  // __ElectronReduxBridge global) at that module's own top level the moment
  // it's imported, the exact transitive-eager-import trap this codebase has
  // hit before.
  effectiveOffline: boolean;
}): Promise<void> => {
  // Subsonic's scrobble.view `time` param (ms since epoch) is the field the
  // ADR wants populated for backdated replay -- captured here on every
  // attempt (not only on failure) so the real listen time is never lost
  // between "the call fired" and "we found out it failed."  Sending `time`
  // on a live, successful call is a no-op from the server's perspective (it
  // would use "now" anyway), so this doesn't change observable online
  // behavior. Jellyfin has no equivalent backdating param -- `position` is
  // just playback position (PositionTicks), unaffected either way.
  const time = Date.now();
  const args =
    options.serverType === Server.Subsonic
      ? { id: options.id, albumId: options.albumId, submission: true, time }
      : { id: options.id, submission: true, position: options.position };

  try {
    // Known offline (manually forced or already-detected) -- skip the live
    // attempt entirely rather than let it possibly succeed over a
    // connection the user explicitly asked the app not to touch. Falls into
    // the same queueing path below as a real network failure would.
    if (options.effectiveOffline) {
      throw new Error('Effectively offline -- skipping live scrobble attempt');
    }
    await apiController({ serverType: options.serverType, endpoint: 'scrobble', args });
  } catch (err) {
    // A scrobble attempt with no song id (options.id undefined -- e.g.
    // PlayerBar.tsx's MPV/Jukebox paths read playQueue.current?.id while
    // nothing is actually current) has nothing meaningful to retry: the
    // original failing request never had an `id` param at all (axios drops
    // undefined params rather than sending one), so queuing a payload with
    // `id: ''` would replay a request shaped differently from what was
    // actually attempted, against no real song. Skip queuing in this case
    // rather than manufacture a malformed entry -- the error still
    // propagates below either way.
    if (options.id !== undefined) {
      await addToQueue(
        {
          serverId: getCachedServerId(),
          actionType: 'scrobble',
          payload: {
            serverType: options.serverType,
            id: options.id,
            albumId: options.albumId,
            time,
            position: options.position,
          },
        },
        getOfflineQueuePath(),
        recovery.read,
        recovery.write
      );
    }
    throw err;
  }
};

export const submitFavoriteWithQueueFallback = async (options: {
  serverType: ServerType;
  id: string;
  itemType: string;
  starred: boolean;
  // See submitScrobbleWithQueueFallback's identical parameter above.
  effectiveOffline: boolean;
}): Promise<void> => {
  try {
    if (options.effectiveOffline) {
      throw new Error('Effectively offline -- skipping live favorite attempt');
    }
    await apiController({
      serverType: options.serverType,
      endpoint: options.starred ? 'star' : 'unstar',
      args: { id: options.id, type: options.itemType },
    });
  } catch (err) {
    await addToQueue(
      {
        serverId: getCachedServerId(),
        actionType: 'favorite',
        payload: {
          serverType: options.serverType,
          id: options.id,
          itemType: options.itemType,
          starred: options.starred,
        },
      },
      getOfflineQueuePath(),
      recovery.read,
      recovery.write
    );
    throw err;
  }
};

export const submitRatingWithQueueFallback = async (options: {
  serverType: ServerType;
  id: string;
  rating: number;
  // See submitScrobbleWithQueueFallback's identical parameter above.
  effectiveOffline: boolean;
}): Promise<void> => {
  if (options.serverType === Server.Jellyfin) {
    // Jellyfin has no per-user 1-5 star rating -- confirmed directly against
    // a live Jellyfin 10.11.11 server: POST /Users/{userId}/Items/{itemId}/
    // Rating only supports a binary likes=true/false (thumbs up/down, stored
    // as Rating 10/1), not an arbitrary numeric scale; passing an explicit
    // `rating` query param is silently ignored (and clears any existing
    // like/dislike). controller.ts's dispatch table has no Jellyfin
    // implementation for 'setRating' for exactly this reason. Detected
    // explicitly here rather than letting apiController's `null` return flow
    // through as if it had succeeded -- and never queued, since a replay
    // would fail identically (there is nothing to retry) every time.
    const i18n = await loadI18n();
    const message = i18n.t('Ratings are not supported on Jellyfin servers.');
    notifyToast('warning', message);
    throw new Error(message);
  }

  try {
    if (options.effectiveOffline) {
      throw new Error('Effectively offline -- skipping live rating attempt');
    }
    await apiController({
      serverType: options.serverType,
      endpoint: 'setRating',
      args: { ids: [options.id], rating: options.rating },
    });
  } catch (err) {
    await addToQueue(
      {
        serverId: getCachedServerId(),
        actionType: 'rating',
        payload: {
          serverType: options.serverType,
          id: options.id,
          rating: options.rating,
        },
      },
      getOfflineQueuePath(),
      recovery.read,
      recovery.write
    );
    throw err;
  }
};
