import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyledButton } from '../shared/styled';
import { settings } from '../shared/bridge';
import { reloadPage } from '../../shared/navigation';
import { clearCredentialCache } from '../../api/api';

// Only api.ts's cache is cleared directly here — jellyfinApi.ts imports
// handleDisconnect below for its own 401 auto-disconnect, so importing its
// clearCredentialCache back into this file would create a cycle. Not needed
// anyway: reloadPage() below is a full window.location.reload(), which already
// resets every module-level cache (including jellyfinApi.ts's) on its own —
// the explicit clear here is just for the gap between disconnect and reload,
// and jellyfinApi.ts's own 401 handler clears its own cache directly for that.
export const handleDisconnect = async () => {
  await settings.disconnect();
  clearCredentialCache();
  reloadPage();
};

const DisconnectButton = () => {
  const { t } = useTranslation();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    setError('');
    try {
      await settings.disconnect();
      clearCredentialCache();
      reloadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to disconnect'));
      setIsDisconnecting(false);
    }
  };

  return (
    <>
      <StyledButton
        data-testid="disconnect-button"
        onClick={handleClick}
        size="sm"
        disabled={isDisconnecting}
      >
        {t('Disconnect')}
      </StyledButton>
      {error && <p role="alert">{error}</p>}
    </>
  );
};

export default DisconnectButton;
