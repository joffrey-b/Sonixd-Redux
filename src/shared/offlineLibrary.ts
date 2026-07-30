// Client-side reconstruction of Albums/Artists/Genres/Search over the
// existing library sync's local song snapshot (ADR Section 5.1) -- no new
// sync mechanism for these views. Playlists (Section 5.2) are handled
// separately in usePlaylistsCache.ts since that data genuinely isn't synced
// today.
import { nanoid } from 'nanoid/non-secure';
import { LibraryCacheSong } from '../components/shared/libraryCache';
import { Album, APIEndpoints, Artist, Genre, Item, Playlist, Song } from '../types';
import type { PlaylistCacheEntry } from '../hooks/usePlaylistsCache';

// LibraryCacheSong = Omit<Song, 'uniqueId' | 'starred'> & { starred: boolean }
// -- reverses that adapter so offline-reconstructed lists can be rendered by
// the exact same view/table components the online path already uses.
export const libraryCacheSongToSong = (cached: LibraryCacheSong): Song => ({
  ...cached,
  starred: cached.starred ? 'true' : undefined,
  uniqueId: nanoid(),
});

export const buildAlbumsFromSongs = (songs: LibraryCacheSong[]): Album[] => {
  const byAlbumId = new Map<string, LibraryCacheSong[]>();
  songs.forEach((song) => {
    if (!song.albumId) return;
    const bucket = byAlbumId.get(song.albumId);
    if (bucket) bucket.push(song);
    else byAlbumId.set(song.albumId, [song]);
  });

  return Array.from(byAlbumId.entries()).map(([albumId, albumSongs]) => {
    const first = albumSongs[0];
    return {
      id: albumId,
      title: first.album,
      albumId,
      albumArtist: first.albumArtist,
      albumArtistId: first.albumArtistId,
      songCount: albumSongs.length,
      // Sum of its songs' play counts -- the offline equivalent of the
      // aggregate playCount the server already returns for the online
      // "Most Played" list (Subsonic/Jellyfin's getAlbumList2 type=frequent),
      // used to approximate that same ordering when browsing offline.
      playCount: albumSongs.reduce((sum, s) => sum + (s.playCount || 0), 0),
      duration: albumSongs.reduce((sum, s) => sum + (s.duration || 0), 0),
      created: first.created,
      year: first.year,
      genre: first.genre,
      albumGenre: first.albumGenre,
      image: first.image,
      type: Item.Album,
      uniqueId: nanoid(),
    };
  });
};

export const buildArtistsFromSongs = (songs: LibraryCacheSong[]): Artist[] => {
  const byArtistId = new Map<string, { songs: LibraryCacheSong[]; albumIds: Set<string> }>();
  songs.forEach((song) => {
    if (!song.albumArtistId) return;
    let entry = byArtistId.get(song.albumArtistId);
    if (!entry) {
      entry = { songs: [], albumIds: new Set() };
      byArtistId.set(song.albumArtistId, entry);
    }
    entry.songs.push(song);
    if (song.albumId) entry.albumIds.add(song.albumId);
  });

  return Array.from(byArtistId.entries()).map(([artistId, { songs: artistSongs, albumIds }]) => {
    const first = artistSongs[0];
    return {
      id: artistId,
      title: first.albumArtist,
      albumCount: albumIds.size,
      duration: artistSongs.reduce((sum, s) => sum + (s.duration || 0), 0),
      genre: first.genre,
      image: first.image,
      type: Item.Artist,
      uniqueId: nanoid(),
    };
  });
};

