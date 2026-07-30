import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { settings } from '../components/shared/bridge';
import { mockSettings } from '../shared/mockSettings';

interface ConnectivityState {
  // Purely a runtime/session concept, re-derived fresh via the ping mechanism
  // on every launch -- deliberately NOT persisted (see ADR Section 3.4).
  pingConfirmedUnreachable: boolean;
  // Settings-backed -- read is always from Redux (this initial value), writes
  // for persistence go through the listener middleware in store.ts, mirroring
  // smartPlaylistSlice's pattern.
  isManuallyForced: boolean;
}

const initialState: ConnectivityState = {
  pingConfirmedUnreachable: false,
  isManuallyForced: Boolean(
    process.env.NODE_ENV === 'test'
      ? mockSettings.forceOfflineMode
      : settings.get('forceOfflineMode')
  ),
};

const connectivitySlice = createSlice({
  name: 'connectivity',
  initialState,
  reducers: {
    setPingConfirmedUnreachable: (state, action: PayloadAction<boolean>) => {
      state.pingConfirmedUnreachable = action.payload;
    },
    setManuallyForced: (state, action: PayloadAction<boolean>) => {
      state.isManuallyForced = action.payload;
    },
  },
});

export const { setPingConfirmedUnreachable, setManuallyForced } = connectivitySlice.actions;

// effectiveOffline = pingConfirmedUnreachable OR isManuallyForced (ADR Section 3.4).
// Everything downstream (persistent indicator, reconnection-flush trigger) reads
// this single derived value, never the two inputs separately. Typed against a
// minimal shape (not the full RootState) to avoid this slice importing back
// from store.ts, which imports this slice's reducer.
export const selectEffectiveOffline = (state: { connectivity: ConnectivityState }): boolean =>
  state.connectivity.pingConfirmedUnreachable || state.connectivity.isManuallyForced;

export default connectivitySlice.reducer;
