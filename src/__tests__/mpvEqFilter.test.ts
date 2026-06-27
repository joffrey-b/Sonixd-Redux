import { buildMpvAfChain, peqBandToFilter } from '../shared/mpvEqFilter';
import type { EqState } from '../redux/eqSlice';
import type { PeqBand, PeqState } from '../redux/peqSlice';

const makeEq = (overrides: Partial<EqState> = {}): EqState => ({
  enabled: true,
  gains: Array(10).fill(0),
  customPresets: [],
  preampDb: 0,
  ...overrides,
});

const makePeq = (overrides: Partial<PeqState> = {}): PeqState => ({
  enabled: false,
  bands: [],
  customPresets: [],
  preampDb: 0,
  ...overrides,
});

const makeBand = (overrides: Partial<PeqBand> = {}): PeqBand => ({
  enabled: true,
  type: 'peaking',
  freq: 1000,
  gain: 6,
  q: 1.0,
  ...overrides,
});

describe('buildMpvAfChain — graphic EQ', () => {
  it('returns empty string when EQ is disabled', () => {
    const gains = Array(10).fill(0);
    gains[0] = 5;
    expect(buildMpvAfChain(makeEq({ enabled: false, gains }), makePeq())).toBe('');
  });

  it('returns empty string when all bands are zero and preamp is 0', () => {
    expect(buildMpvAfChain(makeEq(), makePeq())).toBe('');
  });

  it('generates correct peaking filter for band index 0 (32 Hz)', () => {
    const gains = Array(10).fill(0);
    gains[0] = 6;
    expect(buildMpvAfChain(makeEq({ gains }), makePeq())).toBe(
      'lavfi=[equalizer=f=32:width_type=q:w=1.4:g=6]'
    );
  });

  it('generates correct peaking filter for band index 9 (16000 Hz)', () => {
    const gains = Array(10).fill(0);
    gains[9] = -3;
    expect(buildMpvAfChain(makeEq({ gains }), makePeq())).toBe(
      'lavfi=[equalizer=f=16000:width_type=q:w=1.4:g=-3]'
    );
  });

  it('maps all 10 band indices to the correct center frequencies', () => {
    const expectedFreqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    expectedFreqs.forEach((freq, i) => {
      const gains = Array(10).fill(0);
      gains[i] = 1;
      expect(buildMpvAfChain(makeEq({ gains }), makePeq())).toContain(`f=${freq}:`);
    });
  });

  it('skips bands with gain of 0 and only emits non-zero bands', () => {
    const gains = Array(10).fill(0);
    gains[2] = 3;
    expect(buildMpvAfChain(makeEq({ gains }), makePeq())).toBe(
      'lavfi=[equalizer=f=125:width_type=q:w=1.4:g=3]'
    );
  });

  it('applies positive gain values correctly', () => {
    const gains = Array(10).fill(0);
    gains[5] = 12;
    expect(buildMpvAfChain(makeEq({ gains }), makePeq())).toContain('g=12');
  });

  it('applies negative gain values correctly', () => {
    const gains = Array(10).fill(0);
    gains[5] = -9;
    expect(buildMpvAfChain(makeEq({ gains }), makePeq())).toContain('g=-9');
  });

  it('joins multiple non-zero bands with commas inside the lavfi wrapper', () => {
    const gains = Array(10).fill(0);
    gains[0] = 3;
    gains[9] = -3;
    const result = buildMpvAfChain(makeEq({ gains }), makePeq());
    expect(result).toMatch(/^lavfi=\[.+,.+\]$/);
  });
});

describe('buildMpvAfChain — preamp conversion', () => {
  it('does not add a volume filter when preamp is 0 dB', () => {
    expect(buildMpvAfChain(makeEq({ preampDb: 0 }), makePeq())).not.toContain('volume=');
  });

  it('converts +15 dB to the correct linear factor (~5.623413)', () => {
    const gains = Array(10).fill(0);
    gains[0] = 1;
    const result = buildMpvAfChain(makeEq({ gains, preampDb: 15 }), makePeq());
    expect(result).toContain('volume=volume=5.623413');
  });

  it('converts -15 dB to the correct linear factor (~0.177828)', () => {
    const gains = Array(10).fill(0);
    gains[0] = 1;
    const result = buildMpvAfChain(makeEq({ gains, preampDb: -15 }), makePeq());
    expect(result).toContain('volume=volume=0.177828');
  });

  it('converts 0 dB to linear gain of 1.0 — confirmed by Math.pow', () => {
    expect(Math.pow(10, 0 / 20)).toBeCloseTo(1.0, 5);
  });

  it('does NOT produce a dB string like "volume=12dB" — output is linear multiplier', () => {
    const gains = Array(10).fill(0);
    gains[0] = 1;
    const result = buildMpvAfChain(makeEq({ gains, preampDb: 12 }), makePeq());
    expect(result).not.toMatch(/volume=\d+dB/);
    expect(result).toContain('volume=volume=');
  });
});

