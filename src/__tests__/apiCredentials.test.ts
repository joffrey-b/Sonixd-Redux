/**
 * Tests the Subsonic api.ts request interceptor.
 *
 * The interceptor awaits window.bridge.settings.getCredentials() (a single
 * invoke call) on every request rather than several individual settings.get()
 * sendSync calls — this verifies credentials are still read fresh per-request,
 * not frozen at module-load time, after that change.
 */
import { api } from '../api/api';

type RequestConfig = {
  baseURL?: string;
  params?: Record<string, unknown>;
  url?: string;
};

const mockAdapter = jest.fn<Promise<unknown>, [RequestConfig]>();

beforeAll(() => {
  // Replace the axios adapter so no real HTTP calls are made.
  api.defaults.adapter = mockAdapter as unknown as typeof api.defaults.adapter;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAdapter.mockImplementation((config) =>
    Promise.resolve({
      status: 200,
      statusText: 'OK',
      data: { 'subsonic-response': { status: 'ok', version: '1.16.1' } },
      headers: {},
      config,
    })
  );

  // Default credential setup
  (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
    .fn()
    .mockResolvedValue({
      server: 'http://default.example.com',
      username: 'default-user',
      salt: 'salt-default',
      hash: 'hash-default',
      legacyAuth: false,
    });
});

describe('api.ts — per-request credentials', () => {
  it('uses the server URL from getCredentials() at request time, not at import time', async () => {
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
      .fn()
      .mockResolvedValue({
        server: 'http://server-a.example.com',
        username: 'user-a',
        salt: 'salt-a',
        hash: 'hash-a',
        legacyAuth: false,
      });

    await api.get('/ping.view');

    const config = mockAdapter.mock.calls[0][0];
    expect(config.baseURL).toBe('http://server-a.example.com/rest');
  });

  it('uses the username from getCredentials() at request time', async () => {
    await api.get('/test');

    const config = mockAdapter.mock.calls[0][0];
    expect(config.params?.u).toBe('default-user');
  });

  it('uses the hash from getCredentials() at request time', async () => {
    await api.get('/test');

    const config = mockAdapter.mock.calls[0][0];
    expect(config.params?.t).toBe('hash-default');
  });

  it('uses the salt from getCredentials() at request time', async () => {
    await api.get('/test');

    const config = mockAdapter.mock.calls[0][0];
    expect(config.params?.s).toBe('salt-default');
  });

  it('after settings change, next request uses the new credentials', async () => {
    // First request with server A
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
      .fn()
      .mockResolvedValue({
        server: 'http://server-a.example.com',
        username: 'user-a',
        salt: 'salt-a',
        hash: 'hash-a',
        legacyAuth: false,
      });

    await api.get('/test');

    const config1 = mockAdapter.mock.calls[0][0];
    expect(config1.baseURL).toBe('http://server-a.example.com/rest');

    // Switch credentials to server B
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
      .fn()
      .mockResolvedValue({
        server: 'http://server-b.example.com',
        username: 'user-b',
        salt: 'salt-b',
        hash: 'hash-b',
        legacyAuth: false,
      });

    await api.get('/test');

    const config2 = mockAdapter.mock.calls[1][0];
    expect(config2.baseURL).toBe('http://server-b.example.com/rest');
    expect(config2.params?.u).toBe('user-b');
  });

  it('does not reuse stale credentials cached at module load', async () => {
    // Update credentials after module was already imported
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
      .fn()
      .mockResolvedValue({
        server: 'http://fresh-server.example.com',
        username: 'fresh-user',
        salt: 'fresh-salt',
        hash: 'fresh-hash',
        legacyAuth: false,
      });

    await api.get('/test');

    const config = mockAdapter.mock.calls[0][0];
    expect(config.baseURL).toBe('http://fresh-server.example.com/rest');
    expect(config.params?.u).toBe('fresh-user');
  });

  it('builds legacy auth params (u/p, no s/t) when legacyAuth is true', async () => {
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.getCredentials = jest
      .fn()
      .mockResolvedValue({
        server: 'http://legacy.example.com',
        username: 'legacy-user',
        password: 'legacy-pass',
        legacyAuth: true,
      });

    await api.get('/test');

    const config = mockAdapter.mock.calls[0][0];
    expect(config.params?.u).toBe('legacy-user');
    expect(config.params?.p).toBe('legacy-pass');
    expect(config.params?.s).toBeNull();
    expect(config.params?.t).toBeNull();
  });
});

describe('api.ts — axiosRetry', () => {
  it('does NOT retry on 401 responses', async () => {
    mockAdapter.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401, data: {} },
      config: {},
    });

    await expect(api.get('/test')).rejects.toBeDefined();
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 404 responses', async () => {
    mockAdapter.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: {} },
      config: {},
    });

    await expect(api.get('/test')).rejects.toBeDefined();
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 400 responses', async () => {
    mockAdapter.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: {} },
      config: {},
    });

    await expect(api.get('/test')).rejects.toBeDefined();
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 500 responses (HTTP errors are not retried)', async () => {
    // axiosRetry is configured with retryCondition: isNetworkError
    // HTTP errors (any response code) are NOT network errors and will not be retried
    mockAdapter.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
      config: {},
    });

    await expect(api.get('/test')).rejects.toBeDefined();
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });
});
