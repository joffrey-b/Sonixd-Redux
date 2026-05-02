import { EqState } from '../redux/eqSlice';
import { PeqBand, PeqState } from '../redux/peqSlice';

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_Q = 1.4;

function peqBandToFilter(band: PeqBand): string | null {
  if (!band.enabled) return null;
  const { freq, gain, q, type } = band;
  switch (type) {
    case 'peaking':
      if (gain === 0) return null;
      return `equalizer=f=${freq}:width_type=q:w=${q}:g=${gain}`;
    case 'lowshelf':
      if (gain === 0) return null;
      return `lowshelf=f=${freq}:width_type=q:w=${q}:g=${gain}`;
    case 'highshelf':
      if (gain === 0) return null;
      return `highshelf=f=${freq}:width_type=q:w=${q}:g=${gain}`;
    case 'lowpass':
      return `lowpass=f=${freq}:width_type=q:w=${q}`;
    case 'highpass':
      return `highpass=f=${freq}:width_type=q:w=${q}`;
    case 'notch':
      return `bandreject=f=${freq}:width_type=q:w=${q}`;
    default:
      return null;
  }
}

export function buildMpvAfChain(eq: EqState, peq: PeqState): string {
  const filters: string[] = [];

  // Graphic EQ bands (fixed frequencies, peaking)
  if (eq.enabled) {
    eq.gains.forEach((gain, i) => {
      if (gain !== 0) {
        filters.push(`equalizer=f=${EQ_FREQUENCIES[i]}:width_type=q:w=${EQ_Q}:g=${gain}`);
      }
    });
    if (eq.preampDb !== 0) {
      filters.push(`volume=volume=${eq.preampDb}dB`);
    }
  }

  // Parametric EQ bands
  if (peq.enabled) {
    peq.bands.forEach((band) => {
      const f = peqBandToFilter(band);
      if (f) filters.push(f);
    });
    if (peq.preampDb !== 0) {
      filters.push(`volume=volume=${peq.preampDb}dB`);
    }
  }

  if (filters.length === 0) return '';
  return `lavfi=[${filters.join(',')}]`;
}
