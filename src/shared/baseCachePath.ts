// Pure string-based path joining, extracted so both shared/utils.ts and
// shared/offlineActionQueue.ts can import the same implementation instead of
// each maintaining its own copy (the latter used to hand-duplicate this
// exact function specifically to avoid importing utils.ts -- see the comment
// on that historical reason in offlineActionQueue.ts). This module
// deliberately has no other imports (not even settings/bridge, not i18n):
// utils.ts eagerly imports i18n.js at module scope for unrelated reasons
// (getPlayedSongsNotification), and offlineActionQueue.ts is transitively
// imported by api.ts/jellyfinApi.ts (for the flush trigger) -- keeping this
// module import-free means neither of them drags the other's dependency
// graph in transitively.
//
// Node's `path` module compiles to a runtime require("path") in the renderer
// bundle (target: electron-renderer) -- this only works while nodeIntegration
// is true. Forward slashes are accepted by Node's fs APIs on every platform
// including Windows, so a plain join + slash-collapse is a safe drop-in for
// the two/three-segment joins this codebase actually performs (see C1 /
// nodeIntegration migration).
export const joinPath = (...segments: string[]): string =>
  segments
    .filter((segment) => segment.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');
