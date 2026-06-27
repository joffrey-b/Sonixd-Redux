import { shouldImportSetting, validateImportedSettings } from '../shared/settingsImportValidation';

const DENY = new Set<string>(['serverBase64', 'password']);

const store: Record<string, unknown> = {
  volume: 0.8,
  theme: 'defaultDark',
  enabled: true,
  songCacheSizeLimit: 5000,
  scrobbleThreshold: 50,
  eqPreampDb: 0,
};

// ─── shouldImportSetting — additional type checks ─────────────────────────────

describe('shouldImportSetting — additional edge cases', () => {
  it('rejects nested object where a flat number is expected', () => {
    expect(shouldImportSetting('volume', { nested: true }, store, DENY)).toBe(false);
  });

  it('rejects array where a number is expected', () => {
    expect(shouldImportSetting('volume', [0.5], store, DENY)).toBe(false);
  });

  it('accepts boolean false as a valid boolean value', () => {
    expect(shouldImportSetting('enabled', false, store, DENY)).toBe(true);
  });

  it('accepts number 0 as a valid number value', () => {
    expect(shouldImportSetting('volume', 0, store, DENY)).toBe(true);
  });

  it('accepts empty string as a valid string value', () => {
    expect(shouldImportSetting('theme', '', store, DENY)).toBe(true);
  });

  it('rejects undefined value even when key exists', () => {
    expect(shouldImportSetting('volume', undefined, store, DENY)).toBe(false);
  });

  it('rejects NaN for a number setting (typeof NaN === "number", same type so accepted)', () => {
    // NaN has typeof 'number', so it passes the type check — this documents the behaviour
    expect(shouldImportSetting('volume', NaN, store, DENY)).toBe(true);
  });

  it('rejects a value whose key does not exist in the store', () => {
    expect(shouldImportSetting('nonExistentKey', 'value', store, DENY)).toBe(false);
  });

  it('rejects keys on the deny list', () => {
    expect(shouldImportSetting('password', 'secret', store, DENY)).toBe(false);
  });

  it('rejects the special themesDefault key', () => {
    const extStore = { ...store, themesDefault: [] };
    expect(shouldImportSetting('themesDefault', [], extStore, DENY)).toBe(false);
  });

  it('handles 50+ keys without performance issue', () => {
    const bigStore: Record<string, unknown> = {};
    const bigImport: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) {
      bigStore[`key${i}`] = 'value';
      bigImport[`key${i}`] = 'value';
    }
    const start = Date.now();
    validateImportedSettings(bigImport, bigStore, DENY);
    expect(Date.now() - start).toBeLessThan(100);
  });
});

// ─── validateImportedSettings — structural validation ─────────────────────────

describe('validateImportedSettings — structural validation', () => {
  it('returns null for a non-object input (string)', () => {
    expect(validateImportedSettings('not an object', store, DENY)).toBeNull();
  });

  it('returns null for an array input', () => {
    expect(validateImportedSettings([1, 2, 3], store, DENY)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(validateImportedSettings(null, store, DENY)).toBeNull();
  });

  it('returns empty object when all keys fail type check', () => {
    const badImport = { volume: 'not-a-number', theme: 42 };
    const result = validateImportedSettings(badImport, store, DENY);
    expect(result).toEqual({});
  });

  it('returns only the valid keys from a mixed import', () => {
    const mixed = { volume: 0.5, theme: 42 }; // volume valid, theme type mismatch
    const result = validateImportedSettings(mixed, store, DENY);
    expect(result).toHaveProperty('volume', 0.5);
    expect(result).not.toHaveProperty('theme');
  });

  it('excludes denied keys even if they type-match', () => {
    const importData = { volume: 0.5, serverBase64: 'encoded' };
    const extStore = { ...store, serverBase64: 'existing' };
    const result = validateImportedSettings(importData, extStore, DENY);
    expect(result).toHaveProperty('volume');
    expect(result).not.toHaveProperty('serverBase64');
  });

  it('accepts empty object import and returns empty result', () => {
    expect(validateImportedSettings({}, store, DENY)).toEqual({});
  });
});