export const buildGenresFromSongs = (songs: LibraryCacheSong[]): Genre[] => {
  const byGenreTitle = new Map<string, { songCount: number; albumIds: Set<string> }>();
  songs.forEach((song) => {
    const genreTitle = song.albumGenre || song.genre?.[0]?.title;
    if (!genreTitle) return;
    let entry = byGenreTitle.get(genreTitle);
    if (!entry) {
      entry = { songCount: 0, albumIds: new Set() };
      byGenreTitle.set(genreTitle, entry);
    }
    entry.songCount += 1;
    if (song.albumId) entry.albumIds.add(song.albumId);
  });

  return Array.from(byGenreTitle.entries()).map(([title, { songCount, albumIds }]) => ({
    id: title,
    title,
    songCount,
    albumCount: albumIds.size,
    type: Item.Genre,
    uniqueId: nanoid(),
  }));
};

// Reverses PlaylistCacheEntry back into the Playlist shape PlaylistList.tsx
// already renders online, for the list-level view (no song contents needed
// here -- that resolution happens in playlistCacheEntryToPlaylistWithSongs).
export const playlistCacheEntryToPlaylist = (entry: PlaylistCacheEntry): Playlist => ({
  id: entry.id,
  title: entry.title,
  comment: entry.comment,
  owner: entry.owner,
  public: entry.public,
  songCount: entry.songCount,
  duration: entry.duration,
  created: entry.created,
  changed: entry.changed,
  image: entry.image,
  type: Item.Playlist,
  uniqueId: nanoid(),
});

// Resolves a playlist's song id references (ADR Section 5.2 -- ids only, no
// duplicated song data) against the existing song snapshot, for
// PlaylistView.tsx's single-playlist offline branch. A songId with no match
// in the song snapshot (metadata never synced) is dropped, not rendered as a
// broken row -- a narrower, separate limitation from "not cached locally"
// (audio bytes), documented in PHASE-3-SUMMARY.md.
export const playlistCacheEntryToPlaylistWithSongs = (
  entry: PlaylistCacheEntry,
  songsById: Map<string, LibraryCacheSong>
): Playlist => ({
  ...playlistCacheEntryToPlaylist(entry),
  song: entry.songIds
    .map((songId) => songsById.get(songId))
    .filter((song): song is LibraryCacheSong => song !== undefined)
    .map(libraryCacheSongToSong),
});

// Offline equivalent of usePlayQueueHandler's byItemType fetch (FIX 7) --
// resolves a "play this whole list" request against the local snapshots
// instead of the network. getSimilarSongs ("Artist Mix") has no offline
// equivalent (needs server-side similarity) and always resolves empty.
export const getOfflineSongsForItemType = (
  byItemType: { item: Item; id: string; endpoint?: APIEndpoints },
  cachedSongs: LibraryCacheSong[],
  cachedPlaylists: PlaylistCacheEntry[]
): LibraryCacheSong[] => {
  if (byItemType.endpoint === 'getSimilarSongs') return [];

  if (byItemType.item === Item.Album) {
    return cachedSongs.filter((song) => song.albumId === byItemType.id);
  }

  if (byItemType.item === Item.Artist) {
    return cachedSongs.filter((song) => song.albumArtistId === byItemType.id);
  }

  if (byItemType.item === Item.Playlist) {
    const entry = cachedPlaylists.find((playlist) => playlist.id === byItemType.id);
    if (!entry) return [];
    const songsById = new Map(cachedSongs.map((song) => [song.id, song]));
    return entry.songIds
      .map((songId) => songsById.get(songId))
      .filter((song): song is LibraryCacheSong => song !== undefined);
  }

  return [];
};

// Pure client-side computation over the same local snapshot Albums/Artists
// use -- Search has no dedicated storage of its own even when online (ADR
// Section 5.1), so this isn't a new sync either.
export const searchSongsOffline = (
  songs: LibraryCacheSong[],
  query: string
): LibraryCacheSong[] => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return songs.filter((song) => {
    const artistTitles = (song.artist || []).map((a) => a.title).join(' ');
    return (
      song.title?.toLowerCase().includes(trimmed) ||
      song.album?.toLowerCase().includes(trimmed) ||
      song.albumArtist?.toLowerCase().includes(trimmed) ||
      artistTitles.toLowerCase().includes(trimmed)
    );
  });
};
