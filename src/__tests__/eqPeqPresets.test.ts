import { configureStore } from '@reduxjs/toolkit';
import eqReducer, {
  setEqEnabled,
  setEqGains,
  setEqGain,
  loadEqPreset,
  addEqCustomPreset,
  deleteEqCustomPreset,
  EqPreset,
} from '../redux/eqSlice';
import peqReducer, {
  setPeqEnabled,
  setPeqBand,
  setPeqBandField,
  resetPeqBands,
  loadPeqPreset,
  addPeqCustomPreset,
  deletePeqCustomPreset,
  DEFAULT_PEQ_BANDS,
  PeqBand,
} from '../redux/peqSlice';

const createEqStore = () => configureStore({ reducer: { eq: eqReducer } });
const createPeqStore = () => configureStore({ reducer: { peq: peqReducer } });

const makePreset = (name: string, gains: number[] = Array(10).fill(0), preampDb = 0): EqPreset => ({
  name,
  gains,
  preampDb,
});

// ─── EQ preset operations ─────────────────────────────────────────────────────

describe('EQ preset save and load', () => {
  it('loadEqPreset applies all 10 band gains', () => {
    const store = createEqStore();
    const gains = [1, 2, 3, 4, 5, -1, -2, -3, -4, -5];
    store.dispatch(loadEqPreset({ gains, preampDb: 3 }));
    expect(store.getState().eq.gains).toEqual(gains);
  });

  it('loadEqPreset applies the preamp from the preset', () => {
    const store = createEqStore();
    store.dispatch(loadEqPreset({ gains: Array(10).fill(0), preampDb: 5 }));
    expect(store.getState().eq.preampDb).toBe(5);
  });

  it('loadEqPreset clamps preamp to +15', () => {
    const store = createEqStore();
    store.dispatch(loadEqPreset({ gains: Array(10).fill(0), preampDb: 20 }));
    expect(store.getState().eq.preampDb).toBe(15);
  });

  it('loadEqPreset clamps preamp to -15', () => {
    const store = createEqStore();
    store.dispatch(loadEqPreset({ gains: Array(10).fill(0), preampDb: -20 }));
    expect(store.getState().eq.preampDb).toBe(-15);
  });

  it('loadEqPreset does not mutate customPresets', () => {
    const store = createEqStore();
    store.dispatch(addEqCustomPreset(makePreset('Rock', Array(10).fill(3), 1)));
    const before = store.getState().eq.customPresets.length;
    store.dispatch(loadEqPreset({ gains: Array(10).fill(0), preampDb: 0 }));
    expect(store.getState().eq.customPresets).toHaveLength(before);
  });

  it('loadEqPreset with a 6-band array still applies without crash', () => {
    const store = createEqStore();
    const shortGains = [1, 2, 3, 4, 5, 6];
    expect(() => store.dispatch(loadEqPreset({ gains: shortGains, preampDb: 0 }))).not.toThrow();
    expect(store.getState().eq.gains).toEqual(shortGains);
  });

  it('setEqGains replaces all 10 band gains', () => {
    const store = createEqStore();
    const newGains = [5, 4, 3, 2, 1, -1, -2, -3, -4, -5];
    store.dispatch(setEqGains(newGains));
    expect(store.getState().eq.gains).toEqual(newGains);
  });

  it('setEqGain updates a single band without affecting others', () => {
    const store = createEqStore();
    store.dispatch(setEqGain({ band: 3, gain: 7 }));
    const gains = store.getState().eq.gains;
    expect(gains[3]).toBe(7);
    expect(gains[0]).toBe(0);
    expect(gains[9]).toBe(0);
  });

  it('setEqEnabled toggles EQ on and off', () => {
    const store = createEqStore();
    expect(store.getState().eq.enabled).toBe(false);
    store.dispatch(setEqEnabled(true));
    expect(store.getState().eq.enabled).toBe(true);
    store.dispatch(setEqEnabled(false));
    expect(store.getState().eq.enabled).toBe(false);
  });

  it('addEqCustomPreset adds a new preset', () => {
    const store = createEqStore();
    store.dispatch(addEqCustomPreset(makePreset('Jazz')));
    expect(store.getState().eq.customPresets).toHaveLength(1);
    expect(store.getState().eq.customPresets[0].name).toBe('Jazz');
  });

  it('addEqCustomPreset overwrites a preset with the same name', () => {
    const store = createEqStore();
    store.dispatch(addEqCustomPreset(makePreset('Jazz', Array(10).fill(1))));
    store.dispatch(addEqCustomPreset(makePreset('Jazz', Array(10).fill(5))));
    const presets = store.getState().eq.customPresets;
    expect(presets).toHaveLength(1);
    expect(presets[0].gains[0]).toBe(5);
  });

  it('deleteEqCustomPreset removes the named preset', () => {
    const store = createEqStore();
    store.dispatch(addEqCustomPreset(makePreset('Jazz')));
    store.dispatch(addEqCustomPreset(makePreset('Rock')));
    store.dispatch(deleteEqCustomPreset('Jazz'));
    const names = store.getState().eq.customPresets.map((p) => p.name);
    expect(names).not.toContain('Jazz');
    expect(names).toContain('Rock');
  });

  it('deleteEqCustomPreset with unknown name is a no-op', () => {
    const store = createEqStore();
    store.dispatch(addEqCustomPreset(makePreset('Jazz')));
    store.dispatch(deleteEqCustomPreset('NonExistent'));
    expect(store.getState().eq.customPresets).toHaveLength(1);
  });
});

