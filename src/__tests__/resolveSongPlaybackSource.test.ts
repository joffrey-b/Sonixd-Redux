import { resolveSongPlaybackSource } from '../shared/resolveSongPlaybackSource';

describe('resolveSongPlaybackSource', () => {
  it('returns the cached path when the file exists in cache', async () => {
    const cacheExists = jest.fn().mockResolvedValue(true);
    const result = await resolveSongPlaybackSource(
      { id: 'song1', suffix: 'flac', streamUrl: 'https://server/rest/stream.view?id=song1' },
      '/cache/song',
      cacheExists
    );
    expect(result).toBe('/cache/song/song1.flac');
    expect(cacheExists).toHaveBeenCalledWith('/cache/song/song1.flac');
  });

  it('returns the stream URL when the file does not exist in cache', async () => {
    const cacheExists = jest.fn().mockResolvedValue(false);
    const result = await resolveSongPlaybackSource(
      { id: 'song1', suffix: 'flac', streamUrl: 'https://server/rest/stream.view?id=song1' },
      '/cache/song',
      cacheExists
    );
    expect(result).toBe('https://server/rest/stream.view?id=song1');
  });

  it('returns undefined when song is undefined', async () => {
    const cacheExists = jest.fn().mockResolvedValue(true);
    const result = await resolveSongPlaybackSource(undefined, '/cache/song', cacheExists);
    expect(result).toBeUndefined();
    expect(cacheExists).not.toHaveBeenCalled();
  });

  it('defaults to mp3 extension when song.suffix is missing', async () => {
    const cacheExists = jest.fn().mockResolvedValue(true);
    const result = await resolveSongPlaybackSource(
      { id: 'song1', streamUrl: 'https://server/rest/stream.view?id=song1' },
      '/cache/song',
      cacheExists
    );
    expect(result).toBe('/cache/song/song1.mp3');
  });

  it('uses the song id and suffix to construct the exact same filename cacheSong.ts would produce', async () => {
    // cacheSong.ts builds its cached filename as `${song.id}.${song.suffix || 'mp3'}`
    // joined onto the cache dir -- this must match exactly or the read side will
    // never find what the write side saved.
    const cacheExists = jest.fn().mockResolvedValue(true);
    const song = { id: 'abc123', suffix: 'ogg', streamUrl: 'https://server/stream' };
    const expectedFileName = `${song.id}.${song.suffix || 'mp3'}`;
    const result = await resolveSongPlaybackSource(song, '/cache/song', cacheExists);
    expect(result).toBe(`/cache/song/${expectedFileName}`);
  });

  it('does not call cacheExists more than once per resolution', async () => {
    const cacheExists = jest.fn().mockResolvedValue(false);
    await resolveSongPlaybackSource(
      { id: 'song1', suffix: 'mp3', streamUrl: 'https://server/stream' },
      '/cache/song',
      cacheExists
    );
    expect(cacheExists).toHaveBeenCalledTimes(1);
  });
});

// Phase 4 (Fix 1): extends the check order to downloaded -> cached -> network
// (ADR Section 8.3), matching the offline-status column's "downloaded wins"
// icon precedence. getDownloadedPath is synchronous (an in-memory lookup, not
// IPC) so this stays a Lesson #1-safe hot path.
describe('resolveSongPlaybackSource extension (Fix 1)', () => {
  it('prefers a downloaded file over a cached file over the network stream', async () => {
    const cacheExists = jest.fn().mockResolvedValue(true);
    const getDownloadedPath = jest.fn().mockReturnValue('/downloads/Artist/Album/01 - Song.flac');
    const result = await resolveSongPlaybackSource(
      { id: 'song1', suffix: 'flac', streamUrl: 'https://server/stream.view?id=song1' },
      '/cache/song',
      cacheExists,
      getDownloadedPath
    );
    expect(result).toBe('/downloads/Artist/Album/01 - Song.flac');
    // Downloaded resolved first -- cache existence should never even be checked.
    expect(cacheExists).not.toHaveBeenCalled();
  });

  it('falls back correctly through all three tiers for both backends', async () => {
    // Tier 1: downloaded present -> used, cache never checked.
    const getDownloadedPathHit = jest.fn().mockReturnValue('/downloads/a.flac');
    const cacheExistsUnused = jest.fn().mockResolvedValue(true);
    await expect(
      resolveSongPlaybackSource(
        { id: 'song1', suffix: 'flac', streamUrl: 'https://server/stream' },
        '/cache/song',
        cacheExistsUnused,
        getDownloadedPathHit
      )
    ).resolves.toBe('/downloads/a.flac');
    expect(cacheExistsUnused).not.toHaveBeenCalled();

    // Tier 2: no downloaded entry, cached file exists -> cached path used.
    const getDownloadedPathMiss = jest.fn().mockReturnValue(undefined);
    const cacheExistsHit = jest.fn().mockResolvedValue(true);
    await expect(
      resolveSongPlaybackSource(
        { id: 'song1', suffix: 'flac', streamUrl: 'https://server/stream' },
        '/cache/song',
        cacheExistsHit,
        getDownloadedPathMiss
      )
    ).resolves.toBe('/cache/song/song1.flac');

    // Tier 3: neither downloaded nor cached -> falls back to the network stream.
    const cacheExistsMiss = jest.fn().mockResolvedValue(false);
    await expect(
      resolveSongPlaybackSource(
        { id: 'song1', suffix: 'flac', streamUrl: 'https://server/stream' },
        '/cache/song',
        cacheExistsMiss,
        getDownloadedPathMiss
      )
    ).resolves.toBe('https://server/stream');
  });

  it('still works when getDownloadedPath is omitted (backwards compatible)', async () => {
    const cacheExists = jest.fn().mockResolvedValue(false);
    const result = await resolveSongPlaybackSource(
      { id: 'song1', suffix: 'mp3', streamUrl: 'https://server/stream' },
      '/cache/song',
      cacheExists
    );
    expect(result).toBe('https://server/stream');
  });
});
