import React, { useEffect, useRef, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { FlexboxGrid } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { ConfigOptionSection, ConfigPanel } from '../styled';
import {
  StyledButton,
  StyledInput,
  StyledInputNumber,
  StyledInputPicker,
  StyledInputPickerContainer,
  StyledToggle,
} from '../../shared/styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import {
  setPeqEnabled,
  setPeqBandField,
  setPeqPreamp,
  resetPeqBands,
  loadPeqPreset,
  addPeqCustomPreset,
  deletePeqCustomPreset,
  PeqBand,
  PeqPreset,
  PeqState,
} from '../../../redux/peqSlice';
import { settings } from '../../shared/setDefaultSettings';
import { notifyToast } from '../../shared/toast';

const SAMPLE_RATE = 48000;
const SVG_W = 600;
const SVG_H = 160;
const DB_MAX = 24;
const DB_MIN = -24;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const N_POINTS = 300;

const logFreqs = Array.from({ length: N_POINTS }, (_, i) => {
  const t = i / (N_POINTS - 1);
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t);
});

function xPos(f: number) {
  return (
    ((Math.log10(f) - Math.log10(FREQ_MIN)) / (Math.log10(FREQ_MAX) - Math.log10(FREQ_MIN))) * SVG_W
  );
}

function yPos(db: number) {
  return ((DB_MAX - db) / (DB_MAX - DB_MIN)) * SVG_H;
}

function bandMagnitudeDb(band: PeqBand, f: number): number {
  if (!band.enabled) return 0;
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * band.freq) / SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * band.q);
  const sqrtA = Math.sqrt(A);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  switch (band.type) {
    case 'peaking':
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
      break;
    case 'lowshelf':
      b0 = A * (A + 1 - (A - 1) * cosW0 + 2 * sqrtA * alpha);
      b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - 2 * sqrtA * alpha);
      a0 = A + 1 + (A - 1) * cosW0 + 2 * sqrtA * alpha;
      a1 = -2 * (A - 1 + (A + 1) * cosW0);
      a2 = A + 1 + (A - 1) * cosW0 - 2 * sqrtA * alpha;
      break;
    case 'highshelf':
      b0 = A * (A + 1 + (A - 1) * cosW0 + 2 * sqrtA * alpha);
      b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - 2 * sqrtA * alpha);
      a0 = A + 1 - (A - 1) * cosW0 + 2 * sqrtA * alpha;
      a1 = 2 * (A - 1 - (A + 1) * cosW0);
      a2 = A + 1 - (A - 1) * cosW0 - 2 * sqrtA * alpha;
      break;
    case 'lowpass':
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cosW0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    default:
      return 0;
  }

  const wf = (2 * Math.PI * f) / SAMPLE_RATE;
  const cW = Math.cos(wf);
  const sW = Math.sin(wf);
  const c2W = Math.cos(2 * wf);
  const s2W = Math.sin(2 * wf);
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;
  const nR = nb0 + nb1 * cW + nb2 * c2W;
  const nI = -(nb1 * sW + nb2 * s2W);
  const dR = 1 + na1 * cW + na2 * c2W;
  const dI = -(na1 * sW + na2 * s2W);
  const mag2 = (nR * nR + nI * nI) / (dR * dR + dI * dI);
  if (mag2 <= 0) return DB_MIN;
  return 20 * Math.log10(Math.sqrt(mag2));
}

