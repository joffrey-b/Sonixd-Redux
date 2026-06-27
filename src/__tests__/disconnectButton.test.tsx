jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
jest.mock('../shared/navigation', () => ({
  reloadPage: jest.fn(),
}));

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DisconnectButton from '../components/settings/DisconnectButton';
import { reloadPage } from '../shared/navigation';

const mockDisconnect = jest.fn();
const mockReloadPage = reloadPage as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockDisconnect.mockResolvedValue(true);
  (window as unknown as { bridge: Window['bridge'] }).bridge.settings.disconnect = mockDisconnect;
});

describe('DisconnectButton', () => {
  it('calls bridge.settings.disconnect() when clicked', async () => {
    render(<DisconnectButton />);

    await act(async () => {
      fireEvent.click(screen.getByText('Disconnect'));
    });

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledTimes(1));
  });

  it('calls mockReloadPage() after disconnect resolves', async () => {
    render(<DisconnectButton />);

    await act(async () => {
      fireEvent.click(screen.getByText('Disconnect'));
    });

    await waitFor(() => expect(mockReloadPage).toHaveBeenCalledTimes(1));
  });

  it('does NOT reload if disconnect() rejects', async () => {
    mockDisconnect.mockRejectedValue(new Error('IPC failure'));
    render(<DisconnectButton />);

    await act(async () => {
      fireEvent.click(screen.getByText('Disconnect'));
    });

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalled());
    expect(mockReloadPage).not.toHaveBeenCalled();
  });

  it('shows an error state if disconnect() rejects', async () => {
    mockDisconnect.mockRejectedValue(new Error('Connection lost'));
    render(<DisconnectButton />);

    await act(async () => {
      fireEvent.click(screen.getByText('Disconnect'));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
  });

  it('disables the button while disconnect is in progress', async () => {
    let resolveDisconnect!: (value: boolean) => void;
    mockDisconnect.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveDisconnect = resolve;
      })
    );

    render(<DisconnectButton />);

    fireEvent.click(screen.getByText('Disconnect'));

    const btn = screen.getByText('Disconnect').closest('button');
    expect(btn).toBeDisabled();

    await act(async () => {
      resolveDisconnect(true);
    });
    await waitFor(() => expect(mockReloadPage).toHaveBeenCalled());
  });

  it('calls disconnect exactly once even if clicked rapidly', async () => {
    let resolveDisconnect!: (value: boolean) => void;
    mockDisconnect.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveDisconnect = resolve;
      })
    );

    render(<DisconnectButton />);

    fireEvent.click(screen.getByText('Disconnect'));
    fireEvent.click(screen.getByText('Disconnect'));
    fireEvent.click(screen.getByText('Disconnect'));

    await act(async () => {
      resolveDisconnect(true);
    });
    await waitFor(() => expect(mockReloadPage).toHaveBeenCalled());

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
