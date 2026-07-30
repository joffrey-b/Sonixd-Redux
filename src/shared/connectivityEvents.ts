// Decouples api.ts/jellyfinApi.ts's success interceptors from directly
// importing shared/offlineQueueFlush.ts. Before this existed, both
// interceptors statically imported offlineQueueFlush.ts to call
// attemptQueueFlush() on every successful response -- but offlineQueueFlush.ts
// itself needs api/controller.ts to actually replay a queued item, and
// controller.ts statically imports api.ts/jellyfinApi.ts to build its
// endpoint dispatch table. That's a genuine import/no-cycle graph cycle
// (api.ts -> offlineQueueFlush.ts -> controller.ts -> api.ts), previously
// only time-mitigated (a dynamic import deferred controller.ts's resolution
// past module-load time) rather than actually removed -- ESLint's no-cycle
// rule still flagged it, since it traverses dynamic imports too.
//
// This module has zero imports of its own and is never imported by
// controller.ts or api.ts/jellyfinApi.ts's own dependency graph, so nothing
// that depends on it can loop back -- api.ts/jellyfinApi.ts now only reach
// this leaf module, not offlineQueueFlush.ts, making the cycle structurally
// impossible rather than merely deferred.
type Listener = () => void;

const listeners = new Set<Listener>();

export const onRequestSuccess = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emitRequestSuccess = (): void => {
  // Each listener gets its own try/catch, mirroring the per-entry isolation
  // already established elsewhere in this codebase (offlineQueueFlush.ts's
  // replayEntry, and its per-entry bookkeeping try/catch from the Phase 1 fix
  // session) -- a single listener throwing must never propagate back into
  // the api.ts/jellyfinApi.ts interceptor that called this function (neither
  // wraps the call in a try/catch), and must never stop other listeners
  // (current or future) from running.
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Swallowed -- see comment above.
    }
  });
};
