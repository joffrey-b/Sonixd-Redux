import React from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigOptionDescription, ConfigPanel } from '../styled';
import { StyledCheckbox } from '../../shared/styled';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import { setManuallyForced } from '../../../redux/connectivitySlice';

const ConnectivityConfig = ({ bordered }: { bordered?: boolean }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isManuallyForced = useAppSelector((state) => state.connectivity.isManuallyForced);

  return (
    <ConfigPanel bordered={bordered} header={t('Connectivity')}>
      <ConfigOptionDescription>
        {t(
          'While enabled, the app will not attempt to reach your server at all -- useful for saving data on a metered connection. This setting persists across restarts.'
        )}
      </ConfigOptionDescription>
      <br />
      <StyledCheckbox
        data-testid="force-offline-mode-toggle"
        checked={isManuallyForced}
        onChange={(_v: unknown, e: boolean) => {
          dispatch(setManuallyForced(e));
        }}
      >
        {t('Force offline mode')}
      </StyledCheckbox>
    </ConfigPanel>
  );
};

export default ConnectivityConfig;