describe('peqBandToFilter — filter syntax per band type', () => {
  it('generates correct peaking filter syntax', () => {
    expect(peqBandToFilter(makeBand({ type: 'peaking', freq: 1000, gain: 6, q: 1.0 }))).toBe(
      'equalizer=f=1000:width_type=q:w=1:g=6'
    );
  });

  it('generates correct lowshelf filter syntax', () => {
    expect(peqBandToFilter(makeBand({ type: 'lowshelf', freq: 100, gain: 4, q: 0.7 }))).toBe(
      'lowshelf=f=100:width_type=q:w=0.7:g=4'
    );
  });

  it('generates correct highshelf filter syntax', () => {
    expect(peqBandToFilter(makeBand({ type: 'highshelf', freq: 8000, gain: -3, q: 0.7 }))).toBe(
      'highshelf=f=8000:width_type=q:w=0.7:g=-3'
    );
  });

  it('generates correct lowpass filter syntax (gain is ignored)', () => {
    expect(peqBandToFilter(makeBand({ type: 'lowpass', freq: 2000, gain: 0, q: 0.7 }))).toBe(
      'lowpass=f=2000:width_type=q:w=0.7'
    );
  });

  it('generates correct highpass filter syntax (gain is ignored)', () => {
    expect(peqBandToFilter(makeBand({ type: 'highpass', freq: 200, gain: 0, q: 0.7 }))).toBe(
      'highpass=f=200:width_type=q:w=0.7'
    );
  });

  it('generates correct notch (bandreject) filter syntax', () => {
    expect(peqBandToFilter(makeBand({ type: 'notch', freq: 60, gain: 0, q: 10 }))).toBe(
      'bandreject=f=60:width_type=q:w=10'
    );
  });

  it('applies Q value to the bandwidth/shelf-slope field', () => {
    expect(peqBandToFilter(makeBand({ type: 'peaking', q: 1.5 }))).toContain('w=1.5');
  });

  it('returns null for a peaking band with gain 0', () => {
    expect(peqBandToFilter(makeBand({ type: 'peaking', gain: 0 }))).toBeNull();
  });

  it('returns null for a lowshelf band with gain 0', () => {
    expect(peqBandToFilter(makeBand({ type: 'lowshelf', gain: 0 }))).toBeNull();
  });

  it('returns null for a highshelf band with gain 0', () => {
    expect(peqBandToFilter(makeBand({ type: 'highshelf', gain: 0 }))).toBeNull();
  });

  it('returns null when the band is disabled', () => {
    expect(peqBandToFilter(makeBand({ enabled: false, gain: 6 }))).toBeNull();
  });
});

describe('buildMpvAfChain — PEQ integration', () => {
  it('returns empty string when PEQ is disabled', () => {
    const peq = makePeq({ enabled: false, bands: [makeBand()] });
    expect(buildMpvAfChain(makeEq({ enabled: false }), peq)).toBe('');
  });

  it('returns empty string when all PEQ bands have 0 dB gain', () => {
    const peq = makePeq({ enabled: true, bands: [makeBand({ gain: 0 }), makeBand({ gain: 0 })] });
    expect(buildMpvAfChain(makeEq({ enabled: false }), peq)).toBe('');
  });

  it('combines multiple PEQ filters in lavfi format with commas', () => {
    const peq = makePeq({
      enabled: true,
      bands: [makeBand({ freq: 100, gain: 3, q: 1.0 }), makeBand({ freq: 1000, gain: -3, q: 1.0 })],
    });
    expect(buildMpvAfChain(makeEq({ enabled: false }), peq)).toBe(
      'lavfi=[equalizer=f=100:width_type=q:w=1:g=3,equalizer=f=1000:width_type=q:w=1:g=-3]'
    );
  });

  it('handles 10 PEQ bands in sequence, emitting only non-null filters', () => {
    const bands = Array.from({ length: 10 }, (_, i) =>
      makeBand({ freq: (i + 1) * 100, gain: i === 0 ? 3 : 0 })
    );
    const peq = makePeq({ enabled: true, bands });
    const result = buildMpvAfChain(makeEq({ enabled: false }), peq);
    expect(result).toBe('lavfi=[equalizer=f=100:width_type=q:w=1:g=3]');
  });
});
