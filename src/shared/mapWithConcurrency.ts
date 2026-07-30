// Audit fix (Section 5 reuse finding): the chunked-concurrency fan-out shape
// (for loop + slice + bounded Promise.all) was independently copy-pasted at
// 6+ call sites across the codebase (api.ts's getArtistSongs,
// usePlaylistsCache.ts, offlineQueueFlush.ts, useBulkDownload.ts's download
// and delete fan-outs), each redeclaring its own CONCURRENCY constant and
// re-deriving the same per-item-isolation reasoning in its own comment.
// Collapses that boilerplate into one place -- the isolation contract (does
// one item's rejection abort the rest?) can be documented and tested once
// here instead of at every call site.
//
// Deliberately does NOT swallow errors itself: `fn` is expected to catch its
// own per-item failures and return a fallback value, exactly as every
// existing call site already does -- this helper's only job is the
// concurrency-limiting mechanics (chunking + bounded Promise.all), not
// deciding what "a failed item" means for a given caller (a boolean outcome,
// a null sentinel to filter out, etc. all differ by call site). If `fn`
// itself throws without catching, that chunk's Promise.all rejects and
// aborts the whole batch -- exactly like every one of the call sites this
// replaces already behaved when a caller forgot its own try/catch.
//
// Promise.all preserves input order in its results regardless of which
// promise in the chunk actually settles first, and chunks are processed
// strictly in sequence -- so the returned array's order always matches
// `items`' order, across the whole call, not just within one chunk.
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map((item, chunkIdx) => fn(item, i + chunkIdx)));
    results.push(...chunkResults);
  }
  return results;
}
