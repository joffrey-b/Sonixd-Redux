import { validateCredentials, shouldStorePassword } from '../shared/credentialValidation';
import type { CredentialPayload } from '../shared/credentialValidation';

const MINIMAL_SUBSONIC: CredentialPayload = {
  server: 'http://example.com',
  serverBase64: 'aHR0cDovL2V4YW1wbGUuY29t',
  serverType: 'subsonic',
  username: 'admin',
};

describe('validateCredentials', () => {
  it('accepts a minimal valid Subsonic payload', () => {
    const result = validateCredentials(MINIMAL_SUBSONIC);
    expect(result).not.toBeNull();
    expect(result?.server).toBe('http://example.com');
    expect(result?.username).toBe('admin');
  });

  it('accepts a full Subsonic payload with hash, salt, legacyAuth', () => {
    const result = validateCredentials({
      server: 'https://music.example.com',
      serverBase64: 'aHR0cHM6Ly9tdXNpYy5leGFtcGxlLmNvbQ==',
      serverType: 'subsonic',
      username: 'user1',
      hash: 'abc123',
      salt: 'xyz789',
      legacyAuth: false,
    });
    expect(result).not.toBeNull();
    expect(result?.hash).toBe('abc123');
    expect(result?.salt).toBe('xyz789');
    expect(result?.legacyAuth).toBe(false);
  });

  it('accepts a Jellyfin payload with token and userId', () => {
    const result = validateCredentials({
      server: 'https://jellyfin.example.com',
      serverBase64: 'aHR0cHM6Ly9qZWxseWZpbi5leGFtcGxlLmNvbQ==',
      serverType: 'jellyfin',
      username: 'user-id-from-server',
      token: 'my-access-token',
      userId: 'my-user-id',
      deviceId: 'abc123',
    });
    expect(result).not.toBeNull();
    expect(result?.token).toBe('my-access-token');
    expect(result?.userId).toBe('my-user-id');
    expect(result?.deviceId).toBe('abc123');
  });

  it('returns null when payload is not an object', () => {
    expect(validateCredentials('string')).toBeNull();
    expect(validateCredentials(42)).toBeNull();
    expect(validateCredentials(true)).toBeNull();
  });

  it('returns null when payload is null', () => {
    expect(validateCredentials(null)).toBeNull();
  });

  it('returns null when payload is an array', () => {
    expect(validateCredentials([])).toBeNull();
    expect(validateCredentials([MINIMAL_SUBSONIC])).toBeNull();
  });

  it('returns null when server is missing', () => {
    expect(
      validateCredentials({
        serverBase64: MINIMAL_SUBSONIC.serverBase64,
        serverType: MINIMAL_SUBSONIC.serverType,
        username: MINIMAL_SUBSONIC.username,
      })
    ).toBeNull();
  });

  it('returns null when server is empty string', () => {
    expect(validateCredentials({ ...MINIMAL_SUBSONIC, server: '' })).toBeNull();
  });

  it('returns null when username is missing', () => {
    expect(
      validateCredentials({
        server: MINIMAL_SUBSONIC.server,
        serverBase64: MINIMAL_SUBSONIC.serverBase64,
        serverType: MINIMAL_SUBSONIC.serverType,
      })
    ).toBeNull();
  });

  it('returns null when username is empty string', () => {
    expect(validateCredentials({ ...MINIMAL_SUBSONIC, username: '' })).toBeNull();
  });

  it('returns null when server is not a valid URL', () => {
    expect(validateCredentials({ ...MINIMAL_SUBSONIC, server: 'not-a-url' })).toBeNull();
    expect(validateCredentials({ ...MINIMAL_SUBSONIC, server: 'example.com' })).toBeNull();
    expect(validateCredentials({ ...MINIMAL_SUBSONIC, server: '   ' })).toBeNull();
  });

  it('accepts http:// server URLs', () => {
    const result = validateCredentials({
      ...MINIMAL_SUBSONIC,
      server: 'http://my-server.local:8080',
    });
    expect(result).not.toBeNull();
    expect(result?.server).toBe('http://my-server.local:8080');
  });

  it('accepts https:// server URLs', () => {
    const result = validateCredentials({
      ...MINIMAL_SUBSONIC,
      server: 'https://secure.example.com',
    });
    expect(result).not.toBeNull();
    expect(result?.server).toBe('https://secure.example.com');
  });

  it('rejects javascript: URLs', () => {
    expect(validateCredentials({ ...MINIMAL_SUBSONIC, server: 'javascript:alert(1)' })).toBeNull();
  });

  it('rejects file:// URLs', () => {
    expect(validateCredentials({ ...MINIMAL_SUBSONIC, server: 'file:///etc/passwd' })).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(
      validateCredentials({ ...MINIMAL_SUBSONIC, server: 'data:text/html,<h1>hi</h1>' })
    ).toBeNull();
  });
});

describe('shouldStorePassword', () => {
  it('returns false when legacyAuth is false', () => {
    expect(
      shouldStorePassword({ ...MINIMAL_SUBSONIC, legacyAuth: false, password: 'secret' })
    ).toBe(false);
  });

  it('returns false when legacyAuth is undefined', () => {
    expect(shouldStorePassword({ ...MINIMAL_SUBSONIC, password: 'secret' })).toBe(false);
  });

  it('returns false when password is absent', () => {
    expect(shouldStorePassword({ ...MINIMAL_SUBSONIC, legacyAuth: true })).toBe(false);
  });

  it('returns false when password is empty string', () => {
    expect(shouldStorePassword({ ...MINIMAL_SUBSONIC, legacyAuth: true, password: '' })).toBe(
      false
    );
  });

  it('returns true when legacyAuth is true AND password is a non-empty string', () => {
    expect(
      shouldStorePassword({ ...MINIMAL_SUBSONIC, legacyAuth: true, password: 'my-secret-pw' })
    ).toBe(true);
  });
});
