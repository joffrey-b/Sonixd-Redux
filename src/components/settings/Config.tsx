import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Whisper, Nav, ButtonToolbar } from 'rsuite';
import { useTranslation } from 'react-i18next';
import GenericPage from '../layout/GenericPage';
import DisconnectButton from './DisconnectButton';
import GenericPageHeader from '../layout/GenericPageHeader';
import { setDefaultSettings, shell } from '../shared/bridge';
import { StyledButton, StyledNavItem } from '../shared/styled';
import PlaybackConfig from './ConfigPanels/PlaybackConfig';
import LookAndFeelConfig from './ConfigPanels/LookAndFeelConfig';
import PlayerConfig from './ConfigPanels/PlayerConfig';
import CacheConfig from './ConfigPanels/CacheConfig';
import WindowConfig from './ConfigPanels/WindowConfig';
import packageJson from '../../package.json';
import ServerConfig from './ConfigPanels/ServerConfig';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { setActive } from '../../redux/configSlice';
import { apiController } from '../../api/controller';
import ExternalConfig from './ConfigPanels/ExternalConfig';
import EQConfig from './ConfigPanels/EQConfig';
import PEQConfig from './ConfigPanels/PEQConfig';
import KeyboardShortcutsConfig from './ConfigPanels/KeyboardShortcutsConfig';
import BackupConfig from './ConfigPanels/BackupConfig';
import Popup from '../shared/Popup';

const GITHUB_RELEASE_URL =
  'https://api.github.com/repos/joffrey-b/Sonixd-Redux/releases?per_page=3';

