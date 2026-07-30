import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';

// Song IDs currently present in the downloads manifest (ADR Section 8).
// Mirrors cachedSongsSlice.ts's shape exactly (Lesson #9): plain string[], not
// a Set, for electron-redux's stateSyncEnhancer() cross-window serialization;
// consumers build a memoized Set at the selector boundary. The persistent
// manifest (shared/downloadManifest.ts) is the source of truth -- this slice
// is a live mirror of it, populated at startup and updated on every download
// and every removal (explicit or resilience-detected, Fix 6), not the other
// way around.
interface DownloadedSongsState {
  songIds: string[];
}

const initialState: DownloadedSongsState = {
  songIds: [],
};

const downloadedSongsSlice = createSlice({
  name: 'downloadedSongs',
  initialState,
  reducers: {
    // Replaces the whole set -- used once at startup after reading the manifest.
    setDownloadedSongIds: (state, action: PayloadAction<string[]>) => {
      state.songIds = action.payload;
    },
    // Adds a single id -- used the moment a download succeeds.
    addDownloadedSongId: (state, action: PayloadAction<string>) => {
      if (!state.songIds.includes(action.payload)) {
        state.songIds.push(action.payload);
      }
    },
    // Removes ids -- explicit "Remove from offline" deletions, and Fix 6's
    // resilience self-correction when a manifest entry points to a missing file.
    removeDownloadedSongIds: (state, action: PayloadAction<string[]>) => {
      if (action.payload.length === 0) return;
      const toRemove = new Set(action.payload);
      state.songIds = state.songIds.filter((id) => !toRemove.has(id));
    },
  },
});

export const { setDownloadedSongIds, addDownloadedSongId, removeDownloadedSongIds } =
  downloadedSongsSlice.actions;

export const selectDownloadedSongIdSet = createSelector(
  (state: { downloadedSongs: DownloadedSongsState }) => state.downloadedSongs.songIds,
  (songIds): Set<string> => new Set(songIds)
);

export const isSongDownloaded = (songId: string, downloadedSongIds: ReadonlySet<string>): boolean =>
  downloadedSongIds.has(songId);

export default downloadedSongsSlice.reducer;
