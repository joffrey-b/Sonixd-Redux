import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

// Cooley-Tukey in-place FFT (power-of-2 size)
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      // eslint-disable-next-line no-param-reassign
      let t = re[i];
      // eslint-disable-next-line no-param-reassign
      re[i] = re[j];
      // eslint-disable-next-line no-param-reassign
      re[j] = t;
      // eslint-disable-next-line no-param-reassign
      t = im[i];
      // eslint-disable-next-line no-param-reassign
      im[i] = im[j];
      // eslint-disable-next-line no-param-reassign
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wCosBase = Math.cos(ang);
    const wSinBase = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wCos = 1;
      let wSin = 0;
      for (let j = 0; j < len >> 1; j++) {
        const k = i + j + (len >> 1);
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[k] * wCos - im[k] * wSin;
        const vIm = re[k] * wSin + im[k] * wCos;
        // eslint-disable-next-line no-param-reassign
        re[i + j] = uRe + vRe;
        // eslint-disable-next-line no-param-reassign
        im[i + j] = uIm + vIm;
        // eslint-disable-next-line no-param-reassign
        re[k] = uRe - vRe;
        // eslint-disable-next-line no-param-reassign
        im[k] = uIm - vIm;
        const nextWCos = wCos * wCosBase - wSin * wSinBase;
        wSin = wCos * wSinBase + wSin * wCosBase;
        wCos = nextWCos;
      }
    }
  }
}

function makeHannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

// black → blue → cyan → green → yellow → red — range: -120 to 0 dB
function dbToRgb(db: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (db + 120) / 120));
  if (t < 0.25) return [0, 0, Math.round(t * 4 * 255)];
  if (t < 0.5) {
    const s = (t - 0.25) * 4;
    return [0, Math.round(s * 255), 255];
  }
  if (t < 0.75) {
    const s = (t - 0.5) * 4;
    return [Math.round(s * 255), 255, Math.round((1 - s) * 255)];
  }
  const s = (t - 0.75) * 4;
  return [255, Math.round((1 - s) * 255), 0];
}

// Probe the native sample rate from WAV or FLAC headers before decoding,
// so AudioContext can be created at the correct rate and avoid resampling.
function probeNativeSampleRate(buf: ArrayBuffer): number {
  const b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 32));
  // WAV: "RIFF" at 0, "WAVE" at 8, sample rate = LE uint32 at bytes 24-27
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x41 &&
    b[10] === 0x56 &&
    b[11] === 0x45
  ) {
    return new DataView(buf).getUint32(24, true);
  }
  // FLAC: "fLaC" at 0, STREAMINFO data starts at byte 8,
  // sample rate occupies bits 80-99 of STREAMINFO = top 20 bits of bytes 18-20
  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) {
    return ((b[18] << 12) | (b[19] << 4) | (b[20] >> 4)) & 0xfffff;
  }
  return 0; // unknown format — let AudioContext use its default
}

// Linear frequency labels every 2 kHz (adapts to sample rate)
function getFreqLabels(nyquist: number): number[] {
  const step = nyquist >= 40000 ? 5000 : nyquist >= 25000 ? 4000 : 2000;
  const labels: number[] = [];
  for (let f = step; f < nyquist - step / 2; f += step) labels.push(f);
  return labels;
}

// Canvas pixel layout
const CW = 1500; // total canvas width
const SPEC_H = 520; // spectrogram area height
const TAXIS_H = 18; // time axis strip height below spectrogram
const CH = SPEC_H + TAXIS_H; // total canvas height
const AX_L = 48; // left freq-axis strip width
const GRAD_GAP = 8; // gap between spectrogram and gradient
const GRAD_W = 18; // color gradient bar width
const LABEL_W = 46; // dB label area width
const AX_R = GRAD_GAP + GRAD_W + LABEL_W; // = 72 total right strip
const SPEC_X = AX_L; // spectrogram starts here
const SPEC_W = CW - AX_L - AX_R; // = 1380
const GRAD_X = SPEC_X + SPEC_W + GRAD_GAP; // gradient bar x
const FFT_SIZE = 2048;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
`;

const Container = styled.div`
  resize: both;
  overflow: hidden;
  min-width: 500px;
  min-height: 320px;
  width: 860px;
  height: 538px;
  background: #111;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.9);
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  flex-shrink: 0;
  font-size: 0.88em;
  opacity: 0.75;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 1.1em;
  line-height: 1;
  opacity: 0.6;
  padding: 2px 4px;
  &:hover {
    opacity: 1;
  }
`;

const CanvasArea = styled.div`
  flex: 1;
  position: relative;
  min-height: 0;
  background: #000;
