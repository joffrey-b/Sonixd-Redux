import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ConfigOptionDescription, ConfigPanel } from '../styled';
import { StyledButton, StyledInputGroup, StyledInput } from '../../shared/styled';
import { settings } from '../../shared/bridge';
import {
  selectDownloadFolder,
  clearDownloadPath,
  clearDownloadPathCache,
} from '../../../shared/downloadPath';
import { notifyToast } from '../../shared/toast';

// ADR Section 8.1: the user-chosen download folder setting. Configured via
// the real dialog.showOpenDialog folder picker (select-download-folder,
// Fix 1) -- the non-mocked counterpart to the e2e suite's existing
// mockOpenDialog fixture, reused here rather than a manual text-entry field
// like CacheConfig's own cachePath editor (a deliberately different, more
// modern pattern for this newer setting, per the ADR's own explicit design
// decision).
const DownloadConfig = ({ bordered }: { bordered?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [downloadPath, setDownloadPathState] = useState(String(settings.get('downloadPath') || ''));

  const handleChooseFolder = async () => {
    // Audit fix: select-download-folder now persists the setting itself,
    // directly in the main process, from the real dialog result -- this no
    // longer writes it back via settings.set (downloadPath is on
    // SETTINGS_DENY_LIST). Still need to invalidate the in-memory cache so
    // the rest of the renderer picks up the new value.
    const path = await selectDownloadFolder();
    if (!path) return;
    clearDownloadPathCache();
    setDownloadPathState(path);
    notifyToast('success', t('Download folder set to {{path}}', { path }));
  };

  const handleClear = async () => {
    await clearDownloadPath();
    setDownloadPathState('');
  };

  return (
    <ConfigPanel bordered={bordered} header={t('Downloads')}>
      <ConfigOptionDescription>
        {t(
          'Choose a folder for explicitly downloaded songs (separate from the opportunistic song cache). Required before the Download buttons on Album/Artist/Playlist pages will work.'
        )}
      </ConfigOptionDescription>
      <br />
      <StyledInputGroup>
        <StyledInput
          data-testid="download-path-display"
          value={downloadPath || t('Not configured')}
          readOnly
        />
        <StyledButton data-testid="download-path-choose-folder" onClick={handleChooseFolder}>
          {t('Choose folder...')}
        </StyledButton>
        {downloadPath && (
          <StyledButton data-testid="download-path-clear" onClick={handleClear}>
            {t('Clear')}
          </StyledButton>
        )}
      </StyledInputGroup>
      <br />
      <StyledButton data-testid="downloads-view-overview" onClick={() => navigate('/downloads')}>
        {t('View downloads')}
      </StyledButton>
    </ConfigPanel>
  );
};

export default DownloadConfig;
