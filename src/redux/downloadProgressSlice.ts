import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// ADR Section 8.6: count-based progress ("N of M songs downloaded") + a
// simple in-progress boolean for any multi-song download operation --
// deliberately NOT byte-level/throughput progress (explicit v1 scope
// decision, Section 8.6/9). Consumed by Fix 5's bulk Album/Artist/Playlist
// Download button and Fix 7's overview screen, both of which read the same
// single global batch state (only one bulk download runs at a time).
interface DownloadProgressState {
  inProgress: boolean;
  completed: number;
  total: number;
}

const initialState: DownloadProgressState = {
  inProgress: false,
  completed: 0,
  total: 0,
};

const downloadProgressSlice = createSlice({
  name: 'downloadProgress',
  initialState,
  reducers: {
    startDownloadBatch: (state, action: PayloadAction<number>) => {
      state.inProgress = true;
      state.completed = 0;
      state.total = action.payload;
    },
    incrementDownloadProgress: (state) => {
      state.completed += 1;
    },
    finishDownloadBatch: (state) => {
      state.inProgress = false;
      state.completed = 0;
      state.total = 0;
    },
  },
});

export const { startDownloadBatch, incrementDownloadProgress, finishDownloadBatch } =
  downloadProgressSlice.actions;

export const selectDownloadProgress = (state: {
  downloadProgress: DownloadProgressState;
}): DownloadProgressState => state.downloadProgress;

export default downloadProgressSlice.reducer;
