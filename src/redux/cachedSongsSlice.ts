import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';

// Song IDs currently present in the opportunistic song cache (ADR Section 5.3/6).
// Stored as a plain string[] (not a Set) because this slice is subject to
// electron-redux's stateSyncEnhancer() cross-window sync, which needs a
// serializable payload -- a real Set would not round-trip through that sync
// reliably. Consumers that need O(1) lookups build a memoized Set from this
// array at the selector/hook boundary (see shared/isAvailableOffline.ts)
// rather than storing one here.
//
// Fix K: this state used to also carry an isInitialized flag (true once the
// startup cacheDir.list() populated songIds), meant to let the offline-status
// column distinguish "genuinely nothing cached" from "listing hasn't finished
// yet". It was never actually read anywhere -- removed rather than wired up,
// since a real fix would need a 4th visual state for the column beyond the
// ADR's fixed none/cached/downloaded design (Section 6), and the race it
// guarded against is a single fast local IPC round-trip at startup, narrow
// enough that it isn't worth that scope increase. See PHASE-3-FIX-SUMMARY.md
// (Fix K) for the full writeup.
interface CachedSongsState {
  songIds: string[];
}

const initialState: CachedSongsState = {
  songIds: [],
};

const cachedSongsSlice = createSlice({
  name: 'cachedSongs',
  initialState,
  reducers: {
    // Replaces the whole set -- used once at startup after listing the cache directory.
    setCachedSongIds: (state, action: PayloadAction<string[]>) => {
      state.songIds = action.payload;
    },
    // Adds a single id -- used the moment a cache write succeeds (real-time update,
    // mirrors incrementPlayCountInCache/updateStarredInCache's per-call-site pattern).
    addCachedSongId: (state, action: PayloadAction<string>) => {
      if (!state.songIds.includes(action.payload)) {
        state.songIds.push(action.payload);
      }
    },
    // Fix D: removes ids evicted from the opportunistic cache -- without this,
    // a song's file can be deleted by the FIFO size-limit cleanup while this
    // index still reports it as cached until the app restarts.
    removeCachedSongIds: (state, action: PayloadAction<string[]>) => {
      if (action.payload.length === 0) return;
      const toRemove = new Set(action.payload);
      state.songIds = state.songIds.filter((id) => !toRemove.has(id));
    },
  },
});

export const { setCachedSongIds, addCachedSongId, removeCachedSongIds } = cachedSongsSlice.actions;

// Memoized -- only recomputes the Set when songIds' array reference actually
// changes (i.e. when the reducer above runs), not on every unrelated dispatch,
// so components reading this via useAppSelector don't re-render on unrelated
// state changes.
export const selectCachedSongIdSet = createSelector(
  (state: { cachedSongs: CachedSongsState }) => state.cachedSongs.songIds,
  (songIds): Set<string> => new Set(songIds)
);

// Synchronous, in-memory lookup -- no IPC per call (Lesson #1). Takes the Set
// as a parameter rather than reaching for the store itself, so it's usable
// both from React (via selectCachedSongIdSet) and from plain unit tests.
export const isCachedLocally = (songId: string, cachedSongIds: ReadonlySet<string>): boolean =>
  cachedSongIds.has(songId);

export default cachedSongsSlice.reducer;
