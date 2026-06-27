jest.mock('axios');
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
jest.mock('../shared/mockSettings', () => ({
  mockSettings: { legacyAuth: false },
}));
jest.mock('../shared/navigation', () => ({
  reloadPage: jest.fn(),
}));
// api.ts/jellyfinApi.ts call axios.create() at module top level, which the
// jest.mock('axios') auto-mock above resolves to undefined — not relevant to
// what this file tests, so stub out just the export Login.tsx needs.
jest.mock('../api/api', () => ({
  clearCredentialCache: jest.fn(),
}));
jest.mock('../api/jellyfinApi', () => ({
  clearCredentialCache: jest.fn(),
}));

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import Login from '../components/settings/Login';
import { reloadPage } from '../shared/navigation';

const mockAxios = axios as jest.Mocked<typeof axios>;

const mockSetCredentials = jest.fn();
const mockSettingsGet = jest.fn();
const mockReloadPage = reloadPage as jest.Mock;

function setupBridge(setCredentialsResult: boolean | Promise<boolean> = true) {
  (window as unknown as { bridge: Window['bridge'] }).bridge = {
    settings: {
      get: mockSettingsGet,
      set: jest.fn(),
      has: jest.fn().mockReturnValue(false),
      clear: jest.fn(),
      getStore: jest.fn().mockReturnValue({}),
      getPath: jest.fn().mockReturnValue(''),
      getDefaultCachePath: jest.fn().mockReturnValue(''),
      setCredentials: mockSetCredentials.mockResolvedValue(setCredentialsResult),
      disconnect: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
      getCredentials: jest.fn().mockResolvedValue({}),
    },
    osRelease: '',
    setDefaultSettings: jest.fn(),
    nowPlaying: { write: jest.fn() },
    cache: {
      exists: jest.fn().mockResolvedValue(false),
      removeIfExists: jest.fn().mockResolvedValue(undefined),
      commitDownload: jest.fn().mockResolvedValue(undefined),
    },
    queue: {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
    },
    cacheDir: {
      ensure: jest.fn(),
      getSize: jest.fn().mockResolvedValue(0),
      list: jest.fn().mockResolvedValue([]),
      removeFiles: jest.fn().mockResolvedValue(undefined),
      evictIfNeeded: jest.fn().mockResolvedValue(undefined),
    },
    recovery: {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    libraryCache: { get: jest.fn().mockReturnValue(undefined), set: jest.fn() },
    ipcRenderer: {
      send: jest.fn(),
      invoke: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
    },
    shell: { openExternal: jest.fn(), openPath: jest.fn() },
    clipboard: { writeText: jest.fn() },
    webFrame: { setZoomFactor: jest.fn() },
  };
}

const PING_OK = {
  data: {
    'subsonic-response': { status: 'ok', version: '1.16.1' },
  },
};

const PING_FAILED = {
  data: {
    'subsonic-response': {
      status: 'failed',
      error: { code: 40, message: 'Wrong username or password' },
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSettingsGet.mockReturnValue(undefined);
  setupBridge(true);
  mockAxios.get = jest.fn().mockResolvedValue(PING_OK);
  mockAxios.post = jest.fn();
});

function fillSubsonic(server = 'http://music.example.com', username = 'user', password = 'pass') {
  const serverInput = screen.getByPlaceholderText('Requires http(s)://');
  const userInput = screen.getByPlaceholderText('Enter username');
  const passInput = screen.getByPlaceholderText('Enter password');
  fireEvent.change(serverInput, { target: { value: server } });
  fireEvent.change(userInput, { target: { value: username } });
  fireEvent.change(passInput, { target: { value: password } });
}

describe('Login — Subsonic standard auth', () => {
  it('calls setCredentials with server, username, hash, salt on successful ping', async () => {
    render(<Login />);
    fillSubsonic();

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(mockSetCredentials).toHaveBeenCalledTimes(1));

    const payload = mockSetCredentials.mock.calls[0][0];
    expect(payload.server).toBe('http://music.example.com');
    expect(payload.username).toBe('user');
    expect(typeof payload.hash).toBe('string');
    expect(payload.hash.length).toBeGreaterThan(0);
    expect(typeof payload.salt).toBe('string');
    expect(payload.salt.length).toBeGreaterThan(0);
    expect(payload.serverType).toBe('subsonic');
  });

  it('does NOT include password in the setCredentials payload when legacyAuth is false', async () => {
    render(<Login />);
    fillSubsonic();

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(mockSetCredentials).toHaveBeenCalledTimes(1));

    const payload = mockSetCredentials.mock.calls[0][0];
    expect(payload.password).toBeUndefined();
  });

  it('calls window.location.reload() after successful setCredentials', async () => {
    render(<Login />);
    fillSubsonic();

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(mockReloadPage).toHaveBeenCalledTimes(1));
  });

  it('does NOT call reload() when setCredentials returns false', async () => {
    setupBridge(false);
    render(<Login />);
    fillSubsonic();

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(mockSetCredentials).toHaveBeenCalled());
    expect(mockReloadPage).not.toHaveBeenCalled();
  });

  it('shows an error message when setCredentials returns false', async () => {
    setupBridge(false);
    render(<Login />);
    fillSubsonic();

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() =>
      expect(screen.getByText('Failed to save credentials. Please try again.')).toBeInTheDocument()
    );
  });

  it('shows the bridge error message when window.bridge is undefined', async () => {
    // Remove bridge to simulate missing preload
    (window as unknown as { bridge: Window['bridge'] | undefined }).bridge = undefined;

    render(<Login />);
    fillSubsonic();

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() =>
      expect(
        screen.getByText('Application bridge not available. Please reinstall the app.')
      ).toBeInTheDocument()
    );
  });

  it('shows a server error when the ping returns a non-2xx response (subsonic failed status)', async () => {
    mockAxios.get = jest.fn().mockResolvedValue(PING_FAILED);
    render(<Login />);
    fillSubsonic();

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(screen.getByText('Wrong username or password')).toBeInTheDocument());
    expect(mockSetCredentials).not.toHaveBeenCalled();
  });

  it('shows a network error when the ping request throws', async () => {
    mockAxios.get = jest.fn().mockRejectedValue(new Error('Network Error'));
    render(<Login />);
    fillSubsonic();

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(screen.getByText('Network Error')).toBeInTheDocument());
    expect(mockSetCredentials).not.toHaveBeenCalled();
  });
});

