import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { settings } from '../components/shared/setDefaultSettings';

const parsedSettings: any = process.env.NODE_ENV === 'test' ? {} : settings.store;

export interface PeqBand {
  enabled: boolean;
  type: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'notch';
  freq: number;
  gain: number;
  q: number;
}

export interface PeqPreset {
  name: string;
  bands: PeqBand[];
  preampDb: number;
}

export interface PeqState {
  enabled: boolean;
  bands: PeqBand[];
  customPresets: PeqPreset[];
  preampDb: number;
}

export const DEFAULT_PEQ_BANDS: PeqBand[] = [
  { enabled: true, type: 'peaking', freq: 32, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 64, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 125, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 250, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 500, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 1000, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 2000, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 4000, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 8000, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 16000, gain: 0, q: 1.0 },
];

const initialState: PeqState = {
  enabled: Boolean(parsedSettings.peqEnabled ?? false),
  bands:
    (parsedSettings.peqBands as PeqBand[])?.length === DEFAULT_PEQ_BANDS.length
      ? (parsedSettings.peqBands as PeqBand[])
      : DEFAULT_PEQ_BANDS,
  customPresets: (parsedSettings.peqCustomPresets as PeqPreset[]) ?? [],
  preampDb: (parsedSettings.peqPreampDb as number) ?? 0,
};

const peqSlice = createSlice({
  name: 'peq',
  initialState,
  reducers: {
    setPeqEnabled: (state, action: PayloadAction<boolean>) => {
      state.enabled = action.payload;
    },
    setPeqBand: (state, action: PayloadAction<{ index: number; band: PeqBand }>) => {
      state.bands[action.payload.index] = action.payload.band;
    },
    setPeqBandField: (
      state,
      action: PayloadAction<{ index: number; field: keyof PeqBand; value: any }>
    ) => {
      (state.bands[action.payload.index] as any)[action.payload.field] = action.payload.value;
    },
    resetPeqBands: (state) => {
      // Deep copy — assigning DEFAULT_PEQ_BANDS directly would share the frozen reference
      // and the next setPeqBandField dispatch would throw when Immer tries to mutate it
      state.bands = DEFAULT_PEQ_BANDS.map((b) => ({ ...b }));
    },
    loadPeqPreset: (state, action: PayloadAction<{ bands: PeqBand[]; preampDb: number }>) => {
      state.bands = action.payload.bands.map((b) => ({ ...b }));
      state.preampDb = Math.max(-20, Math.min(0, action.payload.preampDb ?? 0));
    },
    addPeqCustomPreset: (state, action: PayloadAction<PeqPreset>) => {
      const idx = state.customPresets.findIndex((p) => p.name === action.payload.name);
      if (idx >= 0) {
        state.customPresets[idx] = action.payload;
      } else {
        state.customPresets.push(action.payload);
      }
    },
    deletePeqCustomPreset: (state, action: PayloadAction<string>) => {
      state.customPresets = state.customPresets.filter((p) => p.name !== action.payload);
    },
    setPeqPreamp: (state, action: PayloadAction<number>) => {
      state.preampDb = Math.max(-20, Math.min(0, action.payload));
    },
  },
});

export const {
  setPeqEnabled,
  setPeqBand,
  setPeqBandField,
  resetPeqBands,
  loadPeqPreset,
  addPeqCustomPreset,
  deletePeqCustomPreset,
  setPeqPreamp,
} = peqSlice.actions;
export default peqSlice.reducer;
