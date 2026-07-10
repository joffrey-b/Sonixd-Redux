import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ButtonToolbar } from 'rsuite';
import { StyledButton } from '../components/shared/styled';

// Shared across AlbumView/ArtistView/PlaylistView's "Copy to clipboard" buttons —
// the copied URL embeds live, replayable server credentials (plaintext password,
// salted token, or API key depending on server type), so every call site must
// gate the copy behind this warning rather than writing to the clipboard directly.
export const useCopyToClipboardConfirm = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const pendingCopy = useRef<(() => void) | null>(null);

  // Stores the caller's copy logic (fetch + clipboard.writeText) without running it,
  // so cancelling never triggers the download-URL API call in the first place.
  const requestCopyConfirmation = (onConfirm: () => void) => {
    pendingCopy.current = onConfirm;
    setShow(true);
  };

  const handleCancel = () => {
    pendingCopy.current = null;
    setShow(false);
  };

  const handleConfirm = () => {
    pendingCopy.current?.();
    pendingCopy.current = null;
    setShow(false);
  };

  const confirmCopyModal = (
    <Modal
      data-testid="copy-clipboard-confirm-modal"
      open={show}
      onClose={handleCancel}
      size="xs"
      overflow={false}
    >
      <Modal.Header>
        <Modal.Title>{t('Copy download link?')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {t(
            'This link contains your login credentials in plain text. Anyone who has access to this link will be able to access your music server.'
          )}
        </p>
        <p>{t('Do you want to continue?')}</p>
      </Modal.Body>
      <Modal.Footer>
        <ButtonToolbar>
          <StyledButton
            data-testid="copy-clipboard-confirm-copy-anyway"
            appearance="primary"
            onClick={handleConfirm}
          >
            {t('Copy anyway')}
          </StyledButton>
          <StyledButton
            data-testid="copy-clipboard-confirm-cancel"
            appearance="subtle"
            onClick={handleCancel}
          >
            {t('Cancel')}
          </StyledButton>
        </ButtonToolbar>
      </Modal.Footer>
    </Modal>
  );

  return { requestCopyConfirmation, confirmCopyModal };
};
