import {
  isAvailableOffline,
  isDownloaded,
  getOfflineStatusIconState,
} from '../shared/isAvailableOffline';

describe('isAvailableOffline (Fix 2)', () => {
  it('returns true when cached locally', () => {
    const cached = new Set(['song1']);
    const downloaded = new Set<string>();
    expect(isAvailableOffline('song1', cached, downloaded)).toBe(true);
  });

  it('returns false when neither cached nor downloaded', () => {
    const cached = new Set(['other']);
    const downloaded = new Set<string>();
    expect(isAvailableOffline('song1', cached, downloaded)).toBe(false);
  });
});

// Phase 4 (Fix 1): isDownloaded is now a real lookup against the downloads
// index, not the Phase 3 stub. These tests confirm isAvailableOffline's
// combination logic and getOfflineStatusIconState's precedence logic --
// already written and tested against the stub in Phase 3 -- still behave
// correctly now that isDownloaded can actually return true, per the required
// self-audit ("confirm by test, not by inspection alone").
describe('isDownloaded real implementation (Fix 1)', () => {
  it('isDownloaded looks up the provided downloaded-songs Set', () => {
    const downloaded = new Set(['song1']);
    expect(isDownloaded('song1', downloaded)).toBe(true);
    expect(isDownloaded('song2', downloaded)).toBe(false);
  });

  it('isAvailableOffline still correctly combines cached OR downloaded (unchanged Phase 3 logic)', () => {
    const empty = new Set<string>();
    const cachedOnly = new Set(['song1']);
    const downloadedOnly = new Set(['song1']);

    // Neither
    expect(isAvailableOffline('song1', empty, empty)).toBe(false);
    // Cached only
    expect(isAvailableOffline('song1', cachedOnly, empty)).toBe(true);
    // Downloaded only
    expect(isAvailableOffline('song1', empty, downloadedOnly)).toBe(true);
    // Both
    expect(isAvailableOffline('song1', cachedOnly, downloadedOnly)).toBe(true);
  });

  it('getOfflineStatusIconState still correctly prefers downloaded over cached (unchanged Phase 3 logic)', () => {
    const cached = new Set(['song1']);
    const downloaded = new Set(['song1']);
    // Both cached and downloaded -- downloaded wins (ADR Section 6).
    expect(getOfflineStatusIconState('song1', false, cached, downloaded)).toBe('downloaded');
  });
});

describe('getOfflineStatusIconState (offline-status column, Fix 3)', () => {
  it('renders no icon for an online-only song', () => {
    const cached = new Set<string>();
    const downloaded = new Set<string>();
    expect(getOfflineStatusIconState('song1', false, cached, downloaded)).toBe('none');
  });

  it('renders the cached icon for a locally cached song', () => {
    const cached = new Set(['song1']);
    const downloaded = new Set<string>();
    expect(getOfflineStatusIconState('song1', false, cached, downloaded)).toBe('cached');
  });

  it('renders the downloaded icon for a downloaded song', () => {
    const cached = new Set<string>();
    const downloaded = new Set(['song1']);
    expect(getOfflineStatusIconState('song1', false, cached, downloaded)).toBe('downloaded');
  });

  it('never shows an icon for a directory row, even if its id happens to be cached or downloaded', () => {
    const cached = new Set(['dir1']);
    const downloaded = new Set(['dir1']);
    expect(getOfflineStatusIconState('dir1', true, cached, downloaded)).toBe('none');
  });
});
