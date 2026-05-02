import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FlexboxGrid } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { ConfigOptionSection, ConfigPanel } from '../styled';
import {
  StyledButton,
  StyledInput,
  StyledInputPicker,
  StyledInputPickerContainer,
  StyledToggle,
} from '../../shared/styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import {
  addEqCustomPreset,
  deleteEqCustomPreset,
  loadEqPreset,
  setEqEnabled,
  setEqGain,
  setEqPreamp,
  EqPreset,
} from '../../../redux/eqSlice';
import { settings } from '../../shared/setDefaultSettings';
import { notifyToast } from '../../shared/toast';

const EQ_BANDS = [
  { label: '32', freq: 32 },
  { label: '64', freq: 64 },
  { label: '125', freq: 125 },
  { label: '250', freq: 250 },
  { label: '500', freq: 500 },
  { label: '1k', freq: 1000 },
  { label: '2k', freq: 2000 },
  { label: '4k', freq: 4000 },
  { label: '8k', freq: 8000 },
  { label: '16k', freq: 16000 },
];

const BUILT_IN_PRESETS: { label: string; value: string; gains: number[] }[] = [
  { label: 'Flat', value: 'flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { label: 'Bass Boost', value: 'bassBoost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { label: 'Treble Boost', value: 'trebleBoost', gains: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6] },
  { label: 'Pop', value: 'pop', gains: [-1, 3, 4, 4, 2, 0, -1, -1, -1, -1] },
  { label: 'Rock', value: 'rock', gains: [4, 3, 2, 0, -2, -2, 0, 2, 3, 4] },
  { label: 'Electronic', value: 'electronic', gains: [4, 3, 1, 0, -3, -2, 1, 2, 3, 4] },
  { label: 'Vocal Boost', value: 'vocalBoost', gains: [-2, -2, 0, 4, 6, 6, 4, 1, 0, -1] },
  { label: 'Classical', value: 'classical', gains: [3, 2, 2, 0, 0, 0, -1, -1, 2, 3] },
  { label: 'Jazz', value: 'jazz', gains: [3, 2, 1, 2, -2, -2, 0, 1, 3, 4] },
];

const BandsRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: flex-end;
  padding: 8px 0;
`;

const BandColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 44px;
`;

const BandLabel = styled.div`
  font-size: 11px;
  color: ${(props) => props.theme.colors.layout.page.colorSecondary};
  white-space: nowrap;
`;

const DbLabel = styled.div`
  font-size: 11px;
  min-width: 32px;
  text-align: center;
  color: ${(props) => props.theme.colors.layout.page.color};
`;