// ─── PEQ preset operations ────────────────────────────────────────────────────

describe('PEQ preset save and load', () => {
  it('loadPeqPreset applies all band configs from the preset', () => {
    const store = createPeqStore();
    const bands: PeqBand[] = DEFAULT_PEQ_BANDS.map((b) => ({ ...b, gain: 6 }));
    store.dispatch(loadPeqPreset({ bands, preampDb: 0 }));
    expect(store.getState().peq.bands.every((b) => b.gain === 6)).toBe(true);
  });

  it('loadPeqPreset applies the preamp from the preset', () => {
    const store = createPeqStore();
    store.dispatch(loadPeqPreset({ bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b })), preampDb: 4 }));
    expect(store.getState().peq.preampDb).toBe(4);
  });

  it('loadPeqPreset clamps preamp to +15', () => {
    const store = createPeqStore();
    store.dispatch(
      loadPeqPreset({ bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b })), preampDb: 99 })
    );
    expect(store.getState().peq.preampDb).toBe(15);
  });

  it('loadPeqPreset clamps preamp to -15', () => {
    const store = createPeqStore();
    store.dispatch(
      loadPeqPreset({ bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b })), preampDb: -99 })
    );
    expect(store.getState().peq.preampDb).toBe(-15);
  });

  it('loadPeqPreset does not affect enabled flag', () => {
    const store = createPeqStore();
    store.dispatch(setPeqEnabled(true));
    store.dispatch(loadPeqPreset({ bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b })), preampDb: 0 }));
    expect(store.getState().peq.enabled).toBe(true);
  });

  it('setPeqEnabled toggles PEQ on and off', () => {
    const store = createPeqStore();
    expect(store.getState().peq.enabled).toBe(false);
    store.dispatch(setPeqEnabled(true));
    expect(store.getState().peq.enabled).toBe(true);
    store.dispatch(setPeqEnabled(false));
    expect(store.getState().peq.enabled).toBe(false);
  });

  it('setPeqBand replaces a specific band at the given index', () => {
    const store = createPeqStore();
    const newBand: PeqBand = { enabled: true, type: 'lowshelf', freq: 100, gain: 9, q: 2.0 };
    store.dispatch(setPeqBand({ index: 2, band: newBand }));
    expect(store.getState().peq.bands[2]).toEqual(newBand);
  });

  it('setPeqBand does not affect other bands', () => {
    const store = createPeqStore();
    const before = store.getState().peq.bands[0];
    store.dispatch(
      setPeqBand({
        index: 5,
        band: { enabled: false, type: 'highpass', freq: 5000, gain: 0, q: 1 },
      })
    );
    expect(store.getState().peq.bands[0]).toEqual(before);
  });

  it('setPeqBandField updates a single field on a specific band', () => {
    const store = createPeqStore();
    store.dispatch(setPeqBandField({ index: 1, field: 'gain', value: 3 }));
    expect(store.getState().peq.bands[1].gain).toBe(3);
    expect(store.getState().peq.bands[1].freq).toBe(DEFAULT_PEQ_BANDS[1].freq);
  });

  it('resetPeqBands restores all bands to defaults', () => {
    const store = createPeqStore();
    store.dispatch(
      setPeqBand({ index: 0, band: { enabled: false, type: 'highpass', freq: 99, gain: 99, q: 9 } })
    );
    store.dispatch(resetPeqBands());
    expect(store.getState().peq.bands).toEqual(DEFAULT_PEQ_BANDS);
  });

  it('resetPeqBands returns a mutable copy (subsequent setPeqBandField does not throw)', () => {
    const store = createPeqStore();
    store.dispatch(resetPeqBands());
    expect(() =>
      store.dispatch(setPeqBandField({ index: 0, field: 'gain', value: 5 }))
    ).not.toThrow();
  });

  it('addPeqCustomPreset adds a new preset', () => {
    const store = createPeqStore();
    const preset = {
      name: 'Treble Boost',
      bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b })),
      preampDb: 0,
    };
    store.dispatch(addPeqCustomPreset(preset));
    expect(store.getState().peq.customPresets).toHaveLength(1);
    expect(store.getState().peq.customPresets[0].name).toBe('Treble Boost');
  });

  it('addPeqCustomPreset overwrites a preset with the same name', () => {
    const store = createPeqStore();
    store.dispatch(
      addPeqCustomPreset({
        name: 'Bass',
        bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b, gain: 3 })),
        preampDb: 0,
      })
    );
    store.dispatch(
      addPeqCustomPreset({
        name: 'Bass',
        bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b, gain: 9 })),
        preampDb: 0,
      })
    );
    const presets = store.getState().peq.customPresets;
    expect(presets).toHaveLength(1);
    expect(presets[0].bands[0].gain).toBe(9);
  });

  it('deletePeqCustomPreset removes the named preset', () => {
    const store = createPeqStore();
    store.dispatch(
      addPeqCustomPreset({
        name: 'Flat',
        bands: DEFAULT_PEQ_BANDS.map((b) => ({ ...b })),
        preampDb: 0,
      })
    );
    store.dispatch(deletePeqCustomPreset('Flat'));
    expect(store.getState().peq.customPresets).toHaveLength(0);
  });

  it('setPeqBand with an out-of-range index does not crash', () => {
    const store = createPeqStore();
    expect(() =>
      store.dispatch(
        setPeqBand({
          index: 999,
          band: { enabled: true, type: 'peaking', freq: 100, gain: 0, q: 1 },
        })
      )
    ).not.toThrow();
  });
});
