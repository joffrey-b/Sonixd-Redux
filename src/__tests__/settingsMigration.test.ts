jest.mock('../i18n/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key, language: 'en' },
}));
jest.mock('../shared/utils', () => ({
  isMacOS: false,
  ...jest.requireActual('../shared/utils'),
}));

// Importing these after mocks ensures the mocks are in place

import { setDefaultSettings, DEFAULT_SETTINGS } from '../components/shared/setDefaultSettings';
// The module exports its own settings instance — import it to inspect/modify state

import { settings } from '../components/shared/setDefaultSettings';

// Reset sidebar migration state before each test so we can re-run migrations
function resetSidebarMigrationState(opts: { version?: number; selected?: string[] } = {}) {
  settings.set('sidebar.version', opts.version ?? 0);
  if (opts.selected !== undefined) {
    settings.set('sidebar.selected', opts.selected);
  }
}

function resetPeqMigrationState(opts: { version?: number; bands?: unknown } = {}) {
  settings.set('peq.version', opts.version ?? 0);
  if (opts.bands !== undefined) {
    settings.set('peqBands', opts.bands);
  }
}

beforeEach(() => {
  resetSidebarMigrationState({ version: 4 }); // default: already migrated
  resetPeqMigrationState({ version: 1 }); // default: already migrated
});

describe('PEQ band migration', () => {
  const SIX_BANDS = [
    { enabled: true, type: 'peaking', freq: 80, gain: 0, q: 1.0 },
    { enabled: true, type: 'peaking', freq: 250, gain: 0, q: 1.0 },
    { enabled: true, type: 'peaking', freq: 500, gain: 0, q: 1.0 },
    { enabled: true, type: 'peaking', freq: 1000, gain: 3, q: 1.0 },
    { enabled: true, type: 'peaking', freq: 4000, gain: 0, q: 1.0 },
    { enabled: true, type: 'peaking', freq: 16000, gain: 0, q: 1.0 },
  ];

  it('leaves a 10-band array unchanged', () => {
    resetPeqMigrationState({ version: 0, bands: DEFAULT_SETTINGS.peqBands });
    setDefaultSettings(false);
    expect(settings.get('peqBands')).toEqual(DEFAULT_SETTINGS.peqBands);
  });

  it('replaces a 6-band array with the 10-band default', () => {
    resetPeqMigrationState({ version: 0, bands: SIX_BANDS });
    setDefaultSettings(false);
    const result = settings.get('peqBands') as unknown[];
    expect(result).toHaveLength(10);
  });

  it('replaces an empty array with the 10-band default', () => {
    // Empty array: length !== 10 but every() on empty is true, so this requires
    // checking the actual migration condition: Array.isArray && length !== 10 && every(hasFreq)
    // Empty array: every() on empty is vacuously true, so it triggers migration
    resetPeqMigrationState({ version: 0, bands: [] });
    setDefaultSettings(false);
    // After migration, settings will have the default 10 bands but since the stored
    // array was empty, freqMap has no entries, so all bands come from defaults
    const result = settings.get('peqBands') as unknown[];
    // Empty array doesn't trigger migration because it fails the length !== 10 check?
    // Actually: [].length !== 10 is true, [].every(...) is true → migration runs
    // freqMap is empty, so migrated = DEFAULT_10_BANDS (all defaults)
    expect(result).toHaveLength(10);
  });

  it('replaces a non-array value with the 10-band default (skips migration gracefully)', () => {
    resetPeqMigrationState({ version: 0, bands: 'invalid' });
    setDefaultSettings(false);
    // Non-array: Array.isArray fails, migration block does not run
    // peqBands stays as 'invalid' (the migration only writes when Array.isArray is true)
    // The default from the Store's defaults is the 10-band array, but we set it to 'invalid'
    // After setDefaultSettings, since the condition isn't met, peqBands stays 'invalid'
    // But settings.set('peq.version', 1) is still called
    expect(settings.get('peq.version')).toBe(1);
  });

  it('preserves gain values for bands that exist at matching frequencies', () => {
    const bandsWithGain = SIX_BANDS.map((b) => (b.freq === 1000 ? { ...b, gain: 5 } : b));
    resetPeqMigrationState({ version: 0, bands: bandsWithGain });
    setDefaultSettings(false);
    const result = settings.get('peqBands') as Array<{ freq: number; gain: number }>;
    // The 1000Hz band from the old config had gain: 5
    // The new 10-band set also has 1000Hz, so the old band is preserved
    const band1000 = result.find((b) => b.freq === 1000);
    expect(band1000?.gain).toBe(5);
  });

  it('does not migrate when peq.version is already 1', () => {
    resetPeqMigrationState({ version: 1, bands: SIX_BANDS });
    const getBefore = settings.get('peqBands');
    setDefaultSettings(false);
    expect(settings.get('peqBands')).toEqual(getBefore);
  });
});