const VerticalSlider = styled.input.attrs({ type: 'range' })`
  writing-mode: vertical-lr;
  direction: rtl;
  -webkit-appearance: slider-vertical;
  width: 24px;
  height: 120px;
  cursor: pointer;
  accent-color: ${(props) => props.theme.colors.primary};
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

const EQConfig = ({ bordered }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const eq = useAppSelector((state: any) => state.eq);
  const [customPresetName, setCustomPresetName] = useState('');
  const [pendingOverwrite, setPendingOverwrite] = useState<string | null>(null);
  const presetPickerContainerRef = useRef(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist EQ state to electron-store whenever Redux state changes.
  // Using effects (not handler callbacks) avoids stale closure bugs where a handler
  // would read eq.gains/eq.customPresets from a previous render before Redux re-renders.
  useEffect(() => {
    settings.set('eqEnabled', eq.enabled);
  }, [eq.enabled]);
  useEffect(() => {
    settings.set('eqGains', eq.gains);
  }, [eq.gains]);
  useEffect(() => {
    settings.set('eqCustomPresets', eq.customPresets);
  }, [eq.customPresets]);
  useEffect(() => {
    settings.set('eqPreampDb', eq.preampDb);
  }, [eq.preampDb]);

  const handleToggleEnabled = (checked: boolean) => {
    dispatch(setEqEnabled(checked));
  };

  const handleGainChange = (band: number, value: number) => {
    dispatch(setEqGain({ band, gain: value }));
  };

  const handleLoadPreset = (gains: number[], preampDb = 0) => {
    dispatch(loadEqPreset({ gains, preampDb }));
  };

  const handleSaveCustomPreset = () => {
    const name = customPresetName.trim();
    if (!name) {
      notifyToast('error', t('Preset name cannot be empty'));
      return;
    }
    const exists = eq.customPresets.some((p: EqPreset) => p.name === name);
    if (exists && pendingOverwrite !== name) {
      setPendingOverwrite(name);
      return;
    }
    const preset: EqPreset = { name, gains: [...eq.gains], preampDb: eq.preampDb };
    dispatch(addEqCustomPreset(preset));
    setCustomPresetName('');
    setPendingOverwrite(null);
    notifyToast('success', t('Preset "{{name}}" saved', { name }));
  };

  const handleCancelOverwrite = () => {
    setPendingOverwrite(null);
    inputRef.current?.focus();
  };

  const handleDeleteCustomPreset = (name: string) => {
    dispatch(deleteEqCustomPreset(name));
  };

  const formatDb = (v: number) => {
    const s = Number.isInteger(v) ? `${v}` : v.toFixed(1);
    return v > 0 ? `+${s}` : s;
  };

  return (
    <ConfigPanel header={t('Equalizer')} bordered={bordered} $noBackground={false}>
      <ConfigOptionSection>
        <FlexboxGrid justify="space-between" align="middle">
          <FlexboxGrid.Item style={{ fontSize: 14, fontWeight: 500 }}>
            {t('Enable Equalizer')}
          </FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <StyledToggle
              defaultChecked={eq.enabled}
              checked={eq.enabled}
              onChange={handleToggleEnabled}
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
                  disabled={!eq.enabled}
                  data={[
                    ...BUILT_IN_PRESETS.map((p) => ({ label: p.label, value: p.value })),
                    ...(eq.customPresets.length > 0
                      ? [
                          { label: '— Custom —', value: '__separator__' },
                          ...eq.customPresets.map((p: EqPreset) => ({
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
                      const preset = eq.customPresets.find((p: EqPreset) => p.name === name);
                      if (preset) handleLoadPreset(preset.gains, preset.preampDb);
                    } else {
                      const preset = BUILT_IN_PRESETS.find((p) => p.value === val);
                      if (preset) handleLoadPreset(preset.gains, 0);
                    }
                  }}
                  style={{ width: 180 }}
                />
              </StyledInputPickerContainer>
              <StyledButton
                size="sm"
                disabled={!eq.enabled}
                onClick={() => {
                  handleLoadPreset([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
                  dispatch(setEqPreamp(0));
                }}
              >
                {t('Reset')}
              </StyledButton>
            </div>
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </ConfigOptionSection>

      <ConfigOptionSection>
        <BandsRow>
          <BandColumn>
            <BandLabel>{t('Pre')}</BandLabel>
            <VerticalSlider
              min={-12}
              max={0}
              step={0.5}
              value={eq.preampDb}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                dispatch(setEqPreamp(Number(e.target.value)));
              }}
              disabled={!eq.enabled}
            />
            <DbLabel>{formatDb(eq.preampDb)}</DbLabel>
          </BandColumn>
          {EQ_BANDS.map((band, i) => (
            <BandColumn key={band.freq}>
              <BandLabel>{band.label}</BandLabel>
              <VerticalSlider
                min={-12}
                max={12}
                step={0.5}
                value={eq.gains[i] ?? 0}
                onChange={(e) => handleGainChange(i, Number(e.target.value))}
                disabled={!eq.enabled}
              />
              <DbLabel>{formatDb(eq.gains[i] ?? 0)}</DbLabel>
            </BandColumn>
          ))}
        </BandsRow>
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
              disabled={!eq.enabled}
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
          <StyledButton size="sm" disabled={!eq.enabled} onClick={handleSaveCustomPreset}>
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

      {eq.customPresets.length > 0 && (
        <ConfigOptionSection>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
            {t('Custom presets')}
          </div>
          {eq.customPresets.map((preset: EqPreset) => (
            <CustomPresetRow key={preset.name}>
              <CustomPresetName>{preset.name}</CustomPresetName>
              <StyledButton
                size="xs"
                disabled={!eq.enabled}
                onClick={() => handleLoadPreset(preset.gains, preset.preampDb)}
              >
                {t('Load')}
              </StyledButton>
              <StyledButton
                size="xs"
                appearance="subtle"
                disabled={!eq.enabled}
                onClick={() => handleDeleteCustomPreset(preset.name)}
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

export default EQConfig;