`;

interface Props {
  show: boolean;
  handleHide: () => void;
  streamUrl?: string;
  title?: string;
  artist?: string;
}

const SpectrogramModal = ({ show, handleHide, streamUrl, title, artist }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!show) {
      setStatus('idle');
      return undefined;
    }
    if (!streamUrl) return undefined;
    setStatus('loading');

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(streamUrl);
        if (cancelled) return;
        if (!response.ok) throw new Error('fetch failed');
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const nativeRate = probeNativeSampleRate(arrayBuffer);
        const audioCtx =
          nativeRate > 0
            ? new window.AudioContext({ sampleRate: nativeRate })
            : new window.AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close();
        if (cancelled) return;

        const numChannels = audioBuffer.numberOfChannels;
        const totalSamples = audioBuffer.length;
        const sampleRate = audioBuffer.sampleRate;
        const nyquist = sampleRate / 2;

        // Mix down to mono
        const samples = new Float32Array(totalSamples);
        for (let c = 0; c < numChannels; c++) {
          const ch = audioBuffer.getChannelData(c);
          for (let i = 0; i < totalSamples; i++) samples[i] += ch[i] / numChannels;
        }

        const numFrames = SPEC_W;
        const hopSize = Math.max(1, Math.floor((totalSamples - FFT_SIZE) / numFrames));
        const hann = makeHannWindow(FFT_SIZE);
        const re = new Float32Array(FFT_SIZE);
        const im = new Float32Array(FFT_SIZE);

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d')!;

        // Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, CW, CH);

        // Linear frequency mapping: row 0 = top = nyquist, row SPEC_H-1 = bottom = 0 Hz
        const freqPerBin = nyquist / (FFT_SIZE / 2);
        const rowToBin = new Int32Array(SPEC_H);
        for (let row = 0; row < SPEC_H; row++) {
          const t = (SPEC_H - 1 - row) / (SPEC_H - 1); // 0 at bottom, 1 at top
          const freq = t * nyquist;
          rowToBin[row] = Math.min(FFT_SIZE / 2 - 1, Math.max(0, Math.round(freq / freqPerBin)));
        }

        // Compute and draw spectrogram
        const imgData = ctx.createImageData(SPEC_W, SPEC_H);
        for (let frame = 0; frame < numFrames; frame++) {
          if (cancelled) return;
          const offset = frame * hopSize;
          for (let i = 0; i < FFT_SIZE; i++) {
            re[i] = (samples[offset + i] || 0) * hann[i];
            im[i] = 0;
          }
          fft(re, im);
          for (let row = 0; row < SPEC_H; row++) {
            const bin = rowToBin[row];
            const mag = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
            const db = mag > 1e-10 ? 20 * Math.log10(mag / (FFT_SIZE / 2)) : -120;
            const [r, g, b] = dbToRgb(db);
            const idx = (row * SPEC_W + frame) * 4;
            imgData.data[idx] = r;
            imgData.data[idx + 1] = g;
            imgData.data[idx + 2] = b;
            imgData.data[idx + 3] = 255;
          }
        }
        if (cancelled) return;
        ctx.putImageData(imgData, SPEC_X, 0);

        // Frequency axis (left strip, dark bg, labels)
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, AX_L, CH);
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';

        // Separator line
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(AX_L, 0, 1, CH);

        ctx.fillStyle = 'rgba(255,255,255,0.7)';

        // Top label = nyquist
        const nyqLabel = nyquist >= 1000 ? `${Math.round(nyquist / 1000)}k` : `${nyquist}`;
        ctx.fillText(nyqLabel, AX_L - 4, 10);

        // Bottom label = 0
        ctx.fillText('0', AX_L - 4, SPEC_H - 2);

        // Intermediate freq labels + grid lines (linear spacing)
        for (const freq of getFreqLabels(nyquist)) {
          const y = Math.round((1 - freq / nyquist) * (SPEC_H - 1));
          const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(SPEC_X + 1, y, SPEC_W - 1, 1);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(label, AX_L - 4, y + 4);
        }

        // Color bar (right strip)
        ctx.fillStyle = '#111';
        ctx.fillRect(SPEC_X + SPEC_W, 0, AX_R, CH);

        // Gradient bar
        const gradImgData = ctx.createImageData(GRAD_W, SPEC_H);
        for (let y = 0; y < SPEC_H; y++) {
          // top = 0 dB, bottom = -120 dB
          const db = -120 + ((SPEC_H - 1 - y) / (SPEC_H - 1)) * 120;
          const [r, g, b] = dbToRgb(db);
          for (let x = 0; x < GRAD_W; x++) {
            const idx = (y * GRAD_W + x) * 4;
            gradImgData.data[idx] = r;
            gradImgData.data[idx + 1] = g;
            gradImgData.data[idx + 2] = b;
            gradImgData.data[idx + 3] = 255;
          }
        }
        ctx.putImageData(gradImgData, GRAD_X, 0);

        // dB labels every 10 dB, clamped so text never clips the edge
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        for (let db = 0; db >= -120; db -= 10) {
          const t = (db + 120) / 120;
          const y = Math.round((1 - t) * (SPEC_H - 1));
          const textY = Math.max(10, Math.min(SPEC_H - 3, y + 4));
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(GRAD_X - 2, y, 2, 1);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(`${db} dB`, GRAD_X + GRAD_W + 4, textY);
        }

        // Time axis (dedicated strip below spectrogram)
        const duration = totalSamples / sampleRate;
        const timeStep = duration < 90 ? 15 : duration < 300 ? 30 : duration < 600 ? 60 : 120;
        const formatTime = (s: number) =>
          `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(SPEC_X, SPEC_H, SPEC_W, 1);
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        for (let s = 0; s <= duration; s += timeStep) {
          const x = SPEC_X + Math.round((s / duration) * SPEC_W);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(x, SPEC_H + 2, 1, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.fillText(formatTime(s), x, SPEC_H + TAXIS_H - 3);
        }

        setStatus('done');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [show, streamUrl]);

  const label = [artist, title].filter(Boolean).join(' — ');

  if (!show) return null;

  return (
    <Backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) handleHide();
      }}
    >
      <Container>
        <Header>
          <span>{label}</span>
          <CloseBtn onClick={handleHide}>✕</CloseBtn>
        </Header>
        <CanvasArea>
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
            }}
          />
          {status === 'loading' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '0.85em',
              }}
            >
              Analyzing audio...
            </div>
          )}
          {status === 'error' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#e06c75',
                fontSize: '0.85em',
              }}
            >
              Failed to load audio for analysis.
            </div>
          )}
        </CanvasArea>
      </Container>
    </Backdrop>
  );
};

export default SpectrogramModal;
