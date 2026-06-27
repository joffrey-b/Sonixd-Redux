import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Player {
  status: string;
}

const initialState: Player = {
  status: 'PAUSED',
};

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    setStatus: (state, action: PayloadAction<string>) => {
      state.status = action.payload;
    },
  },
});

export const { setStatus } = playerSlice.actions;
export default playerSlice.reducer;
