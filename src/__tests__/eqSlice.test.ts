import { configureStore } from '@reduxjs/toolkit';
import eqReducer, {
  computeInitialEqGains,
  computeInitialEqPreamp,
  setEqPreamp,
  setEqGains,
  loadEqPreset,
} from '../redux/eqSlice';
import peqReducer, {
  computeInitialPeqBands,
  computeInitialPeqPreamp,
  setPeqPreamp,
  loadPeqPreset,
  DEFAULT_PEQ_BANDS,
  PeqBand,
} from '../redux/peqSlice';

const createEqStore = () => configureStore({ reducer: { eq: eqReducer } });
const createPeqStore = () => configureStore({ reducer: { peq: peqReducer } });

// ─── eqSlice initialization ────────────────────────────────────────────────────

describe('eqSlice initialization', () => {
  it('uses 10 zero-gain bands as default when no persisted state', () => {
    expect(computeInitialEqGains({})).toEqual(Array(10).fill(0));
  });

  it('uses persisted gains when array length is exactly 10', () => {
    const gains = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(computeInitialEqGains({ eqGains: gains })).toEqual(gains);
  });

  it('resets to defaults when persisted array length is not 10 (e.g. 6)', () => {
    expect(computeInitialEqGains({ eqGains: [1, 2, 3, 4, 5, 6] })).toEqual(Array(10).fill(0));
  });

  it('resets to defaults when persisted array is empty', () => {
    expect(computeInitialEqGains({ eqGains: [] })).toEqual(Array(10).fill(0));
  });

  it('clamps preamp to +15 when stored value exceeds +15', () => {
    expect(computeInitialEqPreamp({ eqPreampDb: 20 })).toBe(15);
  });

  it('clamps preamp to -15 when stored value is below -15', () => {
    expect(computeInitialEqPreamp({ eqPreampDb: -20 })).toBe(-15);
  });

  it('accepts 0 preamp as valid', () => {
    expect(computeInitialEqPreamp({ eqPreampDb: 0 })).toBe(0);
  });

  it('defaults preamp to 0 when not in persisted state', () => {
    expect(computeInitialEqPreamp({})).toBe(0);
  });

  it('default initial store state has 10 zero-gain bands', () => {
    const store = createEqStore();
    const { gains } = store.getState().eq;
    expect(gains).toHaveLength(10);
    expect(gains.every((g) => g === 0)).toBe(true);
  });
});

describe('eqSlice reducers — preamp clamping', () => {
  it('clamps preamp to +15 via setEqPreamp when value exceeds +15', () => {
    const store = createEqStore();
    store.dispatch(setEqPreamp(20));
    expect(store.getState().eq.preampDb).toBe(15);
  });

  it('clamps preamp to -15 via setEqPreamp when value is below -15', () => {
    const store = createEqStore();
    store.dispatch(setEqPreamp(-20));
    expect(store.getState().eq.preampDb).toBe(-15);
  });

  it('accepts a preamp of exactly +15', () => {
    const store = createEqStore();
    store.dispatch(setEqPreamp(15));
    expect(store.getState().eq.preampDb).toBe(15);
  });

  it('accepts a preamp of exactly -15', () => {
    const store = createEqStore();
    store.dispatch(setEqPreamp(-15));
    expect(store.getState().eq.preampDb).toBe(-15);
  });

  it('clamps preamp via loadEqPreset when value exceeds +15', () => {
    const store = createEqStore();
    store.dispatch(loadEqPreset({ gains: Array(10).fill(0), preampDb: 99 }));
    expect(store.getState().eq.preampDb).toBe(15);
  });

  it('setEqGains replaces all gains', () => {
    const store = createEqStore();
    const newGains = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    store.dispatch(setEqGains(newGains));
    expect(store.getState().eq.gains).toEqual(newGains);
  });
});

// ─── peqSlice initialization ───────────────────────────────────────────────────

describe('peqSlice initialization', () => {
  it('uses 10-band defaults when no persisted state', () => {
    expect(computeInitialPeqBands({})).toEqual(DEFAULT_PEQ_BANDS);
  });

  it('uses persisted bands when array length matches DEFAULT_PEQ_BANDS.length', () => {
    const customBands: PeqBand[] = DEFAULT_PEQ_BANDS.map((b) => ({ ...b, gain: 3 }));
    expect(computeInitialPeqBands({ peqBands: customBands })).toEqual(customBands);
  });

  it('resets to defaults when persisted array length differs (e.g. 5 bands)', () => {
    const shortBands = DEFAULT_PEQ_BANDS.slice(0, 5);
    expect(computeInitialPeqBands({ peqBands: shortBands })).toEqual(DEFAULT_PEQ_BANDS);
  });

  it('resets to defaults when persisted array is empty', () => {
    expect(computeInitialPeqBands({ peqBands: [] })).toEqual(DEFAULT_PEQ_BANDS);
  });

  it('clamps preamp to +15 when stored value exceeds +15', () => {
    expect(computeInitialPeqPreamp({ peqPreampDb: 25 })).toBe(15);
  });

  it('clamps preamp to -15 when stored value is below -15', () => {
    expect(computeInitialPeqPreamp({ peqPreampDb: -25 })).toBe(-15);
  });

  it('accepts 0 preamp as valid', () => {
    expect(computeInitialPeqPreamp({ peqPreampDb: 0 })).toBe(0);
  });

  it('defaults preamp to 0 when not in persisted state', () => {
    expect(computeInitialPeqPreamp({})).toBe(0);
  });

  it('default initial store state has 10 bands', () => {
    const store = createPeqStore();
    expect(store.getState().peq.bands).toHaveLength(10);
  });
});

describe('peqSlice reducers — preamp clamping', () => {
  it('clamps preamp to +15 via setPeqPreamp when value exceeds +15', () => {
    const store = createPeqStore();
    store.dispatch(setPeqPreamp(30));
    expect(store.getState().peq.preampDb).toBe(15);
  });

  it('clamps preamp to -15 via setPeqPreamp when value is below -15', () => {
    const store = createPeqStore();
    store.dispatch(setPeqPreamp(-30));
    expect(store.getState().peq.preampDb).toBe(-15);
  });

  it('clamps preamp via loadPeqPreset when value exceeds +15', () => {
    const store = createPeqStore();
    store.dispatch(
      loadPeqPreset({ bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b })), preampDb: 99 })
    );
    expect(store.getState().peq.preampDb).toBe(15);
  });
});
