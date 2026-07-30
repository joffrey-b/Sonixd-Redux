// Audit fix (Section 5 reuse finding): offlineActionQueue.ts's withQueueLock
// and downloadManifest.ts's withManifestLock were two independent,
// byte-for-byte identical implementations of the same read-modify-write
// serializing lock (downloadManifest.ts's own comment already noted the
// shape was "identical" but implemented it separately anyway). Each caller
// still gets its own independent lock instance via its own createAsyncLock()
// call -- this only shares the implementation, not the lock itself, so a
// queue mutation and a manifest mutation still never contend with each other.
export function createAsyncLock() {
  let chain: Promise<unknown> = Promise.resolve();

  return function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = chain.then(fn, fn);
    chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}
