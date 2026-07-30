import {
  sanitizePathSegment,
  sanitizeArtistSegment,
  sanitizeAlbumSegment,
  buildDownloadFileName,
  withDisambiguatingSuffix,
} from '../shared/sanitizeDownloadPath';

describe('sanitized naming (Fix 1)', () => {
  it('produces filesystem-safe names on both platform conventions', () => {
    // Windows-illegal characters: < > : " / \ | ? * and control chars.
    expect(sanitizeArtistSegment('AC/DC')).toBe('AC_DC');
    expect(sanitizeAlbumSegment('Rock: The "Best" <Hits>')).toBe('Rock_ The _Best_ _Hits_');
    expect(sanitizeArtistSegment("Guns N' Roses | Live")).toBe("Guns N' Roses _ Live");
    // Trailing dots/spaces are illegal on Windows.
    expect(sanitizeAlbumSegment('Greatest Hits...')).toBe('Greatest Hits');
    expect(sanitizeAlbumSegment('Trailing space ')).toBe('Trailing space');
    // Windows reserved device names.
    expect(sanitizeArtistSegment('CON')).toBe('Unknown Artist');
    expect(sanitizeArtistSegment('con')).toBe('Unknown Artist');
  });

  it('neutralizes path-traversal sequences in server-provided titles', () => {
    // Slashes/backslashes (the multi-segment traversal vector) are stripped.
    expect(sanitizePathSegment('../../etc/passwd', 'Unknown')).not.toContain('/');
    expect(sanitizePathSegment('..\\..\\windows\\system32', 'Unknown')).not.toContain('\\');
    // A segment that collapses to exactly '.' or '..' is replaced outright --
    // the one traversal shape slash-stripping alone doesn't neutralize.
    expect(sanitizePathSegment('..', 'Unknown')).toBe('Unknown');
    expect(sanitizePathSegment('.', 'Unknown')).toBe('Unknown');
    expect(sanitizePathSegment('', 'Unknown')).toBe('Unknown');
    expect(sanitizePathSegment(undefined, 'Unknown')).toBe('Unknown');
    expect(sanitizePathSegment(null, 'Unknown')).toBe('Unknown');
  });

  it('produces clean names when no collision exists', () => {
    expect(buildDownloadFileName(3, 'My Song', 'flac')).toBe('03 - My Song.flac');
    expect(buildDownloadFileName(undefined, 'No Track Number', 'mp3')).toBe('No Track Number.mp3');
    expect(sanitizeArtistSegment('Pink Floyd')).toBe('Pink Floyd');
    expect(sanitizeAlbumSegment('The Dark Side of the Moon')).toBe('The Dark Side of the Moon');
  });

  it('appends a disambiguating suffix only when the caller has actually detected a genuine collision', () => {
    // This module has no opinion on what counts as a collision -- it only
    // names attempt N once the caller has already decided one exists.
    expect(withDisambiguatingSuffix('Greatest Hits', 1)).toBe('Greatest Hits');
    expect(withDisambiguatingSuffix('Greatest Hits', 2)).toBe('Greatest Hits (2)');
    expect(withDisambiguatingSuffix('Greatest Hits', 3)).toBe('Greatest Hits (3)');
  });

  it('sanitizes the file extension defensively too', () => {
    expect(buildDownloadFileName(1, 'Song', '../../etc')).toBe('01 - Song.etc');
    expect(buildDownloadFileName(1, 'Song', undefined)).toBe('01 - Song.mp3');
  });

  it('caps pathologically long segments defensively', () => {
    const longTitle = 'x'.repeat(500);
    const result = sanitizePathSegment(longTitle, 'Unknown');
    expect(result.length).toBeLessThanOrEqual(180);
  });
});
