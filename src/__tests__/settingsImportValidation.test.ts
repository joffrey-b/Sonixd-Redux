import { shouldImportSetting, validateImportedSettings } from '../shared/settingsImportValidation';

const CREDENTIAL_KEYS: ReadonlySet<string> = new Set([
  'server',
  'serverBase64',
  'serverType',
  'username',
  'password',
  'salt',
  'hash',
  'token',
  'userId',
  'legacyAuth',
]);

const store: Record<string, unknown> = {
  volume: 0.5,
  theme: 'dark',
  enabled: true,
  scrobble: false,
  themesDefault: [],
};

describe('shouldImportSetting', () => {
  it('accepts a string value for a string setting', () => {
    expect(shouldImportSetting('theme', 'light', store, CREDENTIAL_KEYS)).toBe(true);
  });

  it('accepts a number value for a numeric setting', () => {
    expect(shouldImportSetting('volume', 0.8, store, CREDENTIAL_KEYS)).toBe(true);
  });

  it('accepts a boolean value for a boolean setting', () => {
    expect(shouldImportSetting('enabled', false, store, CREDENTIAL_KEYS)).toBe(true);
  });

  it('rejects a string where a number is expected', () => {
    expect(shouldImportSetting('volume', 'loud', store, CREDENTIAL_KEYS)).toBe(false);
  });

  it('rejects a number where a boolean is expected', () => {
    expect(shouldImportSetting('enabled', 1, store, CREDENTIAL_KEYS)).toBe(false);
  });

  it('rejects a boolean where a string is expected', () => {
    expect(shouldImportSetting('theme', true, store, CREDENTIAL_KEYS)).toBe(false);
  });

  it('rejects keys not present in the current store', () => {
    expect(shouldImportSetting('unknownKey', 'value', store, CREDENTIAL_KEYS)).toBe(false);
  });

  it('skips keys in SETTINGS_DENY_LIST (password)', () => {
    expect(shouldImportSetting('password', 'secret', store, CREDENTIAL_KEYS)).toBe(false);
  });

  it('skips keys in SETTINGS_DENY_LIST (username)', () => {
    expect(shouldImportSetting('username', 'user', store, CREDENTIAL_KEYS)).toBe(false);
  });

  it('skips keys in SETTINGS_DENY_LIST (legacyAuth)', () => {
    expect(shouldImportSetting('legacyAuth', false, store, CREDENTIAL_KEYS)).toBe(false);
  });

  it('skips the themesDefault key', () => {
    expect(shouldImportSetting('themesDefault', [], store, CREDENTIAL_KEYS)).toBe(false);
  });
});

describe('validateImportedSettings', () => {
  it('returns null for array input', () => {
    expect(validateImportedSettings([], store, CREDENTIAL_KEYS)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(validateImportedSettings(null, store, CREDENTIAL_KEYS)).toBeNull();
  });

  it('returns null for string input', () => {
    expect(validateImportedSettings('{"volume":0.8}', store, CREDENTIAL_KEYS)).toBeNull();
  });

  it('returns null for number input', () => {
    expect(validateImportedSettings(42, store, CREDENTIAL_KEYS)).toBeNull();
  });

  it('returns empty object for empty object input without throwing', () => {
    expect(validateImportedSettings({}, store, CREDENTIAL_KEYS)).toEqual({});
  });

  it('accepts valid settings entries and returns them', () => {
    const result = validateImportedSettings(
      { volume: 0.8, theme: 'light' },
      store,
      CREDENTIAL_KEYS
    );
    expect(result).toEqual({ volume: 0.8, theme: 'light' });
  });

  it('filters out denied credential keys', () => {
    const result = validateImportedSettings(
      { volume: 0.8, password: 'secret' },
      store,
      CREDENTIAL_KEYS
    );
    expect(result).toEqual({ volume: 0.8 });
    expect(result).not.toHaveProperty('password');
  });

  it('filters out type-mismatched entries', () => {
    const result = validateImportedSettings(
      { volume: 'loud', theme: 'light' },
      store,
      CREDENTIAL_KEYS
    );
    expect(result).toEqual({ theme: 'light' });
  });

  it('filters out unknown keys not present in the current store', () => {
    const result = validateImportedSettings(
      { volume: 0.8, unknownKey: 'value' },
      store,
      CREDENTIAL_KEYS
    );
    expect(result).toEqual({ volume: 0.8 });
    expect(result).not.toHaveProperty('unknownKey');
  });
});
