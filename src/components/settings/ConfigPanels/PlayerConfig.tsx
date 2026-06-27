import React, { useEffect, useRef, useState } from 'react';
import { ipcRenderer, settings, shell } from '../../shared/bridge';
import { Form, Whisper } from 'rsuite';
import { WhisperInstance } from 'rsuite/Whisper';
import { Trans, useTranslation } from 'react-i18next';
import { ConfigOptionDescription, ConfigOptionName, ConfigPanel } from '../styled';
import {
  StyledButton,
  StyledInput,
  StyledInputGroup,
  StyledInputNumber,
  StyledLink,
  StyledPanel,
  StyledToggle,
} from '../../shared/styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import { setPlaybackSetting } from '../../../redux/playQueueSlice';
import ListViewTable from '../../viewtypes/ListViewTable';
import { appendPlaybackFilter, type ColumnList } from '../../../redux/configSlice';
import ConfigOption from '../ConfigOption';
import { Server } from '../../../types';
import { isWindows, isWindows10 } from '../../../shared/utils';
import Popup from '../../shared/Popup';

const PlayerConfig = ({ bordered }: { bordered?: boolean }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const playbackFilterColumns = [
    { id: '#', dataKey: 'index', alignment: 'center', resizable: false, width: 50, label: '#' },
    {
      id: 'Filter',
      dataKey: 'filter',
      alignment: 'left',
      resizable: false,
      flexGrow: 2,
      label: t('Filter'),
    },
    {
      id: 'Enabled',
      dataKey: 'filterEnabled',
      alignment: 'left',
      resizable: false,
      width: 100,
      label: t('Enabled'),
    },
    {
      id: 'Delete',
      dataKey: 'filterDelete',
      alignment: 'left',
      resizable: false,
      width: 100,
      label: t('Delete'),
    },
  ];
  const config = useAppSelector((state) => state.config);
  const playQueue = useAppSelector((state) => state.playQueue);
  const [newFilter, setNewFilter] = useState({ string: '', valid: false });
  const [transcode, setTranscode] = useState(Boolean(settings.get('transcode')));
  const [globalMediaHotkeys, setGlobalMediaHotkeys] = useState(
    Boolean(settings.get('globalMediaHotkeys'))
  );
  const [systemMediaTransportControls, setSystemMediaTransportControls] = useState(
    Boolean(settings.get('systemMediaTransportControls'))
  );
  const [resume, setResume] = useState(Boolean(settings.get('resume')));
  const transcodingRestartWhisper = useRef<WhisperInstance | null>(null);

  useEffect(() => {
    settings.set('playbackFilters', config.playback.filters);
  }, [config.playback.filters]);

  return (
    <ConfigPanel bordered={bordered} header={t('Player')}>
      <ConfigOption
        name={t('Seek Forward')}
        description={t(
          'The number in seconds the player will skip forwards when clicking the seek forward button.'
        )}
        option={
          <StyledInputNumber
            defaultValue={String(settings.get('seekForwardInterval')) || '0'}
            step={0.5}
            min={0}
            max={100}
            width={125}
            onChange={(e: number | string) => {
              settings.set('seekForwardInterval', Number(e));
            }}
          />
        }
      />
      <ConfigOption
        name={t('Seek Backward')}
        description={t(
          'The number in seconds the player will skip backwards when clicking the seek backward button.'
        )}
        option={
          <StyledInputNumber
            defaultValue={String(settings.get('seekBackwardInterval')) || '0'}
            step={0.5}
            min={0}
            max={100}
            width={125}
            onChange={(e: number | string) => {
              settings.set('seekBackwardInterval', Number(e));
            }}
          />
        }
      />
      <ConfigOption
        name={t('Direct Previous Track')}
        description={t(
          'When enabled, the previous button always goes to the previous song. When disabled, it restarts the current song if you are more than 5 seconds in.'
        )}
        option={
          <StyledToggle
            data-testid="direct-previous-track-toggle"
            size="md"
            checked={playQueue.directPreviousTrack}
            onChange={(e: boolean) => {
              settings.set('directPreviousTrack', e);
              dispatch(setPlaybackSetting({ setting: 'directPreviousTrack', value: e }));
            }}
          />
        }
      />
      <ConfigOption
        name={t('Preserve Play Next Order')}
        description={t(
          'When enabled, songs added via "Play Next" are queued in the order they were added. When disabled, each "Play Next" inserts at the top of the queue.'
        )}
        option={
          <StyledToggle
            data-testid="preserve-play-next-order-toggle"
            size="md"
            checked={playQueue.preservePlayNextOrder}
            onChange={(e: boolean) => {
              settings.set('preservePlayNextOrder', e);
              dispatch(setPlaybackSetting({ setting: 'preservePlayNextOrder', value: e }));
            }}
          />
        }
      />
      <ConfigOption
        name={t('Persist queue across sessions')}
        description={t(
          'Saves your entire play queue and restores it on next launch, including your position in the queue.'
        )}
        option={
          <StyledToggle
            checked={resume}
            onChange={(e: boolean) => {
              settings.set('resume', e);
              setResume(e);
            }}
          />
        }
      />
      {config.serverType === Server.Jellyfin && (
        <ConfigOption
          name={t('Allow Transcoding')}
          description={t(
            'If your audio files are not playing properly or are not in a supported web streaming format, you will need to enable this (requires app restart).'
          )}
          option={
            <>
              <Whisper
                ref={transcodingRestartWhisper}
                trigger="none"
                placement="auto"
                speaker={
                  <Popup title={t('Restart?')}>
                    <div>{t('Do you want to restart the application now?')}</div>
                    <strong>{t('This is highly recommended!')}</strong>
                    <div>
                      <StyledButton
                        id="titlebar-restart-button"
                        size="sm"
                        onClick={() => {
                          ipcRenderer.send('reload');
                        }}
                        appearance="primary"
                      >
                        {t('Yes')}
                      </StyledButton>
                    </div>
                  </Popup>
                }
              >
                <StyledToggle
                  checked={transcode}
                  onChange={(e: boolean) => {
                    settings.set('transcode', e);
                    setTranscode(e);
                    transcodingRestartWhisper.current?.open();
                  }}
                />
              </Whisper>
            </>
          }
        />
      )}

      <ConfigOption
        name={t('Global Media Hotkeys')}
        description={
          <Trans>
            Enable or disable global media hotkeys (play/pause, next, previous, stop, etc). For
            macOS, you will need to add Sonixd Redux as a{' '}
            <StyledLink
              onClick={() =>
                shell.openExternal(
                  'https://developer.apple.com/library/archive/documentation/Accessibility/Conceptual/AccessibilityMacOSX/OSXAXTestingApps.html'
                )
              }
            >
              trusted accessibility client.
            </StyledLink>{' '}
            If you plan to bind media keys in the Keyboard Shortcuts tab, it is advised to disable
            this option to avoid conflicts.
          </Trans>
        }
        option={
          <StyledToggle
            checked={globalMediaHotkeys}
            onChange={(e: boolean) => {
              settings.set('globalMediaHotkeys', e);
              setGlobalMediaHotkeys(e);
              if (e) {
                ipcRenderer.send('enableGlobalHotkeys');

                settings.set('systemMediaTransportControls', !e);
                setSystemMediaTransportControls(!e);
              } else {
                ipcRenderer.send('disableGlobalHotkeys');
              }
            }}
          />
        }
      />

      {isWindows() && isWindows10() && (
        <ConfigOption
          name={t('Windows System Media Transport Controls')}
          description={
            <>
              {t(
                'Enable or disable the Windows System Media Transport Controls (play/pause, next, previous, stop). This will show the Windows Media Popup (Windows 10 only) when pressing a media key. This feauture will override the Global Media Hotkeys option. If you plan to bind media keys in the Keyboard Shortcuts tab, it is advised to disable this option to avoid conflicts.'
              )}
            </>
          }
          option={
            <StyledToggle
              checked={systemMediaTransportControls}
              onChange={(e: boolean) => {
                settings.set('systemMediaTransportControls', e);
                setSystemMediaTransportControls(e);
                if (e) {
                  settings.set('globalMediaHotkeys', !e);
                  setGlobalMediaHotkeys(!e);
                  ipcRenderer.send('disableGlobalHotkeys');
                }
              }}
            />
          }
        />
      )}

      <ConfigOption
        name={t('Scrobble')}
        description={t(
          'Send player updates to your server. This is required by servers such as Jellyfin and Navidrome to track play counts and use external services such as Last.fm.'
        )}
        option={
          <StyledToggle
            checked={playQueue.scrobble}
            onChange={(e: boolean) => {
              settings.set('scrobble', e);
              dispatch(setPlaybackSetting({ setting: 'scrobble', value: e }));
            }}
          />
        }
      />
      <ConfigOption
        name={t('Scrobble Threshold')}
        description={t(
          'Percentage of a track that must be played before it is scrobbled. A track is also scrobbled after 4 minutes regardless of this setting.'
        )}
        option={
          <StyledInputNumber
            data-testid="scrobble-threshold-input"
            defaultValue={String(settings.get('scrobbleThreshold') ?? 90)}
            step={5}
            min={1}
            max={100}
            width={125}
            disabled={!playQueue.scrobble}
            onChange={(e: number | string) => {
              const val = Math.min(100, Math.max(1, Number(e)));
              settings.set('scrobbleThreshold', val);
              dispatch(setPlaybackSetting({ setting: 'scrobbleThreshold', value: val }));
            }}
          />
        }
      />
      <ConfigOptionName>{t('Track Filters')}</ConfigOptionName>
      <ConfigOptionDescription>
        {t(
          'Filter out tracks based on regex string(s) by their title when adding to the queue. Adding by double-clicking a track will ignore all filters for that one track.'
        )}
      </ConfigOptionDescription>
      <br />
      <StyledPanel bodyFill>
        <Form fluid>
          <StyledInputGroup>
            <StyledInput
              style={{ width: 'auto' }}
              value={newFilter.string}
              onChange={(e: string) => {
                let isValid = true;
                try {
                  new RegExp(e);
                } catch {
                  isValid = false;
                }

                setNewFilter({ string: e, valid: isValid });
              }}
              placeholder={t('Enter regex string')}
            />
            <StyledButton
              type="submit"
              disabled={newFilter.string === '' || newFilter.valid === false}
              onClick={() => {
                dispatch(appendPlaybackFilter({ filter: newFilter.string, enabled: true }));
                settings.set(
                  'playbackFilters',
                  config.playback.filters.concat({
                    filter: newFilter.string,
                    enabled: true,
                  })
                );
                setNewFilter({ string: '', valid: false });
              }}
            >
              {t('Add')}
            </StyledButton>
          </StyledInputGroup>
        </Form>

        <ListViewTable
          data={config.playback.filters || []}
          autoHeight
          columns={playbackFilterColumns}
          rowHeight={35}
          fontSize={12}
          listType={'column' as ColumnList}
          cacheImages={{ enabled: false }}
          isModal={false}
          miniView={false}
          disableContextMenu
          disableRowClick
          handleRowClick={() => {}}
          handleRowDoubleClick={() => {}}
          handleFavorite={() => {}}
          handleRating={() => {}}
        />
      </StyledPanel>
    </ConfigPanel>
  );
};

export default PlayerConfig;
