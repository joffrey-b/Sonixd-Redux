import React from 'react';
import { ipcRenderer } from 'electron';
import { useTranslation } from 'react-i18next';
import { ConfigPanel } from '../styled';
import { StyledButton } from '../../shared/styled';
import ConfigOption from '../ConfigOption';
import { notifyToast } from '../../shared/toast';

const BackupConfig = ({ bordered }: any) => {
  const { t } = useTranslation();

  const handleExport = async () => {
    const result = await ipcRenderer.invoke('export-settings');
    if (result.success) {
      notifyToast('success', t('Settings exported successfully.'));
    }
  };

  const handleImport = async () => {
    const result = await ipcRenderer.invoke('import-settings');
    if (result.success) {
      notifyToast('info', t('Settings imported. Reloading...'));
      setTimeout(() => window.location.reload(), 1000);
    } else if (result.error) {
      notifyToast('error', t('Failed to import settings: invalid file.'));
    }
  };

  return (
    <ConfigPanel bordered={bordered} header={t('Backup & Restore')}>
      <ConfigOption
        name={t('Export settings')}
        description={t(
          'Save your current settings to a JSON file. Server credentials are not included.'
        )}
        option={
          <StyledButton size="sm" onClick={handleExport}>
            {t('Export')}
          </StyledButton>
        }
      />
      <ConfigOption
        name={t('Import settings')}
        description={t(
          'Restore settings from a previously exported file. The app will reload after importing.'
        )}
        option={
          <StyledButton size="sm" onClick={handleImport}>
            {t('Import')}
          </StyledButton>
        }
      />
    </ConfigPanel>
  );
};

export default BackupConfig;