function buildCurvePath(bands: PeqBand[], enabled: boolean): string {
  return logFreqs
    .map((f, i) => {
      const db = enabled ? bands.reduce((sum, band) => sum + bandMagnitudeDb(band, f), 0) : 0;
      const clampedDb = Math.max(DB_MIN, Math.min(DB_MAX, db));
      const x = xPos(f);
      const y = yPos(clampedDb);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const GRID_DB = [-18, -12, -6, 0, 6, 12, 18];
const LABEL_FREQS = [100, 1000, 10000];

const SvgWrapper = styled.div`
  width: 100%;
  margin-bottom: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: ${(props) => props.theme.colors.input.background};
`;

const BandTable = styled.div`
  display: table;
  width: 100%;
  border-collapse: collapse;
`;

const BandRow = styled.div`
  display: table-row;
`;

const BandCell = styled.div<{ $header?: boolean; $center?: boolean }>`
  display: table-cell;
  padding: 4px 6px;
  font-size: 12px;
  vertical-align: middle;
  text-align: ${(props) => (props.$center ? 'center' : 'left')};
  color: ${(props) =>
    props.$header
      ? props.theme.colors.layout.page.colorSecondary
      : props.theme.colors.layout.page.color};
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
`;

const PreampSlider = styled.input.attrs({ type: 'range' })`
  width: 100%;
  cursor: pointer;
  accent-color: ${(props) => props.theme.colors.primary};

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const PreampRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
`;

const PreampLabel = styled.span`
  font-size: 12px;
  opacity: 0.7;
  white-space: nowrap;
`;

const PreampValue = styled.span`
  font-size: 12px;
  min-width: 48px;
  text-align: right;
  opacity: 0.9;
`;

const CustomPresetRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  gap: 8px;

  &:last-child {
    border-bottom: none;
  }
`;

const CustomPresetName = styled.div`
  font-size: 13px;
  flex: 1;
`;

const BUILT_IN_PEQ_PRESETS: { label: string; value: string; bands: PeqBand[]; preampDb: number }[] =
  [
    {
      label: 'Flat',
      value: 'flat',
      preampDb: 0,
      bands: [
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
      ],
    },
    {
      label: 'Bass Boost',
      value: 'bassBoost',
      preampDb: -5,
      bands: [
        { enabled: true, type: 'lowshelf', freq: 60, gain: 4, q: 0.7 },
        { enabled: true, type: 'peaking', freq: 100, gain: 5, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 250, gain: 2, q: 1.5 },
        { enabled: false, type: 'peaking', freq: 500, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 1000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 2000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 4000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 6000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 8000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 16000, gain: 0, q: 1.0 },
      ],
    },
    {
      label: 'Treble Boost',
      value: 'trebleBoost',
      preampDb: -4,
      bands: [
        { enabled: false, type: 'peaking', freq: 32, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 64, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 125, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 250, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 500, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 1000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 2000, gain: 0, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 4000, gain: 2, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 8000, gain: 3, q: 1.0 },
        { enabled: true, type: 'highshelf', freq: 12000, gain: 4, q: 0.7 },
      ],
    },
    {
      label: 'Vocal Boost',
      value: 'vocalBoost',
      preampDb: -3,
      bands: [
        { enabled: false, type: 'peaking', freq: 32, gain: 0, q: 1.0 },
        { enabled: true, type: 'highpass', freq: 120, gain: 0, q: 0.7 },
        { enabled: false, type: 'peaking', freq: 125, gain: 0, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 300, gain: -2, q: 2.0 },
        { enabled: false, type: 'peaking', freq: 500, gain: 0, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 1000, gain: 2, q: 2.0 },
        { enabled: true, type: 'peaking', freq: 3500, gain: 3, q: 1.5 },
        { enabled: false, type: 'peaking', freq: 4000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 8000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 16000, gain: 0, q: 1.0 },
      ],
    },
    {
      label: 'Low Cut',
      value: 'lowCut',
      preampDb: 0,
      bands: [
        { enabled: true, type: 'highpass', freq: 80, gain: 0, q: 0.7 },
        { enabled: false, type: 'peaking', freq: 64, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 125, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 250, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 500, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 1000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 2000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 4000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 8000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 16000, gain: 0, q: 1.0 },
      ],
    },
    {
      label: 'Warm',
      value: 'warm',
      preampDb: -3,
      bands: [
        { enabled: false, type: 'peaking', freq: 32, gain: 0, q: 1.0 },
        { enabled: true, type: 'lowshelf', freq: 200, gain: 3, q: 0.7 },
        { enabled: true, type: 'peaking', freq: 250, gain: 1, q: 1.5 },
        { enabled: true, type: 'peaking', freq: 400, gain: 1, q: 1.5 },
        { enabled: false, type: 'peaking', freq: 500, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 1000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 2000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 4000, gain: 0, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 8000, gain: -1.5, q: 1.0 },
        { enabled: true, type: 'highshelf', freq: 12000, gain: -2, q: 0.7 },
      ],
    },
    {
      label: 'Loudness',
      value: 'loudness',
      preampDb: -4,
      bands: [
        { enabled: true, type: 'lowshelf', freq: 60, gain: 4, q: 0.7 },
        { enabled: true, type: 'peaking', freq: 64, gain: 2, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 125, gain: 0, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 200, gain: 1, q: 2.0 },
        { enabled: false, type: 'peaking', freq: 500, gain: 0, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 1000, gain: -1, q: 2.0 },
        { enabled: false, type: 'peaking', freq: 2000, gain: 0, q: 1.0 },
        { enabled: false, type: 'peaking', freq: 4000, gain: 0, q: 1.0 },
        { enabled: true, type: 'peaking', freq: 8000, gain: 2, q: 1.0 },
        { enabled: true, type: 'highshelf', freq: 14000, gain: 3, q: 0.7 },
      ],
    },
  ];

const TYPE_DATA = [
  { label: 'Peak', value: 'peaking' },
  { label: 'Low Shelf', value: 'lowshelf' },
  { label: 'High Shelf', value: 'highshelf' },
  { label: 'Low Pass', value: 'lowpass' },
  { label: 'High Pass', value: 'highpass' },
  { label: 'Notch', value: 'notch' },
];

const NO_GAIN_TYPES = new Set(['lowpass', 'highpass', 'notch']);

const PEQConfig = ({ bordered }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const peq = useAppSelector((state: any) => state.peq as PeqState);
  const theme = useTheme() as any;
  const typePickerRefs = useRef<(HTMLDivElement | null)[]>(Array(10).fill(null));
  const presetPickerContainerRef = useRef(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const [fieldKeys, setFieldKeys] = useState<Record<string, number>>({});
  const [pendingReset, setPendingReset] = useState(false);
  const [customPresetName, setCustomPresetName] = useState('');
  const [pendingOverwrite, setPendingOverwrite] = useState<string | null>(null);
  const bumpKey = (k: string) => setFieldKeys((prev) => ({ ...prev, [k]: (prev[k] || 0) + 1 }));

  useEffect(() => {
    settings.set('peqEnabled', peq.enabled);
  }, [peq.enabled]);
  useEffect(() => {
    settings.set('peqBands', peq.bands);
  }, [peq.bands]);
  useEffect(() => {
    settings.set('peqCustomPresets', peq.customPresets);
  }, [peq.customPresets]);
  useEffect(() => {
    settings.set('peqPreampDb', peq.preampDb);
  }, [peq.preampDb]);

  const handleLoadPreset = (preset: { bands: PeqBand[]; preampDb: number }) => {
    dispatch(loadPeqPreset(preset));
    setPendingReset(true);
  };

  const handleSaveCustomPreset = () => {
    const name = customPresetName.trim();
    if (!name) {
      notifyToast('error', t('Preset name cannot be empty'));
      return;
    }
    const exists = peq.customPresets.some((p: PeqPreset) => p.name === name);
    if (exists && pendingOverwrite !== name) {
      setPendingOverwrite(name);
      return;
    }
    const preset: PeqPreset = {
      name,
      bands: peq.bands.map((b) => ({ ...b })),
      preampDb: peq.preampDb,
    };
    dispatch(addPeqCustomPreset(preset));
    setCustomPresetName('');
    setPendingOverwrite(null);
    notifyToast('success', t('Preset "{{name}}" saved', { name }));
  };

  const handleCancelOverwrite = () => {
    setPendingOverwrite(null);
    inputRef.current?.focus();
  };

  // Wait for peq.bands to actually update in the store (electron-redux IPC round-trip)
  // before bumping the input keys, so defaultValue picks up the fresh reset values.
  useEffect(() => {
    if (!pendingReset) return;
    setResetKey((k) => k + 1);
    setFieldKeys({});
    setPendingReset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peq.bands]);

  const primaryColor = theme?.colors?.primary || '#2196f3';
  const gridColor = 'rgba(128,128,128,0.2)';
  const labelColor = theme?.colors?.layout?.page?.colorSecondary || '#888';
  const zeroDashColor = 'rgba(128,128,128,0.5)';

  const curvePath = buildCurvePath(peq.bands, peq.enabled);

  const updateBandField = (index: number, field: keyof PeqBand, value: any) => {
    dispatch(setPeqBandField({ index, field, value }));
  };

  const formatPreamp = (v: number) => {
    const s = Number.isInteger(v) ? `${v}` : v.toFixed(1);
    return `${v > 0 ? '+' : ''}${s} dB`;
  };

  return (
    <ConfigPanel header={t('Parametric Equalizer')} bordered={bordered} $noBackground={false}>
      <ConfigOptionSection>
        <FlexboxGrid justify="space-between" align="middle">
          <FlexboxGrid.Item style={{ fontSize: 14, fontWeight: 500 }}>
            {t('Enable Parametric EQ')}
          </FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <StyledToggle
              defaultChecked={peq.enabled}
              checked={peq.enabled}
              onChange={(val: boolean) => dispatch(setPeqEnabled(val))}
            />
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </ConfigOptionSection>

      <ConfigOptionSection>
        <FlexboxGrid align="middle">
          <FlexboxGrid.Item style={{ fontSize: 13, fontWeight: 500, marginRight: 8 }}>
            {t('Presets')}
          </FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StyledInputPickerContainer
                ref={presetPickerContainerRef}
                style={{ position: 'relative', height: 30, overflow: 'visible' }}
              >
                <StyledInputPicker
                  container={() => presetPickerContainerRef.current}
                  size="sm"
                  searchable={false}
                  cleanable={false}
                  disabled={!peq.enabled}
                  data={[
                    ...BUILT_IN_PEQ_PRESETS.map((p) => ({ label: p.label, value: p.value })),
                    ...(peq.customPresets.length > 0
                      ? [
                          { label: '— Custom —', value: '__separator__' },
                          ...peq.customPresets.map((p: PeqPreset) => ({
                            label: `★ ${p.name}`,
                            value: `custom:${p.name}`,
                          })),
                        ]
                      : []),
                  ]}
                  placeholder={t('Load preset')}
                  value={null}
                  onChange={(val: string | null) => {
                    if (!val || val === '__separator__') return;
                    if (val.startsWith('custom:')) {
                      const name = val.slice(7);
                      const preset = peq.customPresets.find((p: PeqPreset) => p.name === name);
                      if (preset) handleLoadPreset(preset);
                    } else {
                      const preset = BUILT_IN_PEQ_PRESETS.find((p) => p.value === val);
                      if (preset) handleLoadPreset(preset);
                    }
                  }}
                  style={{ width: 180 }}
                />
              </StyledInputPickerContainer>
              <StyledButton
                size="sm"
                disabled={!peq.enabled}
                onClick={() => {
                  dispatch(resetPeqBands());
                  dispatch(setPeqPreamp(0));
                  setPendingReset(true);
                }}
              >
                {t('Reset')}
              </StyledButton>
            </div>
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </ConfigOptionSection>

      <ConfigOptionSection>
        <SvgWrapper>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: '160px' }}
          >
            {/* Vertical grid lines */}
            {GRID_FREQS.map((f) => (
              <line
                key={f}
                x1={xPos(f)}
                y1={0}
                x2={xPos(f)}
                y2={SVG_H}
                stroke={gridColor}
                strokeWidth="1"
              />
            ))}
            {/* Horizontal grid lines */}
            {GRID_DB.map((db) => (
              <line
                key={db}
                x1={0}
                y1={yPos(db)}
                x2={SVG_W}
                y2={yPos(db)}
                stroke={db === 0 ? zeroDashColor : gridColor}
                strokeWidth={db === 0 ? 1.5 : 1}
                strokeDasharray={db === 0 ? '4 3' : undefined}
              />
            ))}
            {/* Frequency labels */}
            {LABEL_FREQS.map((f) => (
              <text
                key={f}
                x={xPos(f)}
                y={SVG_H - 4}
                textAnchor="middle"
                fontSize="11"
                fill={labelColor}
              >
                {f >= 1000 ? `${f / 1000}k` : `${f}`}
              </text>
            ))}
            {/* dB labels */}
            {[-12, 0, 12].map((db) => (
              <text key={db} x={4} y={yPos(db) - 3} fontSize="10" fill={labelColor}>
                {db > 0 ? `+${db}` : db}
              </text>
            ))}
            {/* Frequency response curve */}
            <path
              d={curvePath}
              fill="none"
              stroke={peq.enabled ? primaryColor : gridColor}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </SvgWrapper>
      </ConfigOptionSection>

      <ConfigOptionSection>
        <PreampRow>
          <PreampLabel>{t('Preamp')}</PreampLabel>
          <PreampSlider
            min={-20}
            max={0}
            step={0.1}
            value={peq.preampDb}
            disabled={!peq.enabled}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              dispatch(setPeqPreamp(Math.round(Number(e.target.value) * 10) / 10));
            }}
          />
          <PreampValue>{formatPreamp(peq.preampDb)}</PreampValue>
        </PreampRow>
        <BandTable>
          <BandRow>
            <BandCell $header $center>
              #
            </BandCell>
            <BandCell $header $center>
              {t('On')}
            </BandCell>
            <BandCell $header>{t('Type')}</BandCell>
            <BandCell $header>{t('Freq (Hz)')}</BandCell>
            <BandCell $header>{t('Gain (dB)')}</BandCell>
            <BandCell $header>{t('Q')}</BandCell>
          </BandRow>
          {peq.bands.map((band, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <BandRow key={i}>
              <BandCell $center style={{ opacity: 0.5, width: 24 }}>
                {i + 1}
              </BandCell>
              <BandCell $center style={{ width: 36 }}>
                <StyledToggle
                  size="sm"
                  checked={band.enabled}
                  disabled={!peq.enabled}
                  onChange={(val: boolean) => updateBandField(i, 'enabled', val)}
                />
              </BandCell>
              <BandCell>
                <StyledInputPickerContainer
                  ref={(el: HTMLDivElement | null) => {
                    typePickerRefs.current[i] = el;
                  }}
                  style={{ position: 'relative', height: 22, overflow: 'visible' }}
                >
                  <StyledInputPicker
                    container={() => typePickerRefs.current[i]}
                    size="xs"
                    searchable={false}
                    cleanable={false}
                    disabled={!peq.enabled || !band.enabled}
                    data={TYPE_DATA}
                    value={band.type}
                    onChange={(val: string) => updateBandField(i, 'type', val as PeqBand['type'])}
                    style={{ width: 100 }}
                  />
                </StyledInputPickerContainer>
              </BandCell>
              <BandCell>
                <StyledInputNumber
                  size="xs"
                  disabled={!peq.enabled || !band.enabled}
                  key={`${resetKey}-${fieldKeys[`${i}-freq`] || 0}-${i}-freq`}
                  defaultValue={band.freq}
                  onBlur={() => bumpKey(`${i}-freq`)}
                  min={20}
                  max={20000}
                  step={1}
                  width={80}
                  onChange={(val: number) => {
                    const n = Number(val);
                    if (!Number.isFinite(n)) return;
                    updateBandField(i, 'freq', Math.round(Math.max(20, Math.min(20000, n))));
                  }}
                />
              </BandCell>
              <BandCell>
                <StyledInputNumber
                  size="xs"
                  disabled={!peq.enabled || !band.enabled || NO_GAIN_TYPES.has(band.type)}
                  key={`${resetKey}-${fieldKeys[`${i}-gain`] || 0}-${i}-gain`}
                  defaultValue={NO_GAIN_TYPES.has(band.type) ? 0 : band.gain}
                  onBlur={() => bumpKey(`${i}-gain`)}
                  min={-12}
                  max={12}
                  step={0.1}
                  width={70}
                  onChange={(val: number) => {
                    const n = Number(val);
                    if (!Number.isFinite(n)) return;
                    updateBandField(
                      i,
                      'gain',
                      Math.round(Math.max(-12, Math.min(12, n)) * 10) / 10
                    );
                  }}
                />
              </BandCell>
              <BandCell>
                <StyledInputNumber
                  size="xs"
                  disabled={!peq.enabled || !band.enabled}
                  key={`${resetKey}-${fieldKeys[`${i}-q`] || 0}-${i}-q`}
                  defaultValue={band.q}
                  onBlur={() => bumpKey(`${i}-q`)}
                  min={0.1}
                  max={16}
                  step={0.1}
                  width={65}
                  onChange={(val: number) => {
                    const n = Number(val);
                    if (!Number.isFinite(n) || n <= 0) return;
                    updateBandField(i, 'q', Math.round(Math.max(0.1, Math.min(16, n)) * 10) / 10);
                  }}
                />
              </BandCell>
            </BandRow>
          ))}
        </BandTable>
      </ConfigOptionSection>

      <ConfigOptionSection>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
          {t('Save custom preset')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <StyledInput
              inputRef={inputRef}
              size="sm"
              disabled={!peq.enabled}
              placeholder={t('Preset name')}
              value={customPresetName}
              onChange={(val: string) => {
                setCustomPresetName(val);
                if (pendingOverwrite) setPendingOverwrite(null);
              }}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') handleSaveCustomPreset();
                if (e.key === 'Escape') handleCancelOverwrite();
              }}
            />
          </div>
          <StyledButton size="sm" disabled={!peq.enabled} onClick={handleSaveCustomPreset}>
            {pendingOverwrite === customPresetName.trim() ? t('Confirm') : t('Save')}
          </StyledButton>
        </div>
        {pendingOverwrite && (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: '#e8a838',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {t('"{{name}}" already exists. Click Confirm to overwrite.', {
              name: pendingOverwrite,
            })}
            <StyledButton size="xs" appearance="subtle" onClick={handleCancelOverwrite}>
              {t('Cancel')}
            </StyledButton>
          </div>
        )}
      </ConfigOptionSection>

      {peq.customPresets.length > 0 && (
        <ConfigOptionSection>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
            {t('Custom presets')}
          </div>
          {peq.customPresets.map((preset: PeqPreset) => (
            <CustomPresetRow key={preset.name}>
              <CustomPresetName>{preset.name}</CustomPresetName>
              <StyledButton
                size="xs"
                disabled={!peq.enabled}
                onClick={() => handleLoadPreset(preset)}
              >
                {t('Load')}
              </StyledButton>
              <StyledButton
                size="xs"
                appearance="subtle"
                disabled={!peq.enabled}
                onClick={() => dispatch(deletePeqCustomPreset(preset.name))}
              >
                {t('Delete')}
              </StyledButton>
            </CustomPresetRow>
          ))}
        </ConfigOptionSection>
      )}
    </ConfigPanel>
  );
};

export default PEQConfig;
