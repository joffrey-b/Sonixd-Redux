import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { ConfigPanel } from '../styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import { setHotkey, setPlayer } from '../../../redux/configSlice';
import { StyledToggle } from '../../shared/styled';
import ConfigOption from '../ConfigOption';
import { settings } from '../../shared/setDefaultSettings';

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 12px;
  opacity: 0.5;
  font-weight: normal;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const Td = styled.td`
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
`;

const CancelButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  font-size: 1em;
  padding: 0 4px;
  margin-left: 4px;
  line-height: 1;
  vertical-align: middle;
  &:hover {
    color: rgba(255, 255, 255, 0.9);
  }
`;

const KeyBadge = styled.span<{ $listening: boolean; $conflict: boolean }>`
  display: inline-block;
  padding: 3px 10px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.88em;
  background: ${(p) =>
    p.$conflict
      ? 'rgba(220,53,69,0.25)'
      : p.$listening
      ? 'rgba(33,150,243,0.3)'
      : 'rgba(255,255,255,0.08)'};
  border: 1px solid
    ${(p) =>
      p.$conflict
        ? 'rgba(220,53,69,0.7)'
        : p.$listening
        ? 'rgba(33,150,243,0.7)'
        : 'rgba(255,255,255,0.15)'};
  cursor: pointer;
  min-width: 140px;
  text-align: center;
  user-select: none;
`;

const SETTING_KEY_MAP: Record<string, string> = {
  navigateBack: 'hotkeyNavigateBack',
  search: 'hotkeySearch',
  selectAll: 'hotkeySelectAll',
  removeSelected: 'hotkeyRemoveSelected',
  playPause: 'hotkeyPlayPause',
  nextTrack: 'hotkeyNextTrack',
  prevTrack: 'hotkeyPrevTrack',
  volumeUp: 'hotkeyVolumeUp',
  volumeDown: 'hotkeyVolumeDown',
  mute: 'hotkeyMute',
};

function formatKey(key: string): string {
  return key
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return 'Ctrl';
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Shift';
      if (part === 'meta') return 'Meta';
      if (part === 'del') return 'Delete';
      if (part === 'backspace') return 'Backspace';
      if (part === 'left') return '←';
      if (part === 'right') return '→';
      if (part === 'up') return '↑';
      if (part === 'down') return '↓';
      if (part === 'space') return 'Space';
      if (part === 'esc' || part === 'escape') return 'Esc';
      return part.toUpperCase();
    })
    .join(' + ');
}

function captureKey(e: React.KeyboardEvent): string | null {
  e.preventDefault();
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (e.metaKey) parts.push('meta');
  const key = e.key.toLowerCase();
  if (['control', 'alt', 'shift', 'meta'].includes(key)) return null;
  if (key === 'escape') return null; // escape cancels
  parts.push(
    key === ' '
      ? 'space'
      : key === 'delete'
      ? 'del'
      : key === 'arrowleft'
      ? 'left'
      : key === 'arrowright'
      ? 'right'
      : key === 'arrowup'
      ? 'up'
      : key === 'arrowdown'
      ? 'down'
      : key
  );
  return parts.join('+');
}

const KeyboardShortcutsConfig = ({ bordered }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const hotkeys = useAppSelector((state) => state.config.hotkeys);
  const globalShortcuts = useAppSelector((state) => state.config.player.globalShortcuts);
  const [listening, setListening] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const save = (action: string, key: string) => {
    dispatch(setHotkey({ action: action as any, key }));
    settings.set(SETTING_KEY_MAP[action], key);
    setListening(null);
    setConflict(null);
  };

  const ROWS: Array<{ action: string; label: string }> = [
    { action: 'playPause', label: t('Play / Pause') },
    { action: 'nextTrack', label: t('Next Track') },
    { action: 'prevTrack', label: t('Previous Track') },
    { action: 'volumeUp', label: t('Volume Up') },
    { action: 'volumeDown', label: t('Volume Down') },
    { action: 'mute', label: t('Toggle Mute') },
    { action: 'navigateBack', label: t('Navigate Back') },
    { action: 'search', label: t('Open Search') },
    { action: 'selectAll', label: t('Select All') },
    { action: 'removeSelected', label: t('Remove Selected') },
  ];

  return (
    <ConfigPanel bordered={bordered} header={t('Keyboard Shortcuts')}>
      <ConfigOption
        name={t('Global shortcuts')}
        description={t(
          'When enabled, the 6 playback shortcuts (play/pause, next, previous, volume, mute) work even when the app is not focused. Note: these shortcuts are captured at the OS level and will override the same key combinations in other apps.'
        )}
        option={
          <StyledToggle
            defaultChecked={globalShortcuts}
            checked={globalShortcuts}
            onChange={(e: boolean) => {
              settings.set('globalShortcuts', e);
              dispatch(setPlayer({ globalShortcuts: e }));
            }}
          />
        }
      />
      <p style={{ opacity: 0.55, fontSize: '0.85em', margin: '16px 0 12px' }}>
        {t(
          'Click a shortcut to change it, then press the new key combination. Press Escape to cancel.'
        )}
      </p>
      <Table>
        <thead>
          <tr>
            <Th>{t('Action')}</Th>
            <Th>{t('Shortcut')}</Th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ action, label }) => {
            const isListening = listening === action;
            const currentKey = hotkeys[action as keyof typeof hotkeys];
            return (
              <tr key={action}>
                <Td>{label}</Td>
                <Td>
                  <KeyBadge
                    $listening={isListening}
                    $conflict={isListening && conflict !== null}
                    tabIndex={0}
                    onClick={() => {
                      if (!isListening) {
                        setListening(action);
                        setConflict(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (!isListening) {
                        if (e.key === 'Enter' || e.key === ' ') setListening(action);
                        return;
                      }
                      e.nativeEvent.stopPropagation();
                      if (e.key === 'Escape') {
                        setListening(null);
                        setConflict(null);
                        return;
                      }
                      const captured = captureKey(e);
                      if (captured) {
                        const takenBy = ROWS.find(
                          (r) =>
                            r.action !== action &&
                            hotkeys[r.action as keyof typeof hotkeys] === captured
                        );
                        if (takenBy) {
                          setConflict(takenBy.label);
                        } else {
                          setConflict(null);
                          save(action, captured);
                        }
                      }
                    }}
                  >
                    {isListening && conflict
                      ? t('Used by: {{label}}', { label: conflict })
                      : isListening
                      ? t('Press a key...')
                      : formatKey(currentKey)}
                  </KeyBadge>
                  {isListening && (
                    <CancelButton
                      tabIndex={0}
                      onClick={() => {
                        setListening(null);
                        setConflict(null);
                      }}
                    >
                      &#x2715;
                    </CancelButton>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </ConfigPanel>
  );
};

export default KeyboardShortcutsConfig;
