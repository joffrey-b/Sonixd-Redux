// Audit fix (Section 5 reuse finding): the "async-cache-with-invalidation"
// pattern (Lesson #1: resolve once via async invoke -- never the sync
// sendSync-backed settings.get() -- cache in memory, invalidate explicitly on
// login/disconnect, fall back to one sync settings.get() call before the
// first async resolution completes) was reimplemented from scratch at every
// call site that needed it (api.ts's credentialCache, jellyfinApi.ts's own
// separate credentialCache, offlineActionQueue.ts, downloadPath.ts), each
// ~15-25 lines of near-identical refreshing-flag + .then/.catch + clear()
// boilerplate. Collapses that shape into one factory.
//
// T can be a composite object (e.g. { cachePath, serverId } resolved
// together from one combined fetch) just as easily as a single primitive --
// callers that need several related values from one async round trip get
// them back atomically from the same cache entry, matching what a manually
// written version of this pattern already did.
export function createAsyncCachedValue<T>(fetcher: () => Promise<T>, syncFallback: () => T) {
  let cached: T | null = null;
  let refreshing = false;

  const refresh = (): void => {
    if (refreshing) return;
    refreshing = true;
    fetcher()
      .then((value) => {
        cached = value;
        refreshing = false;
        return undefined;
      })
      .catch(() => {
        refreshing = false;
      });
  };

  const get = (): T => {
    if (cached !== null) return cached;
    refresh();
    return syncFallback();
  };

  const clear = (): void => {
    cached = null;
  };

  return { get, clear };
}
