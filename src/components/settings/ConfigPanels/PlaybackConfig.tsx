import React, { useEffect, useRef, useState } from 'react';
import { ButtonToolbar } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { ConfigPanel } from '../styled';
import {
  StyledButton,
  StyledInput,
  StyledInputNumber,
  StyledInputPicker,
  StyledInputPickerContainer,
  StyledToggle,
} from '../../shared/styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import { ipcRenderer } from 'electron';
import { setPlaybackSetting } from '../../../redux/playQueueSlice';
import {
  setAudioDeviceId,
  setMpvAudioDeviceId,
  setPlayerBackend,
  setMpvPath,
  setMpvGapless,
  setMpvReplayGain,
} from '../../../redux/configSlice';
import { notifyToast } from '../../shared/toast';
import ConfigOption from '../ConfigOption';
import { settings } from '../../shared/setDefaultSettings';

const getAudioDevice = async () => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return (devices || []).filter((dev: MediaDeviceInfo) => dev.kind === 'audiooutput');
};

const PlaybackConfig = ({ bordered }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);
  const [crossfadeDuration, setCrossfadeDuration] = useState(Number(settings.get('fadeDuration')));
  const [pollingInterval, setPollingInterval] = useState(Number(settings.get('pollingInterval')));
  const [volumeFade, setVolumeFade] = useState(Boolean(settings.get('volumeFade')));
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>();
  const [mpvAudioDevices, setMpvAudioDevices] = useState<{ label: string; value: string }[]>([]);
  const [mpvPathInput, setMpvPathInput] = useState(config.playback.mpvPath || '');
  const backendPickerContainerRef = useRef(null);
  const crossfadePickerContainerRef = useRef(null);
  const audioDevicePickerContainerRef = useRef(null);
  const mpvDevicePickerContainerRef = useRef(null);
  const mpvGaplessPickerContainerRef = useRef(null);
  const mpvReplayGainPickerContainerRef = useRef(null);

  const isMpv = config.playback.playerBackend === 'mpv';

  const GAPLESS_OPTIONS = [
    { label: t('Weak (recommended)'), value: 'weak' },
    { label: t('Yes'), value: 'yes' },
    { label: t('No'), value: 'no' },
  ];

  useEffect(() => {
    const refreshAudioDevices = () => {
      getAudioDevice()
        .then((dev) => {
          setAudioDevices(dev);
          if (
            config.playback.audioDeviceId &&
            !dev.find((d) => d.deviceId === config.playback.audioDeviceId)
          ) {
            const savedLabel = settings.get('audioDeviceLabel') as string | null;
            const byLabel = savedLabel && dev.find((d) => d.label === savedLabel);
            if (byLabel) {
              dispatch(setAudioDeviceId(byLabel.deviceId));
              settings.set('audioDeviceId', byLabel.deviceId);
            } else {
              notifyToast(
                'warning',
                t('Selected audio device is no longer available. Using system default.')
              );
            }
          }
          return null;
        })
        .catch(() => notifyToast('error', t('Error fetching audio devices')));
    };

    refreshAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshAudioDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshAudioDevices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, config.playback.audioDeviceId]);

  const handleSetCrossfadeDuration = (e: number) => {
    setCrossfadeDuration(e);
    settings.set('fadeDuration', Number(e));
    dispatch(
      setPlaybackSetting({
        setting: 'fadeDuration',
        value: Number(e),
      })
    );
  };

  const handleSetPollingInterval = (e: number) => {
    setPollingInterval(e);
    settings.set('pollingInterval', Number(e));
    dispatch(
      setPlaybackSetting({
        setting: 'pollingInterval',
        value: Number(e),
      })
    );
  };

  const handleSetVolumeFade = (e: boolean) => {
    setVolumeFade(e);
    settings.set('volumeFade', e);
    dispatch(setPlaybackSetting({ setting: 'volumeFade', value: e }));
  };

  const refreshMpvDevices = async () => {
    const devices = await ipcRenderer.invoke('player-get-audio-devices');
    setMpvAudioDevices(devices || []);
  };

  // Auto-load MPV device list on mount. Retry after a delay because MPV may
  // not be initialized yet when the settings page loads (e.g. after import).
  useEffect(() => {
    if (!isMpv) return undefined;
    refreshMpvDevices();
    const timer = setTimeout(refreshMpvDevices, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMpv]);

  const handleSetPlayerBackend = (val: 'web' | 'mpv') => {
    dispatch(setPlayerBackend(val));
    settings.set('playerBackend', val);
    if (val === 'mpv') {
      setTimeout(refreshMpvDevices, 1500);
    }
  };

  const handleSetMpvPath = () => {
    const trimmed = mpvPathInput.trim();
    dispatch(setMpvPath(trimmed));
    settings.set('mpvPath', trimmed);
  };

  const handleSetMpvGapless = (val: 'no' | 'weak' | 'yes') => {
    dispatch(setMpvGapless(val));
    settings.set('mpvGapless', val);
  };

  const handleSetMpvReplayGain = (val: 'no' | 'track' | 'album') => {
    dispatch(setMpvReplayGain(val));
    settings.set('mpvReplayGain', val);
  };

  const handleSetMpvAudioDevice = (val: string) => {
    // MPV audio device changes trigger a full restart in MpvPlayer.tsx via useEffect
    dispatch(setMpvAudioDeviceId(val));
    settings.set('mpvAudioDeviceId', val);
  };

  return (
    <>
      <ConfigPanel bordered={bordered} header={t('Player Backend')}>
        <ConfigOption
          name={t('Backend')}
          description={t(
            'Web uses the built-in Chromium audio engine. MPV requires MPV to be installed on your system and supports gapless playback.'
          )}
          option={
            <StyledInputPickerContainer
              ref={backendPickerContainerRef}
              style={{ position: 'relative', height: 30, overflow: 'visible' }}
            >
              <StyledInputPicker
                container={() => backendPickerContainerRef.current}
                size="sm"
                searchable={false}
                cleanable={false}
                value={config.playback.playerBackend}
                data={[
                  { label: t('Web (default)'), value: 'web' },
                  { label: t('MPV'), value: 'mpv' },
                ]}
                onChange={(val: 'web' | 'mpv') => handleSetPlayerBackend(val)}
                style={{ width: 160 }}
              />
            </StyledInputPickerContainer>
          }
        />
      </ConfigPanel>

      {isMpv && (
        <ConfigPanel bordered={bordered} header={t('MPV Settings')}>
          <ConfigOption
            name={t('MPV Binary Path')}
            description={t(
              'Path to the mpv binary. Leave empty to use the system-installed mpv. Install guide: Windows: winget install mpv | Linux: apt/pacman install mpv | macOS: brew install mpv'
            )}
            option={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StyledInput
                  size="sm"
                  placeholder={t('e.g. /usr/bin/mpv or C:\\mpv\\mpv.exe')}
                  value={mpvPathInput}
                  onChange={(val: string) => setMpvPathInput(val)}
                  onBlur={handleSetMpvPath}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter') handleSetMpvPath();
                  }}
                  style={{ width: 280 }}
                />
              </div>
            }
          />

          <ConfigOption
            name={t('Gapless Mode')}
            description={t(
              'Controls how MPV handles transitions between tracks. Weak is recommended.'
            )}
            option={
              <StyledInputPickerContainer
                ref={mpvGaplessPickerContainerRef}
                style={{ position: 'relative', height: 30, overflow: 'visible' }}
              >
                <StyledInputPicker
                  container={() => mpvGaplessPickerContainerRef.current}
                  size="sm"
                  searchable={false}
                  cleanable={false}
                  value={config.playback.mpvGapless}
                  data={GAPLESS_OPTIONS}
                  onChange={(val: 'no' | 'weak' | 'yes') => handleSetMpvGapless(val)}
                  style={{ width: 180 }}
                />
              </StyledInputPickerContainer>
            }
          />

          <ConfigOption
            name={t('ReplayGain')}
            description={t(
              'Normalize loudness across tracks using ReplayGain tags embedded in your audio files. Track adjusts each song individually. Album preserves relative dynamics within an album.'
            )}
            option={
              <StyledInputPickerContainer
                ref={mpvReplayGainPickerContainerRef}
                style={{ position: 'relative', height: 30, overflow: 'visible' }}
              >
                <StyledInputPicker
                  container={() => mpvReplayGainPickerContainerRef.current}
                  size="sm"
                  searchable={false}
                  cleanable={false}
                  value={config.playback.mpvReplayGain}
                  data={[
                    { label: t('Off'), value: 'no' },
                    { label: t('Track'), value: 'track' },
                    { label: t('Album'), value: 'album' },
                  ]}
                  onChange={(val: 'no' | 'track' | 'album') => handleSetMpvReplayGain(val)}
                  style={{ width: 120 }}
                />
              </StyledInputPickerContainer>
            }
          />

          <ConfigOption
            name={t('Audio Device')}
            description={t('The audio output device for MPV.')}
            option={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StyledInputPickerContainer
                  ref={mpvDevicePickerContainerRef}
                  style={{ position: 'relative', height: 30, overflow: 'visible' }}
                >
                  <StyledInputPicker
                    container={() => mpvDevicePickerContainerRef.current}
                    size="sm"
                    searchable={false}
                    cleanable={false}
                    value={config.playback.mpvAudioDeviceId || null}
                    data={mpvAudioDevices}
                    labelKey="label"
                    valueKey="value"
                    placeholder={t('System default')}
                    onChange={(val: string) => handleSetMpvAudioDevice(val)}
                    style={{ width: 220 }}
                  />
                </StyledInputPickerContainer>
                <StyledButton size="sm" onClick={refreshMpvDevices}>
                  {t('Refresh')}
                </StyledButton>
              </div>
            }
          />
        </ConfigPanel>
      )}

      {!isMpv && (
        <ConfigPanel bordered={bordered} header={t('Playback')}>
          <ConfigOption
            name={t('Crossfade Duration (s)')}
            description={t(
              'The number in seconds before starting the crossfade to the next track. Setting this to 0 will enable gapless playback.'
            )}
            option={
              <StyledInputNumber
                defaultValue={crossfadeDuration}
                value={crossfadeDuration}
                step={0.05}
                min={0}
                max={100}
                width={125}
                onChange={(e: number) => handleSetCrossfadeDuration(e)}
              />
            }
          />

          <ConfigOption
            name={t('Polling Interval')}
            description={t(
              'The number in milliseconds between each poll when music is playing. This is used in the calculation for crossfading and gapless playback. Recommended value for gapless playback is between 10 and 20.'
            )}
            option={
              <StyledInputNumber
                defaultValue={pollingInterval}
                value={pollingInterval}
                step={1}
                min={1}
                max={1000}
                width={125}
                onChange={(e: number) => handleSetPollingInterval(e)}
              />
            }
          />

          <ConfigOption
            name={t('Crossfade Type')}
            description={t('The fade calculation to use when crossfading between two tracks.')}
            option={
              <StyledInputPickerContainer ref={crossfadePickerContainerRef}>
                <StyledInputPicker
                  container={() => crossfadePickerContainerRef.current}
                  data={[
                    {
                      label: t('Equal Power'),
                      value: 'equalPower',
                    },
                    {
                      label: t('Linear'),
                      value: 'linear',
                    },
                    {
                      label: t('Dipped'),
                      value: 'dipped',
                    },
                    {
                      label: t('Constant Power'),
                      value: 'constantPower',
                    },
                    {
                      label: t('Constant Power (slow fade)'),
                      value: 'constantPowerSlowFade',
                    },
                    {
                      label: t('Constant Power (slow cut)'),
                      value: 'constantPowerSlowCut',
                    },
                    {
                      label: t('Constant Power (fast cut)'),
                      value: 'constantPowerFastCut',
                    },
                  ]}
                  cleanable={false}
                  defaultValue={String(settings.get('fadeType'))}
                  placeholder={t('Select')}
                  onChange={(e: string) => {
                    settings.set('fadeType', e);
                    dispatch(setPlaybackSetting({ setting: 'fadeType', value: e }));
                  }}
                  width={200}
                />
              </StyledInputPickerContainer>
            }
          />

          <ConfigOption
            name={t('Volume Fade')}
            description={t(
              'Enable or disable the volume fade used by the crossfading players. If disabled, the fading in track will start at full volume.'
            )}
            option={
              <StyledToggle
                size="md"
                defaultChecked={volumeFade}
                checked={volumeFade}
                disabled={crossfadeDuration === 0}
                onChange={(e: boolean) => handleSetVolumeFade(e)}
              />
            }
          />

          <ConfigOption
            name={t('Playback Presets')}
            description={t("Don't know where to start? Apply a preset and tweak from there.")}
            option={
              <ButtonToolbar>
                <StyledButton
                  onClick={() => {
                    setCrossfadeDuration(0);
                    setPollingInterval(10);
                    handleSetCrossfadeDuration(0);
                    handleSetPollingInterval(10);
                  }}
                >
                  {t('Gapless')}
                </StyledButton>
                <StyledButton
                  onClick={() => {
                    setCrossfadeDuration(7);
                    setPollingInterval(50);
                    setVolumeFade(true);
                    handleSetCrossfadeDuration(7);
                    handleSetPollingInterval(50);
                    handleSetVolumeFade(true);
                  }}
                >
                  {t('Fade')}
                </StyledButton>
              </ButtonToolbar>
            }
          />

          <ConfigOption
            name={t('Audio Device')}
            description={t(
              'The audio device for Sonixd Redux. Leaving this blank will use the system default.'
            )}
            option={
              <StyledInputPickerContainer ref={audioDevicePickerContainerRef}>
                <StyledInputPicker
                  container={() => audioDevicePickerContainerRef.current}
                  data={audioDevices}
                  defaultValue={config.playback.audioDeviceId}
                  value={config.playback.audioDeviceId}
                  labelKey="label"
                  valueKey="deviceId"
                  placement="bottomStart"
                  placeholder={t('Select')}
                  onChange={(e: string) => {
                    dispatch(setAudioDeviceId(e));
                    settings.set('audioDeviceId', e);
                    const label = audioDevices?.find((d) => d.deviceId === e)?.label || '';
                    settings.set('audioDeviceLabel', label);
                  }}
                />
              </StyledInputPickerContainer>
            }
          />
        </ConfigPanel>
      )}
    </>
  );
};

export default PlaybackConfig;