const Config = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);
  const folder = useAppSelector((state) => state.folder);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const { data: latestRelease } = useQuery({
    queryKey: ['github'],
    queryFn: async () => {
      const releases = await axios.get(GITHUB_RELEASE_URL);
      return releases?.data[0]?.name;
    },
    staleTime: 60 * 60 * 1000, // Only fetch the latest release once per hour
    initialData: packageJson.version,
  });

  useEffect(() => {
    // Check scan status on render
    apiController({ serverType: config.serverType, endpoint: 'getScanStatus' })
      .then((status) => {
        if (status.scanning) {
          return setIsScanning(true);
        }
        setIsScanning(false);
        return setScanProgress(0);
      })
      // eslint-disable-next-line no-console
      .catch((err) => console.error(err));
  }, [config.serverType]);

  useEffect(() => {
    // Reload scan status on interval during scan
    if (isScanning) {
      const interval = setInterval(() => {
        apiController({ serverType: config.serverType, endpoint: 'getScanStatus' })
          .then((status) => {
            if (status.scanning) {
              return setScanProgress(status.count);
            }
            setIsScanning(false);
            return setScanProgress(0);
          })
          // eslint-disable-next-line no-console
          .catch((err) => console.error(err));
      }, 1000);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [config.serverType, isScanning]);

  const isLatestRelease = packageJson.version === latestRelease?.replace(/^v/, '');

  return (
    <GenericPage
      padding="20px"
      hideDivider
      header={
        <GenericPageHeader
          title={t('Configuration')}
          subtitle={
            <>
              <Nav
                activeKey={config.active.tab}
                onSelect={(e) => dispatch(setActive({ ...config.active, tab: e }))}
              >
                <StyledNavItem
                  eventKey="playback"
                  data-testid="settings-playback"
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      dispatch(setActive({ ...config.active, tab: 'playback' }));
                    }
                  }}
                >
                  {t('Playback')}
                </StyledNavItem>
                <StyledNavItem
                  eventKey="equalizer"
                  data-testid="settings-equalizer"
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      dispatch(setActive({ ...config.active, tab: 'equalizer' }));
                    }
                  }}
                >
                  {t('Equalizer')}
                </StyledNavItem>
                <StyledNavItem
                  eventKey="lookandfeel"
                  data-testid="settings-lookandfeel"
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      dispatch(setActive({ ...config.active, tab: 'lookandfeel' }));
                    }
                  }}
                >
                  {t('Look & Feel')}
                </StyledNavItem>
                <StyledNavItem
                  data-testid="settings-shortcuts"
                  eventKey="shortcuts"
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      dispatch(setActive({ ...config.active, tab: 'shortcuts' }));
                    }
                  }}
                >
                  {t('Keyboard Shortcuts')}
                </StyledNavItem>
                <StyledNavItem
                  eventKey="system"
                  data-testid="settings-cache"
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      dispatch(setActive({ ...config.active, tab: 'system' }));
                    }
                  }}
                >
                  {t('System')}
                </StyledNavItem>
                <StyledNavItem
                  eventKey="integrations"
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      dispatch(setActive({ ...config.active, tab: 'integrations' }));
                    }
                  }}
                >
                  {t('Integrations')}
                </StyledNavItem>
              </Nav>
            </>
          }
          sidetitle={<DisconnectButton />}
          subsidetitle={
            <ButtonToolbar>
              <>
                <StyledButton
                  size="sm"
                  onClick={async () => {
                    apiController({
                      serverType: config.serverType,
                      endpoint: 'startScan',
                      args: { musicFolderId: folder.musicFolder },
                    });
                    setIsScanning(true);
                  }}
                  disabled={isScanning}
                >
                  {isScanning ? `${scanProgress}` : t('Scan')}
                </StyledButton>
              </>
              <Whisper
                trigger="click"
                placement="auto"
                speaker={
                  <Popup title={t('Confirm')}>
                    <div>{t('Are you sure you want to reset your settings to default?')}</div>
                    <strong>{t('WARNING: This will reload the application')}</strong>
                    <div>
                      <StyledButton
                        id="reset-submit-button"
                        data-testid="reset-defaults-confirm-button"
                        size="sm"
                        onClick={() => {
                          setDefaultSettings(true);
                          window.location.reload();
                        }}
                        appearance="primary"
                      >
                        {t('Yes')}
                      </StyledButton>
                    </div>
                  </Popup>
                }
              >
                <StyledButton data-testid="reset-defaults-button" size="sm">
                  {t('Reset defaults')}
                </StyledButton>
              </Whisper>
              <Whisper
                trigger="hover"
                placement="bottomEnd"
                enterable
                preventOverflow
                speaker={
                  <Popup>
                    <div style={{ padding: '4px 2px', minWidth: 200 }}>
                      <div style={{ marginBottom: 8, lineHeight: 1.6 }}>
                        <div>
                          {t('Current version:')} {packageJson.version}
                        </div>
                        <div>
                          {t('Latest version:')} {latestRelease}
                        </div>
                        <div>Node: {process.versions.node}</div>
                        <div>Chrome: {process.versions.chrome}</div>
                        <div>Electron: {process.versions.electron}</div>
                      </div>
                      <ButtonToolbar>
                        <StyledButton
                          size="xs"
                          appearance="primary"
                          onClick={() =>
                            shell.openExternal('https://github.com/joffrey-b/Sonixd-Redux')
                          }
                        >
                          {t('View on GitHub')}
                        </StyledButton>
                        <StyledButton
                          size="xs"
                          appearance="primary"
                          onClick={() =>
                            shell.openExternal(
                              'https://github.com/joffrey-b/Sonixd-Redux/blob/main/CHANGELOG.md'
                            )
                          }
                        >
                          {t('View CHANGELOG')}
                        </StyledButton>
                      </ButtonToolbar>
                    </div>
                  </Popup>
                }
              >
                <StyledButton size="sm" appearance={isLatestRelease ? 'default' : 'primary'}>
                  {isLatestRelease ? `v${packageJson.version}` : `${t('Update available')}`}
                </StyledButton>
              </Whisper>
            </ButtonToolbar>
          }
        />
      }
    >
      {config.active.tab === 'playback' && (
        <>
          <PlaybackConfig bordered />
          <PlayerConfig bordered />
        </>
      )}

      {config.active.tab === 'equalizer' && (
        <>
          <EQConfig bordered />
          <PEQConfig bordered />
        </>
      )}

      {config.active.tab === 'lookandfeel' && <LookAndFeelConfig bordered />}

      {config.active.tab === 'shortcuts' && <KeyboardShortcutsConfig bordered />}

      {config.active.tab === 'system' && (
        <>
          <ServerConfig bordered />
          <CacheConfig bordered />
          <WindowConfig bordered />
          <BackupConfig bordered />
        </>
      )}

      {config.active.tab === 'integrations' && <ExternalConfig bordered />}
    </GenericPage>
  );
};

export default Config;
