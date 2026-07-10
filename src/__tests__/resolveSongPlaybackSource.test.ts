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
