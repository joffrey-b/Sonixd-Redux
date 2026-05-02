import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { settings } from '../components/shared/setDefaultSettings';

const parsedSettings: any = process.env.NODE_ENV === 'test' ? {} : settings.store;

export interface EqPreset {
  name: string;
  gains: number[];
  preampDb: number;
}

export interface EqState {
  enabled: boolean;
  gains: number[];
  customPresets: EqPreset[];
  preampDb: number;
}

const initialState: EqState = {
  enabled: Boolean(parsedSettings.eqEnabled ?? false),
  gains: (parsedSettings.eqGains as number[]) ?? Array(10).fill(0),
  customPresets: (parsedSettings.eqCustomPresets as EqPreset[]) ?? [],
  preampDb: (parsedSettings.eqPreampDb as number) ?? 0,
};

const eqSlice = createSlice({
  name: 'eq',
  initialState,
  reducers: {
    setEqEnabled: (state, action: PayloadAction<boolean>) => {
      state.enabled = action.payload;
    },
    setEqGains: (state, action: PayloadAction<number[]>) => {
      state.gains = action.payload;
    },
    setEqGain: (state, action: PayloadAction<{ band: number; gain: number }>) => {
      const newGains = [...state.gains];
      newGains[action.payload.band] = action.payload.gain;
      state.gains = newGains;
    },
    addEqCustomPreset: (state, action: PayloadAction<EqPreset>) => {
      const idx = state.customPresets.findIndex((p) => p.name === action.payload.name);
      if (idx >= 0) {
        state.customPresets[idx] = action.payload;
      } else {
        state.customPresets.push(action.payload);
      }
    },
    deleteEqCustomPreset: (state, action: PayloadAction<string>) => {
      state.customPresets = state.customPresets.filter((p) => p.name !== action.payload);
    },
    loadEqPreset: (state, action: PayloadAction<{ gains: number[]; preampDb: number }>) => {
      state.gains = action.payload.gains;
      state.preampDb = Math.max(-12, Math.min(0, action.payload.preampDb ?? 0));
    },
    setEqPreamp: (state, action: PayloadAction<number>) => {
      state.preampDb = Math.max(-12, Math.min(0, action.payload));
    },
  },
});

export const {
  setEqEnabled,
  setEqGains,
  setEqGain,
  addEqCustomPreset,
  deleteEqCustomPreset,
  loadEqPreset,
  setEqPreamp,
} = eqSlice.actions;

export default eqSlice.reducer;
