import {
  libraryCacheSongToSong,
  buildAlbumsFromSongs,
  buildArtistsFromSongs,
  buildGenresFromSongs,
  searchSongsOffline,
  playlistCacheEntryToPlaylist,
  playlistCacheEntryToPlaylistWithSongs,
} from '../shared/offlineLibrary';
import type { LibraryCacheSong } from '../components/shared/libraryCache';
import type { PlaylistCacheEntry } from '../hooks/usePlaylistsCache';
import { Item } from '../types';

const makeSong = (overrides: Partial<LibraryCacheSong> = {}): LibraryCacheSong => ({
  id: 'song-1',
  parent: undefined,
  title: 'Test Song',
  isDir: false,
  album: 'Test Album',
  albumId: 'album-1',
  albumArtist: 'Test Artist',
  albumArtistId: 'artist-1',
  artist: [{ id: 'artist-1', title: 'Test Artist' }],
  track: 1,
  year: 2024,
  genre: [{ id: 'Rock', title: 'Rock' }],
  albumGenre: 'Rock',
  size: 1000000,
  contentType: 'audio/flac',
  suffix: 'flac',
  duration: 180,
  bitRate: 320,
  path: '/music/test.flac',
  playCount: 0,
  discNumber: undefined,
  created: '2024-01-01',
  streamUrl: 'http://server/stream/song-1',
  image: '',
  starred: false,
  userRating: undefined,
  type: Item.Music,
  ...overrides,
});

describe('libraryCacheSongToSong', () => {
  it('converts a boolean starred to the Song string convention', () => {
    expect(libraryCacheSongToSong(makeSong({ starred: true })).starred).toBe('true');
    expect(libraryCacheSongToSong(makeSong({ starred: false })).starred).toBeUndefined();
  });

  it('assigns a fresh uniqueId', () => {
    const a = libraryCacheSongToSong(makeSong());
    const b = libraryCacheSongToSong(makeSong());
    expect(a.uniqueId).toBeTruthy();
    expect(a.uniqueId).not.toEqual(b.uniqueId);
  });

  it('preserves every other field', () => {
    const song = libraryCacheSongToSong(makeSong({ id: 'abc', title: 'Hello' }));
    expect(song.id).toBe('abc');
    expect(song.title).toBe('Hello');
  });
});

describe('buildAlbumsFromSongs (Fix 5)', () => {
  it('groups songs into one album per albumId', () => {
    const songs = [
      makeSong({ id: 's1', albumId: 'album-1', duration: 100 }),
      makeSong({ id: 's2', albumId: 'album-1', duration: 200 }),
      makeSong({ id: 's3', albumId: 'album-2', album: 'Other Album', duration: 50 }),
    ];

    const albums = buildAlbumsFromSongs(songs);

    expect(albums).toHaveLength(2);
    const album1 = albums.find((a) => a.id === 'album-1');
    expect(album1?.songCount).toBe(2);
    expect(album1?.duration).toBe(300);
    expect(album1?.title).toBe('Test Album');
  });

  it('skips songs with no albumId', () => {
    const songs = [makeSong({ id: 's1', albumId: undefined })];
    expect(buildAlbumsFromSongs(songs)).toHaveLength(0);
  });
});

describe('buildArtistsFromSongs (Fix 5)', () => {
  it('groups songs into one artist per albumArtistId, counting distinct albums', () => {
    const songs = [
      makeSong({ id: 's1', albumId: 'album-1', albumArtistId: 'artist-1' }),
      makeSong({ id: 's2', albumId: 'album-2', albumArtistId: 'artist-1' }),
      makeSong({ id: 's3', albumId: 'album-3', albumArtistId: 'artist-2', albumArtist: 'Other' }),
    ];

    const artists = buildArtistsFromSongs(songs);

    expect(artists).toHaveLength(2);
    const artist1 = artists.find((a) => a.id === 'artist-1');
    expect(artist1?.albumCount).toBe(2);
  });
});

describe('buildGenresFromSongs (Fix 5)', () => {
  it('groups songs by genre, counting songs and distinct albums', () => {
    const songs = [
      makeSong({ id: 's1', albumId: 'album-1', albumGenre: 'Rock' }),
      makeSong({ id: 's2', albumId: 'album-1', albumGenre: 'Rock' }),
      makeSong({ id: 's3', albumId: 'album-2', albumGenre: 'Jazz' }),
    ];

    const genres = buildGenresFromSongs(songs);

    const rock = genres.find((g) => g.title === 'Rock');
    expect(rock?.songCount).toBe(2);
    expect(rock?.albumCount).toBe(1);
    const jazz = genres.find((g) => g.title === 'Jazz');
    expect(jazz?.songCount).toBe(1);
  });

  it('falls back to the per-song genre field when albumGenre is missing', () => {
    const songs = [makeSong({ albumGenre: undefined, genre: [{ id: 'Pop', title: 'Pop' }] })];
    const genres = buildGenresFromSongs(songs);
    expect(genres.map((g) => g.title)).toEqual(['Pop']);
  });
});

describe('searchSongsOffline (Fix 5)', () => {
  const songs = [
    makeSong({ id: 's1', title: 'Bohemian Rhapsody', album: 'A Night at the Opera' }),
    makeSong({ id: 's2', title: 'Another One Bites the Dust', album: 'The Game' }),
  ];

  it('matches by title, case-insensitively', () => {
    expect(searchSongsOffline(songs, 'bohemian').map((s) => s.id)).toEqual(['s1']);
  });

  it('matches by album', () => {
    expect(searchSongsOffline(songs, 'the game').map((s) => s.id)).toEqual(['s2']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchSongsOffline(songs, '')).toEqual([]);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchSongsOffline(songs, 'nonexistent')).toEqual([]);
  });
});

describe('playlist offline browsing (Fix 6)', () => {
  const makeEntry = (overrides: Partial<PlaylistCacheEntry> = {}): PlaylistCacheEntry => ({
    id: 'pl1',
    title: 'My Playlist',
    songIds: ['s1', 's2'],
    duration: 300,
    image: '',
    ...overrides,
  });

  it('playlistCacheEntryToPlaylist reconstructs the Playlist shape without song contents', () => {
    const playlist = playlistCacheEntryToPlaylist(makeEntry());
    expect(playlist.id).toBe('pl1');
    expect(playlist.title).toBe('My Playlist');
    expect(playlist.type).toBe(Item.Playlist);
    expect(playlist).not.toHaveProperty('song');
  });

  it('playlistCacheEntryToPlaylistWithSongs resolves song id references against the song snapshot', () => {
    const songsById = new Map([
      ['s1', makeSong({ id: 's1', title: 'Song One' })],
      ['s2', makeSong({ id: 's2', title: 'Song Two' })],
    ]);

    const playlist = playlistCacheEntryToPlaylistWithSongs(makeEntry(), songsById);

    expect(playlist.song?.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(playlist.song?.[0].title).toBe('Song One');
  });

  it('drops a songId with no match in the song snapshot instead of rendering a broken row', () => {
    const songsById = new Map([['s1', makeSong({ id: 's1' })]]);

    const playlist = playlistCacheEntryToPlaylistWithSongs(
      makeEntry({ songIds: ['s1', 'missing-song'] }),
      songsById
    );

    expect(playlist.song?.map((s) => s.id)).toEqual(['s1']);
  });
});
