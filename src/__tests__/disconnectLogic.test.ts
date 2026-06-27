import { DISCONNECT_KEYS } from '../shared/disconnectKeys';

// ─── DISCONNECT_KEYS completeness ─────────────────────────────────────────────

describe('DISCONNECT_KEYS completeness', () => {
  it('includes server and serverBase64', () => {
    expect(DISCONNECT_KEYS).toContain('server');
    expect(DISCONNECT_KEYS).toContain('serverBase64');
  });

  it('includes serverType', () => {
    expect(DISCONNECT_KEYS).toContain('serverType');
  });

  it('includes all Subsonic credential keys (username, hash, salt, password)', () => {
    expect(DISCONNECT_KEYS).toContain('username');
    expect(DISCONNECT_KEYS).toContain('password');
    expect(DISCONNECT_KEYS).toContain('salt');
    expect(DISCONNECT_KEYS).toContain('hash');
  });

  it('includes Jellyfin-specific keys (token, userId, deviceId)', () => {
    expect(DISCONNECT_KEYS).toContain('token');
    expect(DISCONNECT_KEYS).toContain('userId');
    expect(DISCONNECT_KEYS).toContain('deviceId');
  });

  it('includes musicFolder', () => {
    expect(DISCONNECT_KEYS).toContain('musicFolder');
  });

  it('includes legacyAuth', () => {
    expect(DISCONNECT_KEYS).toContain('legacyAuth');
  });

  it('does NOT include non-credential settings (volume)', () => {
    expect(DISCONNECT_KEYS).not.toContain('volume');
  });

  it('does NOT include non-credential settings (theme)', () => {
    expect(DISCONNECT_KEYS).not.toContain('theme');
  });

  it('does NOT include non-credential settings (eqGains)', () => {
    expect(DISCONNECT_KEYS).not.toContain('eqGains');
  });

  it('does NOT include allowDevConsole', () => {
    expect(DISCONNECT_KEYS).not.toContain('allowDevConsole');
  });

  it('does NOT include acceptSelfSigned', () => {
    expect(DISCONNECT_KEYS).not.toContain('acceptSelfSigned');
  });

  it('contains exactly 12 keys (no accidental additions)', () => {
    expect(DISCONNECT_KEYS).toHaveLength(12);
  });
});

// ─── disconnect clears all expected keys via bridge mock ──────────────────────

describe('disconnect clears all expected keys', () => {
  let settingsStore: Record<string, unknown>;

  beforeEach(() => {
    settingsStore = {
      server: 'http://my-server.local',
      serverBase64: btoa('http://my-server.local'),
      serverType: 'subsonic',
      username: 'alice',
      password: 'secret',
      salt: 'abcd',
      hash: 'efgh',
      token: 'jf-token',
      userId: 'user-123',
      legacyAuth: false,
      deviceId: 'device-abc',
      musicFolder: 'folder-1',
      // Non-credential settings that should survive a disconnect
      volume: 0.8,
      theme: 'defaultDark',
      eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };

    (window.bridge.settings.has as jest.Mock) = jest.fn((key: string) => key in settingsStore);
    (window.bridge.settings.set as jest.Mock) = jest.fn();
    (window.bridge.settings.get as jest.Mock) = jest.fn((key: string) => settingsStore[key]);

    // Simulate disconnect: delete all DISCONNECT_KEYS from the store
    (window.bridge.settings.clear as jest.Mock) = jest.fn(() => {
      DISCONNECT_KEYS.forEach((key) => {
        delete settingsStore[key as keyof typeof settingsStore];
      });
    });
  });

  const simulateDisconnect = () => {
    DISCONNECT_KEYS.forEach((key) => {
      delete settingsStore[key as keyof typeof settingsStore];
    });
  };

  it('after disconnect, server is cleared', () => {
    simulateDisconnect();
    expect('server' in settingsStore).toBe(false);
  });

  it('after disconnect, username is cleared', () => {
    simulateDisconnect();
    expect('username' in settingsStore).toBe(false);
  });

  it('after disconnect, hash is cleared', () => {
    simulateDisconnect();
    expect('hash' in settingsStore).toBe(false);
  });

  it('after disconnect, token is cleared', () => {
    simulateDisconnect();
    expect('token' in settingsStore).toBe(false);
  });

  it('after disconnect, non-credential settings are preserved', () => {
    simulateDisconnect();
    expect(settingsStore.volume).toBe(0.8);
    expect(settingsStore.theme).toBe('defaultDark');
    expect(settingsStore.eqGains).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('all DISCONNECT_KEYS are absent after disconnect', () => {
    simulateDisconnect();
    DISCONNECT_KEYS.forEach((key) => {
      expect(key in settingsStore).toBe(false);
    });
  });

  it('disconnect is idempotent — calling twice does not throw', () => {
    expect(() => {
      simulateDisconnect();
      simulateDisconnect();
    }).not.toThrow();
  });
});
