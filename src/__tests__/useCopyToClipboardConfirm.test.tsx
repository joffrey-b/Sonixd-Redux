jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { useCopyToClipboardConfirm } from '../hooks/useCopyToClipboardConfirm';

// Stands in for a caller's handleDownload('copy') — real call sites close over
// the download-URL fetch + clipboard.writeText inside this callback, so asserting
// on it directly proves both are (or aren't) reached without duplicating that logic here.
const TestHarness = ({ onConfirm }: { onConfirm: () => void }) => {
  const { requestCopyConfirmation, confirmCopyModal } = useCopyToClipboardConfirm();
  return (
    <>
      <button type="button" onClick={() => requestCopyConfirmation(onConfirm)}>
        Copy to clipboard
      </button>
      {confirmCopyModal}
    </>
  );
};

describe('clipboard copy confirmation', () => {
  it('does not call the copy callback (fetch + clipboard.writeText) until the button is clicked', () => {
    const onConfirm = jest.fn();
    render(<TestHarness onConfirm={onConfirm} />);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the warning dialog with the credential-exposure text when copy is requested', () => {
    render(<TestHarness onConfirm={jest.fn()} />);

    fireEvent.click(screen.getByText('Copy to clipboard'));

    expect(screen.getByText('Copy download link?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This link contains your login credentials in plain text. Anyone who has access to this link will be able to access your music server.'
      )
    ).toBeInTheDocument();
  });

  it('does not call clipboard.writeText (or fetch the download URL) when the user cancels', () => {
    const onConfirm = jest.fn();
    render(<TestHarness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Copy to clipboard'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls clipboard.writeText (via the copy callback) when the user confirms', () => {
    const onConfirm = jest.fn();
    render(<TestHarness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Copy to clipboard'));
    fireEvent.click(screen.getByText('Copy anyway'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not call the copy callback a second time on a later confirmation after cancelling once', () => {
    const onConfirm = jest.fn();
    render(<TestHarness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Copy to clipboard'));
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Copy to clipboard'));
    fireEvent.click(screen.getByText('Copy anyway'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
