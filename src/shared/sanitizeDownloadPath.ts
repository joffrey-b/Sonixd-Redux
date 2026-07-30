// ADR Section 8.2: filename/folder sanitization for downloads. The
// opportunistic cache's opaque `{songId}.{ext}` naming deliberately has no
// sanitizer to reuse -- this is new work. Pure string logic, no I/O, so it's
// unit-testable without the bridge.

// Characters illegal in a path segment on Windows (also covers the few
// Linux-illegal ones: NUL and '/', both already in this set).

const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const RESERVED_WINDOWS_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

// Sanitizes a single path segment (one folder or file-name-without-extension
// component). Never trust server-provided Artist/Album/Title strings to be
// free of path-traversal sequences: slashes/backslashes are stripped by
// ILLEGAL_CHARS above (so a multi-segment traversal like '../../etc' can
// never survive as one segment), and a segment that collapses to exactly '.'
// or '..' (the one traversal shape slash-stripping alone doesn't neutralize)
// is caught explicitly below and replaced with the fallback.
export const sanitizePathSegment = (input: string | undefined | null, fallback: string): string => {
  let result = (input ?? '').replace(ILLEGAL_CHARS, '_').trim();
  // Windows disallows trailing dots/spaces on a path segment.
  result = result.replace(/[. ]+$/, '');

  if (result === '' || result === '.' || result === '..' || RESERVED_WINDOWS_NAMES.test(result)) {
    return fallback;
  }

  // Defensive cap -- well under any real filesystem's per-segment limit,
  // avoids pathological multi-hundred-character metadata blowing up the
  // full {DownloadRoot}/{Artist}/{Album}/{NN} - {Title}.{ext} path.
  // Audit fix: `result.slice(0, 180)` operates on UTF-16 code units, not
  // Unicode code points -- a title containing a surrogate-pair character
  // (some emoji, rare CJK extension ideographs) straddling the 180-unit
  // boundary would have the pair split, leaving a dangling lone surrogate in
  // the on-disk filename. `Array.from` iterates by code point, so slicing
  // the array instead can never cut a pair in half.
  const truncated = Array.from(result).slice(0, 180).join('');
  return truncated.replace(/[. ]+$/, '').trim() || fallback;
};

export const sanitizeArtistSegment = (artist: string | undefined | null): string =>
  sanitizePathSegment(artist, 'Unknown Artist');

export const sanitizeAlbumSegment = (album: string | undefined | null): string =>
  sanitizePathSegment(album, 'Unknown Album');

const sanitizeExtension = (ext: string | undefined | null): string => {
  const cleaned = (ext ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return cleaned || 'mp3';
};

// ADR Section 8.2: '{NN} - {Song Title}.{ext}', track-number-prefixed so the
// album sorts correctly if browsed outside the app. No track number (radio/
// podcast-adjacent edge cases aside) omits the prefix rather than showing a
// misleading '00 - '.
export const buildDownloadFileName = (
  track: number | undefined,
  title: string | undefined | null,
  ext: string | undefined | null
): string => {
  const safeTitle = sanitizePathSegment(title, 'Unknown Title');
  const safeExt = sanitizeExtension(ext);
  const prefix = track && track > 0 ? `${String(track).padStart(2, '0')} - ` : '';
  return `${prefix}${safeTitle}.${safeExt}`;
};

// Appends a disambiguating suffix -- only called by the caller once a genuine
// collision is actually detected (ADR 8.2); this module has no opinion on
// what counts as a collision, it only knows how to name attempt N.
export const withDisambiguatingSuffix = (segment: string, attempt: number): string =>
  attempt <= 1 ? segment : `${segment} (${attempt})`;
