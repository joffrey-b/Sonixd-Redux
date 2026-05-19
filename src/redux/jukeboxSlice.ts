import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface JukeboxStatus {
  currentIndex: number;
  playing: boolean;
  gain: number;
  position: number;
  entry: string[]; // song IDs in server playlist order
}

export interface JukeboxState {
  enabled: boolean;
  status: JukeboxStatus;
}

const initialStatus: JukeboxStatus = {
  currentIndex: -1,
  playing: false,
  gain: 1,
  position: 0,
  entry: [],
};

const initialState: JukeboxState = {
  enabled: false,
  status: initialStatus,
};

const jukeboxSlice = createSlice({
  name: 'jukebox',
  initialState,
  reducers: {
    setJukeboxEnabled: (state, action: PayloadAction<boolean>) => {
      state.enabled = action.payload;
      if (!action.payload) {
        state.status = initialStatus;
      }
    },
    setJukeboxStatus: (state, action: PayloadAction<JukeboxStatus>) => {
      state.status = action.payload;
    },
  },
});

export const { setJukeboxEnabled, setJukeboxStatus } = jukeboxSlice.actions;
export default jukeboxSlice.reducer;
