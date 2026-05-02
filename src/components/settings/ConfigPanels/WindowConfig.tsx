import React from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigOptionDescription, ConfigPanel } from '../styled';
import { StyledToggle } from '../../shared/styled';
import ConfigOption from '../ConfigOption';
import { setPlayer, setWindow } from '../../../redux/configSlice';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import { settings } from '../../shared/setDefaultSettings';

const WindowConfig = ({ bordered }: any) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);

  return (
    <ConfigPanel bordered={bordered} header={t('System')}>
      <ConfigOption
        name={t('System Notifications')}
        description={t('Show a system notification whenever the song changes.')}
        option={
          <StyledToggle
            defaultChecked={config.player.systemNotifications}
            checked={config.player.systemNotifications}
            onChange={(e: boolean) => {
              settings.set('systemNotifications', e);
              dispatch(setPlayer({ systemNotifications: e }));
            }}
          />
        }
      />

      <ConfigOption
        name={t('Allow Developer Console')}
        description={t('Allows pressing F12 to open the developer console.')}
        option={
          <StyledToggle
            defaultChecked={config.window.allowDevConsole}
            checked={config.window.allowDevConsole}
            onChange={(e: boolean) => {
              settings.set('allowDevConsole', e);
              dispatch(setWindow({ allowDevConsole: e }));
            }}
          />
        }
      />

      {process.platform !== 'darwin' && (
        <>
          <ConfigOption
            name={t('Minimize to Tray')}
            description={t('Minimizes to the system tray.')}
            option={
              <StyledToggle
                defaultChecked={config.window.minimizeToTray}
                checked={config.window.minimizeToTray}
                onChange={(e: boolean) => {
                  settings.set('minimizeToTray', e);
                  dispatch(setWindow({ minimizeToTray: e }));
                }}
              />
            }
          />

          <ConfigOption
            name={t('Exit to Tray')}
            description={t('Exits to the system tray.')}
            option={
              <StyledToggle
                defaultChecked={config.window.exitToTray}
                checked={config.window.exitToTray}
                onChange={(e: boolean) => {
                  settings.set('exitToTray', e);
                  dispatch(setWindow({ exitToTray: e }));
                }}
              />
            }
          />

          <ConfigOptionDescription>
            {t(
              'Note: These settings may not function correctly depending on your desktop environment.'
            )}
          </ConfigOptionDescription>
        </>
      )}
    </ConfigPanel>
  );
};

export default WindowConfig;
