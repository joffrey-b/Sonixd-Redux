/**
 * Tests the Jellyfin jellyfinApi.ts request interceptor.
 *
 * The interceptor awaits window.bridge.settings.getCredentials() (a single
 * invoke call) on every request rather than several individual settings.get()
 * sendSync calls — verifying credentials are still read fresh per-request, not
 * frozen at module-load time, after that change.
 *
 * Note: the 401 auto-disconnect handler in the response interceptor calls
 * handleDisconnect() which reloads the page — we skip testing that here since
 * it is integration-level behaviour (tested in the DisconnectButton tests).
 */
jest.mock('../components/settings/DisconnectButton', () => ({
  handleDisconnect: jest.fn(),
}));
jest.mock('../i18n/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: 'en' },
  t: (key: string) => key,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { jellyfinApi } from '../api/jellyfinApi';

type RequestConfig = {
  baseURL?: string;
  headers?: Record<string, string>;
  url?: string;
};

const mockAdapter = jest.fn<Promise<unknown>, [RequestConfig]>();

beforeAll(() => {
  jellyfinApi.defaults.adapter = mockAdapter as unknown as typeof jellyfinApi.defaults.adapter;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAdapter.mockImplementation((config) =>
    Promise.resolve({
      status: 200,
      statusText: 'OK',
      data: {},
      headers: {},
      config,
    })
  );

  (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
    .fn()
    .mockResolvedValue({
      server: 'http://jf.default.example.com',
      token: 'default-token',
      username: 'default-user-id',
      deviceId: 'default-device',
    });
});

describe('jellyfinApi.ts — per-request credentials', () => {
  it('reads the base URL from getCredentials() inside the interceptor', async () => {
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
      .fn()
      .mockResolvedValue({
        server: 'http://jf-server-a.example.com',
        token: 'token-a',
        username: 'user-id-a',
        deviceId: 'device-a',
      });

    await jellyfinApi.get('/Users');

    const config = mockAdapter.mock.calls[0][0];
    expect(config.baseURL).toBe('http://jf-server-a.example.com');
  });

  it('reads the token from getCredentials() inside the interceptor', async () => {
    await jellyfinApi.get('/Users');

    const config = mockAdapter.mock.calls[0][0];
    expect(config.headers?.['X-MediaBrowser-Token']).toBe('default-token');
  });

  it('after server switch, next request uses the new server URL', async () => {
    // First request with server A
    await jellyfinApi.get('/Users');
    const config1 = mockAdapter.mock.calls[0][0];
    expect(config1.baseURL).toBe('http://jf.default.example.com');

    // Switch to server B
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
      .fn()
      .mockResolvedValue({
        server: 'http://jf-server-b.example.com',
        token: 'token-b',
        username: 'user-id-b',
        deviceId: 'device-b',
      });

    await jellyfinApi.get('/Users');
    const config2 = mockAdapter.mock.calls[1][0];
    expect(config2.baseURL).toBe('http://jf-server-b.example.com');
  });

  it('does not use a module-level auth variable that captures credentials at import time', async () => {
    // If the token were captured at import time, it would be the value from jestSetup.js
    // (undefined / empty string). Since our mock returns 'default-token', the test verifies
    // the interceptor actually calls getCredentials() at request time.
    await jellyfinApi.get('/Users');

    const config = mockAdapter.mock.calls[0][0];
    // Token should be our per-request mock value, not an empty string from module load time
    expect(config.headers?.['X-MediaBrowser-Token']).toBe('default-token');
  });
});