describe('Login — Subsonic legacy auth', () => {
  it('calls setCredentials WITH password when legacyAuth checkbox is checked', async () => {
    render(<Login />);
    fillSubsonic('http://music.example.com', 'user', 'my-pass');

    // Click the legacy auth checkbox
    const legacyCheckbox = screen.getByText('Legacy auth (plaintext)');
    fireEvent.click(legacyCheckbox);

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(mockSetCredentials).toHaveBeenCalledTimes(1));

    const payload = mockSetCredentials.mock.calls[0][0];
    expect(payload.password).toBeDefined();
  });

  it('password in setCredentials payload matches what was entered', async () => {
    render(<Login />);
    fillSubsonic('http://music.example.com', 'user', 'super-secret-123');

    const legacyCheckbox = screen.getByText('Legacy auth (plaintext)');
    fireEvent.click(legacyCheckbox);

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(mockSetCredentials).toHaveBeenCalledTimes(1));

    const payload = mockSetCredentials.mock.calls[0][0];
    expect(payload.password).toBe('super-secret-123');
  });
});

describe('Login — Jellyfin', () => {
  const JELLYFIN_RESPONSE = {
    data: {
      AccessToken: 'jf-token-xyz',
      User: { Id: 'jf-user-id-abc', Name: 'user' },
    },
  };

  beforeEach(() => {
    mockAxios.post = jest.fn().mockResolvedValue(JELLYFIN_RESPONSE);
  });

  function switchToJellyfin() {
    const jellyfinRadio = screen.getByText('Jellyfin');
    fireEvent.click(jellyfinRadio);
  }

  it('calls setCredentials with token and userId on successful Jellyfin auth', async () => {
    render(<Login />);
    switchToJellyfin();
    fillSubsonic('https://jf.example.com', 'user', 'pass');

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(mockSetCredentials).toHaveBeenCalledTimes(1));

    const payload = mockSetCredentials.mock.calls[0][0];
    expect(payload.token).toBe('jf-token-xyz');
    expect(payload.username).toBe('jf-user-id-abc');
    expect(payload.serverType).toBe('jellyfin');
  });

  it('does NOT include password in the Jellyfin setCredentials payload', async () => {
    render(<Login />);
    switchToJellyfin();
    fillSubsonic('https://jf.example.com', 'user', 'pass');

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() => expect(mockSetCredentials).toHaveBeenCalledTimes(1));

    const payload = mockSetCredentials.mock.calls[0][0];
    expect(payload.password).toBeUndefined();
  });

  it('shows an error when Jellyfin auth returns 401', async () => {
    mockAxios.post = jest.fn().mockRejectedValue(new Error('Request failed with status code 401'));
    render(<Login />);
    switchToJellyfin();
    fillSubsonic('https://jf.example.com', 'user', 'wrong-pass');

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    await waitFor(() =>
      expect(screen.getByText('Request failed with status code 401')).toBeInTheDocument()
    );
    expect(mockSetCredentials).not.toHaveBeenCalled();
  });
});

describe('Login — acceptSelfSigned', () => {
  it('calls settings.set("acceptSelfSigned", true) when checkbox is checked', async () => {
    const mockSet = jest.fn();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.set = mockSet;

    render(<Login />);

    const selfSignedCheckbox = screen.getByText('Accept self-signed certificates');
    fireEvent.click(selfSignedCheckbox);

    expect(mockSet).toHaveBeenCalledWith('acceptSelfSigned', true);
  });

  it('acceptSelfSigned value persists to next render (read via settings.get)', () => {
    mockSettingsGet.mockImplementation((key: string) => {
      if (key === 'acceptSelfSigned') return true;
      return undefined;
    });

    render(<Login />);

    // If acceptSelfSigned is true, the warning message should appear on render
    expect(
      screen.getByText(/self-signed certificates lack any type of external validation/i)
    ).toBeInTheDocument();
  });
});