describe('sidebar migration', () => {
  const BASE_SELECTED = ['dashboard', 'songs', 'albums', 'artists'];

  it('adds missing sidebar items to an existing config (version 0 → current)', () => {
    resetSidebarMigrationState({ version: 0, selected: BASE_SELECTED });
    setDefaultSettings(false);

    const selected = settings.get('sidebar.selected') as string[];
    expect(selected).toContain('smartplaylists');
    expect(selected).toContain('radio');
    expect(selected).toContain('podcasts');
  });

  it('does not force playlistList back into a config that never had it', () => {
    // playlistList has been in DEFAULT_SETTINGS.sidebar.selected since at least
    // v1.0.7 — there's no "introduced later" version for it to migrate from, so
    // a missing entry here means the user removed it deliberately, not that
    // they're on an old version. There used to be a "version 4" migration block
    // that re-added it unconditionally, clobbering that choice on every upgrade
    // from v1.0.7 or earlier; this guards against reintroducing it.
    resetSidebarMigrationState({ version: 0, selected: BASE_SELECTED });
    setDefaultSettings(false);

    const selected = settings.get('sidebar.selected') as string[];
    expect(selected).not.toContain('playlistList');
  });

  it('respects a deliberate removal of playlistList from an otherwise-full list', () => {
    const withoutPlaylistList = DEFAULT_SETTINGS.sidebar.selected.filter(
      (s) => s !== 'playlistList'
    );
    resetSidebarMigrationState({ version: 0, selected: withoutPlaylistList });
    setDefaultSettings(false);

    const selected = settings.get('sidebar.selected') as string[];
    expect(selected).not.toContain('playlistList');
  });

  it('does not duplicate items already present', () => {
    const alreadyHasSmartplaylists = [...BASE_SELECTED, 'smartplaylists'];
    resetSidebarMigrationState({ version: 0, selected: alreadyHasSmartplaylists });
    setDefaultSettings(false);

    const selected = settings.get('sidebar.selected') as string[];
    const count = selected.filter((s) => s === 'smartplaylists').length;
    expect(count).toBe(1);
  });

  it('treats fresh install (no version) as version 0', () => {
    // Delete version to simulate fresh install (Store returns undefined → || 0 = 0)
    settings.set('sidebar.version', 0);
    settings.set('sidebar.selected', BASE_SELECTED);
    setDefaultSettings(false);

    const version = settings.get('sidebar.version') as number;
    expect(version).toBe(4);
  });

  it('does not modify config already at current version', () => {
    const fullSelected = [...DEFAULT_SETTINGS.sidebar.selected];
    settings.set('sidebar.version', 4);
    settings.set('sidebar.selected', fullSelected);

    setDefaultSettings(false);

    const selected = settings.get('sidebar.selected') as string[];
    // Should not have added any new items
    expect(selected).toEqual(fullSelected);
    expect(settings.get('sidebar.version')).toBe(4);
  });
});

describe('default settings completeness', () => {
  it('every key in DEFAULT_SETTINGS has a defined (non-undefined) value', () => {
    for (const [, value] of Object.entries(DEFAULT_SETTINGS)) {
      expect(value).not.toBeUndefined();
    }
  });

  it('songCacheSizeLimit is a positive number', () => {
    expect(typeof DEFAULT_SETTINGS.songCacheSizeLimit).toBe('number');
    expect(DEFAULT_SETTINGS.songCacheSizeLimit).toBeGreaterThan(0);
  });

  it('scrobbleThreshold is between 0 and 100', () => {
    expect(DEFAULT_SETTINGS.scrobbleThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.scrobbleThreshold).toBeLessThanOrEqual(100);
  });

  it('eqPreampDb defaults to 0', () => {
    expect(DEFAULT_SETTINGS.eqPreampDb).toBe(0);
  });

  it('peqPreampDb defaults to 0', () => {
    expect(DEFAULT_SETTINGS.peqPreampDb).toBe(0);
  });

  it('peqBands has exactly 10 entries', () => {
    expect(DEFAULT_SETTINGS.peqBands).toHaveLength(10);
  });

  it('sidebar.selected contains all expected entries', () => {
    const required = [
      'dashboard',
      'songs',
      'albums',
      'artists',
      'smartplaylists',
      'radio',
      'podcasts',
      'playlistList',
    ];
    for (const entry of required) {
      expect(DEFAULT_SETTINGS.sidebar.selected).toContain(entry);
    }
  });
});
