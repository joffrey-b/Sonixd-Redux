import axios from 'axios';
import qs from 'qs';
import _ from 'lodash';
import { nanoid } from 'nanoid/non-secure';
import axiosRetry from 'axios-retry';
import { mockSettings } from '../shared/mockSettings';
import { Item } from '../types';
import { settings } from '../components/shared/bridge';

interface CoverArtItem {
  coverArt?: string;
  artistImageUrl?: string;
}

interface SubsonicRawItem {
  id?: string;
  url?: string;
  name?: string;
}

interface SubsonicRawSong extends CoverArtItem {
  id: string;
  parent?: string;
  isDir?: boolean;
  title?: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  track?: number;
  year?: number;
  genre?: string;
  size?: number;
  contentType?: string;
  suffix?: string;
  duration?: number;
  bitRate?: number;
  path?: string;
  playCount?: number;
  discNumber?: number;
  created?: string;
  starred?: string;
  userRating?: number;
}

interface SubsonicRawAlbum extends CoverArtItem {
  id: string;
  name?: string;
  artist?: string;
  artistId?: string;
  songCount?: number;
  duration?: number;
  created?: string;
  year?: number;
  playCount?: number;
  genre?: string;
  starred?: string;
  userRating?: number;
  song?: SubsonicRawSong[];
}

interface SubsonicRawArtist extends CoverArtItem {
  id: string;
  name?: string;
  albumCount?: number;
  starred?: string;
  userRating?: number;
  biography?: string;
  externalUrls?: SubsonicRawItem[];
  externalImageUrl?: string;
  similarArtist?: SubsonicRawArtist[];
  album?: SubsonicRawAlbum[];
}

interface SubsonicRawPlaylist extends CoverArtItem {
  id: string;
  name?: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount?: number;
  duration?: number;
  created?: string;
  changed?: string;
  entry?: SubsonicRawSong[];
}

interface SubsonicRawGenre {
  id?: string;
  value?: string;
  songCount?: number;
  albumCount?: number;
}

interface SubsonicRawFolder extends CoverArtItem {
  id: string;
  name?: string;
  title?: string;
  DateCreated?: string;
  isDir?: boolean;
}

interface SubsonicRawScanStatus {
  scanning?: boolean;
  count?: number;
}

interface SubsonicRawPodcastEpisode extends CoverArtItem {
  id?: string;
  streamId?: string;
  channelId?: string;
  title?: string;
  description?: string;
  publishDate?: string;
  status?: string;
  duration?: number;
  size?: number;
}

interface SubsonicRawPodcastChannel extends CoverArtItem {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  status?: string;
  episode?: SubsonicRawPodcastEpisode[];
}

interface SubsonicRawArtistIndex {
  artist?: SubsonicRawArtist[];
}

interface SubsonicRawRadioStation {
  id?: string;
  name?: string;
  streamUrl?: string;
  homePageUrl?: string;
}

interface SubsonicRawLyrics {
  synced?: boolean;
}

type NormalizedItem = { id: string | undefined; title: string | undefined };

interface NormalizedArtist {
  id: string;
  title: string | undefined;
  albumCount: number | undefined;
  image: string | undefined;
  starred: string | undefined;
  userRating: number | undefined;
  info: {
    biography: string | undefined;
    externalUrl: NormalizedItem[];
    imageUrl: string | false | undefined;
    similarArtist: NormalizedArtist[];
  };
  type: Item;
  uniqueId: string;
  album: ReturnType<typeof normalizeAlbum>[];
}

interface RawAuthCredentials {
  username?: string;
  password?: string;
  salt?: string;
  hash?: string;
  server?: string;
  legacyAuth?: boolean;
}

const deriveCredentials = (raw: RawAuthCredentials) => {
  const isLegacy = Boolean(raw.legacyAuth);
  const username = String(raw.username || '');
  const password = isLegacy ? String(raw.password || '') : '';
  const salt = !isLegacy ? String(raw.salt || '') : '';
  const hash = !isLegacy ? String(raw.hash || '') : '';
  const server = String(raw.server || '');
  return {
    isLegacy,
    username,
    password,
    salt,
    hash,
    apiBase: `${server}/rest`,
    encUser: encodeURIComponent(username),
    encPass: isLegacy ? encodeURIComponent(password) : '',
  };
};

// Synchronous per-field reads (one sendSync per field) — used by getAuthParams()
// (low-frequency call sites) and as the getCachedCredentials() fallback below,
// before its first refreshCredentialCache() invoke resolves.
const getCredentials = () => {
  const isLegacy =
    process.env.NODE_ENV === 'test'
      ? (mockSettings.legacyAuth ?? false)
      : Boolean(settings.get('legacyAuth'));
  return deriveCredentials({
    legacyAuth: isLegacy,
    username: String(settings.get('username') || ''),
    password: String(settings.get('password') || ''),
    salt: String(settings.get('salt') || ''),
    hash: String(settings.get('hash') || ''),
    server: String(settings.get('server') || ''),
  });
};

const getAuthParams = () => {
  const c = getCredentials();
  return c.isLegacy
    ? { u: c.username, p: c.password, v: '1.13.0', c: 'sonixd-redux', f: 'json' }
    : { u: c.username, s: c.salt, t: c.hash, v: '1.13.0', c: 'sonixd-redux', f: 'json' };
};

// Module-level cache for getStreamUrl/getCoverArtUrl — both build plain strings
// and are called synchronously throughout the renderer, often once per song
// (normalizeSong calls both for every song in every API response — e.g. 25k+
// times during a full-library sync), so they can't await an IPC call. Populated
// lazily via invoke on first use; until that resolves, getCachedCredentials()
// falls back to the same per-field synchronous reads getCredentials() already
// does, so the very first call still returns a correct URL. This is not a
// general credential cache — getAuthParams() and the axios request interceptor
// below deliberately stay off it; the interceptor always awaits a fresh bridge
// call for every single request.
//
// Cleared by clearCredentialCache(), called right before the page reload that
// already happens on both login and disconnect — there's no window where a
// stale cached value could be read, since the reload re-evaluates this module
// from scratch regardless.
let credentialCache: ReturnType<typeof deriveCredentials> | null = null;
let credentialCacheRefreshing = false;

const refreshCredentialCache = () => {
  if (credentialCacheRefreshing) return;
  credentialCacheRefreshing = true;
  settings
    .getCredentials()
    .then((raw) => {
      credentialCache = deriveCredentials(raw);
      credentialCacheRefreshing = false;
      return null;
    })
    .catch(() => {
      credentialCacheRefreshing = false;
    });
};

export const clearCredentialCache = (): void => {
  credentialCache = null;
};

const getCachedCredentials = () => {
  if (credentialCache) return credentialCache;
  refreshCredentialCache();
  return getCredentials();
};

export const api = axios.create({
  baseURL: '',
  validateStatus: (status) => status >= 200 && status < 300,
});

api.interceptors.request.use(async (config) => {
  const raw = await settings.getCredentials();
  const { isLegacy, username, password, salt, hash, apiBase } = deriveCredentials(raw);
  config.baseURL = apiBase;
  config.params = config.params || {};
  config.params.u = username;
  config.params.s = isLegacy ? null : salt;
  config.params.t = isLegacy ? null : hash;
  config.params.p = isLegacy ? password : null;
  config.params.v = '1.13.0';
  config.params.c = 'sonixd-redux';
  config.params.f = 'json';
  return config;
});

api.interceptors.response.use(
  (res) => {
    // Return the subsonic response directly
    res.data = res.data['subsonic-response'];
    return res;
  },
  (err) => {
    return Promise.reject(err);
  }
);

axiosRetry(api, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000,
  // Only retry on actual network failures (timeout, connection refused, etc.).
  // HTTP error responses (4xx, 5xx) are definitive — retrying them is pointless
  // and produces console spam (e.g. 501 on servers that don't support podcasts).
  retryCondition: axiosRetry.isNetworkError,
});

const getCoverArtUrl = (item: CoverArtItem, size?: number) => {
  if (!item.coverArt && !item.artistImageUrl) {
    return 'img/placeholder.png';
  }

  if (!item.coverArt && !item.artistImageUrl?.match('2a96cbd8b46e442fc41c2b86b821562f')) {
    return item.artistImageUrl;
  }

  if (item.artistImageUrl?.match('2a96cbd8b46e442fc41c2b86b821562f')) {
    return 'img/placeholder.png';
  }

  const { isLegacy, apiBase, encUser, encPass, salt, hash } = getCachedCredentials();

  if (isLegacy) {
    return (
      `${apiBase}/getCoverArt.view` +
      `?id=${item.coverArt}` +
      `&u=${encUser}` +
      `&p=${encPass}` +
      `&v=1.13.0` +
      `&c=sonixd-redux` +
      `${size ? `&size=${size}` : ''}`
    );
  }

  return (
    `${apiBase}/getCoverArt.view` +
    `?id=${item.coverArt}` +
    `&u=${encUser}` +
    `&s=${salt}` +
    `&t=${hash}` +
    `&v=1.13.0` +
    `&c=sonixd-redux` +
    `${size ? `&size=${size}` : ''}`
  );
};

export const getDownloadUrl = (options: { id: string }) => {
  const { isLegacy, apiBase, encUser, encPass, salt, hash } = getCredentials();
  if (isLegacy) {
    return (
      `${apiBase}/download.view` +
      `?id=${options.id}` +
      `&u=${encUser}` +
      `&p=${encPass}` +
      `&v=1.13.0` +
      `&c=sonixd-redux`
    );
  }

  return (
    `${apiBase}/download.view` +
    `?id=${options.id}` +
    `&u=${encUser}` +
    `&s=${salt}` +
    `&t=${hash}` +
    `&v=1.13.0` +
    `&c=sonixd-redux`
  );
};

const getStreamUrl = (id: string) => {
  const { isLegacy, apiBase, encUser, encPass, salt, hash } = getCachedCredentials();
  if (isLegacy) {
    return (
      `${apiBase}/stream.view` +
      `?id=${id}` +
      `&u=${encUser}` +
      `&p=${encPass}` +
      `&v=1.13.0` +
      `&c=sonixd-redux`
    );
  }

  return (
    `${apiBase}/stream.view` +
    `?id=${id}` +
    `&u=${encUser}` +
    `&s=${salt}` +
    `&t=${hash}` +
    `&v=1.13.0` +
    `&c=sonixd-redux`
  );
};

const normalizeAPIResult = (items: unknown[], totalRecordCount?: number) => {
  return {
    data: items,
    totalRecordCount,
  };
};

const normalizeItem = (item: SubsonicRawItem) => {
  return {
    id: item.id || item.url,
    title: item.name,
  };
};

const normalizeSong = (item: SubsonicRawSong) => {
  return {
    id: item.id,
    parent: item.parent,
    isDir: item.isDir,
    title: item.title,
    album: item.album,
    albumId: item.albumId,
    albumArtist: item.artist,
    albumArtistId: item.artistId,
    artist: item.artist ? [{ id: item.artistId, title: item.artist }] : [],
    track: item.track,
    year: item.year,
    genre: item.genre ? [{ id: item.genre, title: item.genre }] : [],
    albumGenre: item.genre,
    size: item.size,
    contentType: item.contentType,
    suffix: item.suffix,
    duration: item.duration,
    bitRate: item.bitRate,
    path: item.path,
    playCount: item.playCount,
    discNumber: item.discNumber,
    created: item.created,
    streamUrl: getStreamUrl(item.id),
    image: getCoverArtUrl(item, 150),
    starred: item.starred,
    userRating: item.userRating,
    type: Item.Music,
    uniqueId: nanoid(),
  };
};

const normalizeAlbum = (item: SubsonicRawAlbum) => {
  return {
    id: item.id,
    title: item.name,
    albumId: item.id,
    albumArtist: item.artist,
    albumArtistId: item.artistId,
    artist: item.artist ? [{ id: item.artistId, title: item.artist }] : [],
    songCount: item.songCount,
    duration: item.duration,
    created: item.created,
    year: item.year,
    playCount: item.playCount,
    genre: item.genre ? [{ id: item.genre, title: item.genre }] : [],
    albumGenre: item.genre,
    image: getCoverArtUrl(item, 350),
    isDir: false,
    starred: item.starred,
    userRating: item.userRating,
    type: Item.Album,
    uniqueId: nanoid(),
    song: (item.song || []).map((entry) => normalizeSong(entry)),
  };
};

const normalizeArtist = (item: SubsonicRawArtist): NormalizedArtist => {
  return {
    id: item.id,
    title: item.name,
    albumCount: item.albumCount,
    image: getCoverArtUrl(item, 350),
    starred: item.starred,
    userRating: item.userRating,
    info: {
      biography: item.biography,
      externalUrl: (item.externalUrls || []).map((entry) => normalizeItem(entry)),
      imageUrl:
        !item.externalImageUrl?.match('2a96cbd8b46e442fc41c2b86b821562f') && item.externalImageUrl,
      similarArtist: (item.similarArtist || []).map((entry) => normalizeArtist(entry)),
    },
    type: Item.Artist,
    uniqueId: nanoid(),
    album: (item.album || []).map((entry) => normalizeAlbum(entry)),
  };
};

const normalizePlaylist = (item: SubsonicRawPlaylist) => {
  return {
    id: item.id,
    title: item.name,
    comment: item.comment,
    owner: item.owner,
    public: item.public,
    songCount: item.songCount,
    duration: item.duration,
    created: item.created,
    changed: item.changed,
    image: (item.songCount ?? 0) > 0 ? getCoverArtUrl(item, 350) : 'img/placeholder.png',
    type: Item.Playlist,
    uniqueId: nanoid(),
    song: (item.entry || []).map((entry) => normalizeSong(entry)),
  };
};

const normalizeGenre = (item: SubsonicRawGenre) => {
  return {
    id: item.id,
    title: item.value,
    songCount: item.songCount,
    albumCount: item.albumCount,
    type: Item.Genre,
    uniqueId: nanoid(),
  };
};

const normalizeFolder = (item: SubsonicRawFolder) => {
  return {
    id: item.id,
    title: item.name || item.title,
    created: item.DateCreated,
    isDir: true,
    image: getCoverArtUrl(item, 350),
    type: Item.Folder,
    uniqueId: nanoid(),
  };
};

const normalizeScanStatus = (item: SubsonicRawScanStatus) => {
  return {
    scanning: item.scanning,
    count: item.count,
  };
};

export const getPlaylist = async (options: { id: string }) => {
  const { data } = await api.get(`/getPlaylist.view`, { params: options });
  return normalizePlaylist(data.playlist);
};

export const getPlaylists = async () => {
  const { data } = await api.get('/getPlaylists.view');
  return ((data.playlists?.playlist || []) as SubsonicRawPlaylist[]).map(normalizePlaylist);
};

const normalizePodcastEpisode = (
  episode: SubsonicRawPodcastEpisode,
  channelTitle: string,
  channelCoverArt?: string
) => {
  return {
    id: episode.streamId || episode.id,
    episodeId: episode.id,
    channelId: episode.channelId,
    title: episode.title,
    description: episode.description || '',
    publishDate: episode.publishDate || null,
    status: episode.status,
    album: channelTitle,
    albumArtist: channelTitle,
    albumArtistId: '',
    artist: [],
    duration: episode.duration,
    size: episode.size || 0,
    created: episode.publishDate || '',
    streamUrl:
      episode.streamId && episode.status === 'completed' ? getStreamUrl(episode.streamId) : '',
    image: episode.coverArt
      ? getCoverArtUrl(episode, 150)
      : channelCoverArt || 'img/placeholder.png',
    type: Item.Music,
    uniqueId: nanoid(),
    isPodcast: true,
  };
};

const normalizePodcastChannel = (channel: SubsonicRawPodcastChannel) => {
  return {
    id: channel.id,
    title: channel.title || channel.url,
    description: channel.description || '',
    url: channel.url,
    status: channel.status,
    image: channel.coverArt ? getCoverArtUrl(channel, 350) : 'img/placeholder.png',
    episodes: (channel.episode || []).map((ep) =>
      normalizePodcastEpisode(ep, channel.title || channel.url || '', getCoverArtUrl(channel, 150))
    ),
  };
};

export const getPodcasts = async () => {
  const { data } = await api.get('/getPodcasts.view', { params: { includeEpisodes: true } });
  if (!data || data.status === 'failed') throw new Error('not_supported');
  return ((data.podcasts?.channel || []) as SubsonicRawPodcastChannel[]).map(
    normalizePodcastChannel
  );
};

export const refreshPodcasts = async () => {
  await api.get('/refreshPodcasts.view');
};

export const jukeboxControl = async (args: {
  action:
    | 'get'
    | 'status'
    | 'set'
    | 'start'
    | 'stop'
    | 'skip'
    | 'add'
    | 'clear'
    | 'remove'
    | 'shuffle'
    | 'setGain';
  id?: string | string[];
  index?: number;
  offset?: number;
  gain?: number;
}) => {
  const { action, id, index, offset, gain } = args;
  const params: Record<string, string | number | string[] | undefined> = { action };
  if (index !== undefined) params.index = index;
  if (offset !== undefined) params.offset = offset;
  if (gain !== undefined) params.gain = gain;
  // id can be repeated for multiple songs
  if (id !== undefined) params.id = id;
  const { data } = await api.get('/jukeboxControl.view', {
    params,
    paramsSerializer: (p) => qs.stringify(p, { arrayFormat: 'repeat' }),
  });
  if (data.status === 'failed') throw new Error(data.error?.message || 'jukeboxControl failed');
  const status = data.jukeboxStatus || data.jukeboxPlaylist;
  if (!status) return null;
  return {
    currentIndex: status.currentIndex ?? -1,
    playing: Boolean(status.playing),
    gain: status.gain ?? 1,
    position: status.position ?? 0,
    entry: ((status.entry || []) as { id: string }[]).map((e) => e.id),
  };
};

export const getBookmarks = async () => {
  const { data } = await api.get('/getBookmarks.view');
  if (!data || data.status === 'failed') return [];
  const bookmarks = data.bookmarks?.bookmark;
  if (!bookmarks) return [];
  return Array.isArray(bookmarks) ? bookmarks : [bookmarks];
};

export const createBookmark = async (options: { id: string; position: number }) => {
  await api.get('/createBookmark.view', { params: options });
};

export const deleteBookmark = async (options: { id: string }) => {
  await api.get('/deleteBookmark.view', { params: options });
};

export const getInternetRadioStations = async () => {
  const { data } = await api.get('/getInternetRadioStations.view');
  return (
    (data.internetRadioStations?.internetRadioStation || []) as SubsonicRawRadioStation[]
  ).map((station) => ({
    id: station.id,
    title: station.name,
    streamUrl: station.streamUrl,
    homePageUrl: station.homePageUrl || null,
  }));
};

export const getStarred = async (options: { musicFolderId?: string | number }) => {
  const { data } = await api.get(`/getStarred2.view`, { params: options });

  return {
    album: ((data.starred2.album || []) as SubsonicRawAlbum[]).map(normalizeAlbum),
    song: ((data.starred2.song || []) as SubsonicRawSong[]).map(normalizeSong),
    artist: ((data.starred2.artist || []) as SubsonicRawArtist[]).map(normalizeArtist),
  };
};

export const getAlbum = async (options: { id: string }) => {
  const { data } = await api.get(`/getAlbum.view`, { params: options });
  return normalizeAlbum(data.album);
};

export const getAlbums = async (
  options: {
    type:
      | 'random'
      | 'newest'
      | 'highest'
      | 'frequent'
      | 'recent'
      | 'alphabeticalByName'
      | 'alphabeticalByArtist'
      | 'starred'
      | 'byYear'
      | 'byGenre';
    size: number;
    offset: number;
    fromYear?: number;
    toYear?: number;
    genre?: string;
    musicFolderId?: string | number;
    recursive?: boolean;
  },
  recursiveData: SubsonicRawAlbum[][] = []
): Promise<ReturnType<typeof normalizeAPIResult>> => {
  if (options.recursive) {
    const albums = api
      .get(`/getAlbumList2.view`, {
        params: {
          type: options.type.match('alphabeticalByName|alphabeticalByArtist|frequent|newest|recent')
            ? options.type
            : 'byGenre',
          size: 500,
          offset: options.offset,
          genre: options.type.match(
            'alphabeticalByName|alphabeticalByArtist|frequent|newest|recent'
          )
            ? undefined
            : options.type,
          musicFolderId: options.musicFolderId,
        },
      })
      .then((res) => {
        if (!res.data.albumList2.album || res.data.albumList2.album.length === 0) {
          // Flatten and return once there are no more albums left
          const flattenedAlbums = _.flatten(recursiveData);

          return normalizeAPIResult(
            (flattenedAlbums || []).map((entry) => normalizeAlbum(entry)),
            flattenedAlbums.length
          );
        }

        // On every iteration, push the existing combined album array and increase the offset
        recursiveData.push(res.data.albumList2.album);
        return getAlbums(
          {
            type: options.type,
            size: options.size,
            offset: options.offset + options.size,
            musicFolderId: options.musicFolderId,
            recursive: true,
          },
          recursiveData
        );
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        throw err;
      });

    return albums;
  }

  const { data } = await api.get(`/getAlbumList2.view`, { params: options });
  return normalizeAPIResult(
    ((data.albumList2?.album || []) as SubsonicRawAlbum[]).map(normalizeAlbum),
    (data.albumList2?.album || []).length
  );
};

export const getRandomSongs = async (options: {
  size?: number;
  genre?: string;
  fromYear?: number;
  toYear?: number;
  musicFolderId?: number;
}) => {
  const { data } = await api.get(`/getRandomSongs.view`, { params: options });
  return ((data.randomSongs.song || []) as SubsonicRawSong[]).map(normalizeSong);
};

export const getArtist = async (options: { id: string }) => {
  const { data } = await api.get(`/getArtist.view`, { params: options });
  const { data: infoData } = await api.get(`/getArtistInfo2`, {
    params: { id: options.id, count: 15 },
  });

  const externalUrls = [];
  if (infoData?.artistInfo2?.lastFmUrl) {
    externalUrls.push({ name: 'Last.fm', url: infoData?.artistInfo2?.lastFmUrl });
  }

  if (infoData?.artistInfo2?.musicBrainzId) {
    externalUrls.push({
      name: 'Musicbrainz',
      url: `https://musicbrainz.org/artist/${infoData.artistInfo2.musicBrainzId}`,
    });
  }

  return normalizeArtist({
    ...data.artist,
    biography: infoData?.artistInfo2?.biography,
    externalUrls,
    externalImageUrl: infoData?.artistInfo2?.largeImageUrl,
    similarArtist: infoData?.artistInfo2?.similarArtist,
  });
};

export const getArtists = async (options: { musicFolderId?: string | number }) => {
  const { data } = await api.get(`/getArtists.view`, { params: options });
  const artists = ((data.artists?.index as SubsonicRawArtistIndex[]) || []).flatMap(
    (index) => index.artist ?? []
  );
  return (artists || []).map((entry) => normalizeArtist(entry));
};

export const getArtistSongs = async (options: { id: string }) => {
  const { data } = await api.get(`/getArtist.view`, { params: options });
  const albums = (data.artist.album || []) as SubsonicRawAlbum[];
  const CONCURRENCY = 5;
  const results: Array<{ data: { album?: { song?: SubsonicRawSong[] } } }> = [];

  for (let i = 0; i < albums.length; i += CONCURRENCY) {
    const chunk = albums.slice(i, i + CONCURRENCY);

    const chunkRes = await Promise.all(
      chunk.map((album) => api.get(`/getAlbum.view`, { params: { id: album.id } }))
    );
    results.push(...chunkRes);
  }

  return _.flatten(results.map((entry) => entry.data.album?.song ?? []) || []).map((entry) =>
    normalizeSong(entry)
  );
};

export const startScan = async () => {
  const { data } = await api.get(`/startScan.view`);
  return normalizeScanStatus(data.scanStatus);
};

export const getScanStatus = async () => {
  const { data } = await api.get(`/getScanStatus.view`);
  return normalizeScanStatus(data.scanStatus);
};

export const star = async (options: { id: string; type: string }) => {
  const { data } = await api.get(`/star.view`, {
    params: {
      id: options.type === 'music' ? options.id : undefined,
      albumId: options.type === 'album' ? options.id : undefined,
      artistId: options.type === 'artist' ? options.id : undefined,
    },
  });

  return data;
};

export const unstar = async (options: { id: string; type: string }) => {
  const { data } = await api.get(`/unstar.view`, {
    params: {
      id: options.type === 'music' ? options.id : undefined,
      albumId: options.type === 'album' ? options.id : undefined,
      artistId: options.type === 'artist' ? options.id : undefined,
    },
  });

  return data;
};

export const batchStar = async (options: { ids: string[]; type: string }) => {
  const idChunks = _.chunk(options.ids, 325);

  let idParam: string | undefined;
  switch (options.type) {
    case 'music':
      idParam = 'id';
      break;
    case 'album':
      idParam = 'albumId';
      break;
    case 'artist':
      idParam = 'artistId';
      break;
    default:
      break;
  }

  if (!idParam) return [];

  const res: unknown[] = [];
  for (let i = 0; i < idChunks.length; i += 1) {
    const params = new URLSearchParams();

    idChunks[i].forEach((id: string) => params.append(idParam, id));
    _.mapValues(getAuthParams(), (value: string, key: string) => {
      params.append(key, value);
    });

    res.push((await api.get(`/star.view`, { params })).data);
  }

  return res;
};

export const batchUnstar = async (options: { ids: string[]; type: string }) => {
  const idChunks = _.chunk(options.ids, 325);

  let idParam: string | undefined;
  switch (options.type) {
    case 'music':
      idParam = 'id';
      break;
    case 'album':
      idParam = 'albumId';
      break;
    case 'artist':
      idParam = 'artistId';
      break;
    default:
      break;
  }

  if (!idParam) return [];

  const res: unknown[] = [];
  for (let i = 0; i < idChunks.length; i += 1) {
    const params = new URLSearchParams();

    idChunks[i].forEach((id: string) => params.append(idParam, id));
    _.mapValues(getAuthParams(), (value: string, key: string) => {
      params.append(key, value);
    });

    res.push((await api.get(`/unstar.view`, { params })).data);
  }

  return res;
};

export const setRating = async (options: { ids: string[]; rating: number }) => {
  const promises = [];

  for (let i = 0; i < options.ids.length; i += 1) {
    promises.push(
      api.get(`/setRating.view`, { params: { id: options.ids[i], rating: options.rating } })
    );
  }

  const res = await Promise.all(promises);

  return res;
};

export const getSimilarSongs = async (options: { id: string; count: number }) => {
  const { data } = await api.get(`/getSimilarSongs2.view`, { params: options });
  return (_.uniqBy(data?.similarSongs2?.song, (e) => (e as SubsonicRawSong).id) || []).map(
    (entry) => normalizeSong(entry as SubsonicRawSong)
  );
};

export const getTopSongs = async (options: { artist: string; count: number }) => {
  const { data } = await api.get(`/getTopSongs.view`, { params: options });
  return (_.uniqBy(data?.topSongs?.song, (e) => (e as SubsonicRawSong).id) || []).map((entry) =>
    normalizeSong(entry as SubsonicRawSong)
  );
};

export const getSongsByGenre = async (
  options: {
    genre: string;
    size: number;
    offset: number;
    musicFolderId?: string | number;
    recursive?: boolean;
    totalSongs: number;
  },
  recursiveData: SubsonicRawSong[][] = []
): Promise<ReturnType<typeof normalizeAPIResult> | ReturnType<typeof normalizeSong>[]> => {
  if (options.recursive) {
    const songs = api
      .get(`/getSongsByGenre.view`, {
        params: {
          genre: options.genre,
          count: options.size,
          offset: options.offset,
          musicFolderId: options.musicFolderId,
        },
      })
      .then((res) => {
        if (
          !res.data.songsByGenre.song ||
          res.data.songsByGenre.song.length === 0 ||
          options.totalSongs <= 0
        ) {
          // Flatten and return once there are no more albums left
          const flattenedSongs = _.flatten(recursiveData);

          return normalizeAPIResult(
            (flattenedSongs || []).map((entry) => normalizeSong(entry)),
            flattenedSongs.length
          );
        }

        // On every iteration, push the existing songs and increase the offset
        recursiveData.push(res.data.songsByGenre.song);

        return getSongsByGenre(
          {
            genre: options.genre,
            size: options.size,
            offset: options.offset + options.size,
            musicFolderId: options.musicFolderId,
            recursive: true,
            totalSongs: options.totalSongs - options.size,
          },
          recursiveData
        );
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        throw err;
      });

    return songs;
  }

  const { data } = await api.get(`/getSongsByGenre.view`, { params: options });
  return (_.uniqBy(data?.songsByGenre?.song, (e) => (e as SubsonicRawSong).id) || []).map((entry) =>
    normalizeSong(entry as SubsonicRawSong)
  );
};

export const updatePlaylistSongs = async (options: { id: string; entry: { id: string }[] }) => {
  const playlistParams = new URLSearchParams();
  const songIds = _.map(options.entry, 'id');

  playlistParams.append('playlistId', options.id);
  songIds.map((songId: string) => playlistParams.append('songId', songId));
  _.mapValues(getAuthParams(), (value: string, key: string) => {
    playlistParams.append(key, value);
  });

  const { data } = await api.get(`/createPlaylist.view`, {
    params: playlistParams,
  });

  return data;
};

export const updatePlaylistSongsLg = async (options: { id: string; entry: { id: string }[] }) => {
  const entryIds = _.map(options.entry, 'id');

  // Set these in chunks so the api doesn't break
  // Testing on the airsonic api broke around ~350 entries
  const entryIdChunks = _.chunk(entryIds, 300);

  const res: unknown[] = [];
  for (let i = 0; i < entryIdChunks.length; i += 1) {
    const params = new URLSearchParams();

    params.append('playlistId', options.id);
    _.mapValues(getAuthParams(), (value: string, key: string) => {
      params.append(key, value);
    });

    for (let x = 0; x < entryIdChunks[i].length; x += 1) {
      params.append('songIdToAdd', String(entryIdChunks[i][x]));
    }

    const { data } = await api.get(`/updatePlaylist.view`, {
      params,
    });

    res.push(data);
  }

  return res;
};

export const deletePlaylist = async (options: { id: string }) => {
  const { data } = await api.get(`/deletePlaylist.view`, { params: { id: options.id } });
  return data;
};

export const createPlaylist = async (options: { name: string }) => {
  const { data } = await api.get(`/createPlaylist.view`, { params: options });
  return data;
};

export const updatePlaylist = async (options: {
  id: string;
  name: string;
  comment: string;
  isPublic: boolean;
}) => {
  const { data } = await api.get(`/updatePlaylist.view`, {
    params: {
      playlistId: options.id,
      name: options.name,
      comment: options.comment,
      public: options.isPublic,
    },
  });

  return data;
};

export const clearPlaylist = async (options: { id: string }) => {
  // Specifying the playlistId without any songs will empty the existing playlist
  const { data } = await api.get(`/createPlaylist.view`, {
    params: { playlistId: options.id, songId: '' },
  });

  return data;
};

export const getGenres = async () => {
  const { data } = await api.get(`/getGenres.view`);
  return ((data.genres.genre || []) as SubsonicRawGenre[]).map(normalizeGenre);
};

export const getSearch = async (options: {
  query: string;
  artistCount?: 0;
  artistOffset?: 0;
  albumCount?: 0;
  albumOffset?: 0;
  songCount?: 0;
  songOffset?: 0;
  musicFolderId?: string | number;
}) => {
  const { data } = await api.get(`/search3.view`, { params: options });

  return {
    artist: {
      data: ((data.searchResult3?.artist || []) as SubsonicRawArtist[]).map(normalizeArtist),
      nextCursor:
        data.searchResult3?.artist &&
        data.searchResult3.artist.length === options.artistCount &&
        (options.artistOffset || 0) + (options.artistCount || 0),
    },
    album: {
      data: ((data.searchResult3?.album || []) as SubsonicRawAlbum[]).map(normalizeAlbum),
      nextCursor:
        data.searchResult3?.album &&
        data.searchResult3.album.length === options.albumCount &&
        (options.albumOffset || 0) + (options.albumCount || 0),
    },
    song: {
      data: ((data.searchResult3?.song || []) as SubsonicRawSong[]).map(normalizeSong),
      nextCursor:
        data.searchResult3?.song &&
        data.searchResult3.song.length === options.songCount &&
        (options.songOffset || 0) + (options.songCount || 0),
    },
  };
};

export const getAllSongs = async (options: { offset: number; count: number }) => {
  const { data } = await api.get('/search3.view', {
    params: {
      query: '',
      songCount: options.count,
      songOffset: options.offset,
      artistCount: 0,
      albumCount: 0,
    },
  });
  const songs = ((data.searchResult3?.song || []) as SubsonicRawSong[]).map(normalizeSong);
  return { songs, total: null as number | null };
};

export const scrobble = async (options: { id: string; time?: number; submission?: boolean }) => {
  const { data } = await api.get(`/scrobble.view`, { params: options });
  return data;
};

export const getIndexes = async (options: {
  musicFolderId?: string | number;
  ifModifiedSince?: number;
}) => {
  const { data } = await api.get(`/getIndexes.view`, { params: options });

  const folders: ReturnType<typeof normalizeFolder>[] = [];
  ((data.indexes?.index as SubsonicRawArtistIndex[]) || []).forEach((entry) => {
    (entry.artist || []).forEach((folder) => {
      folders.push(normalizeFolder(folder));
    });
  });

  const child = ((data.indexes?.child || []) as SubsonicRawSong[]).map(normalizeSong);
  return [..._.flatten(folders), ...child];
};

export const getMusicFolders = async () => {
  const { data } = await api.get(`/getMusicFolders.view`);
  return ((data?.musicFolders?.musicFolder || []) as SubsonicRawFolder[]).map(normalizeFolder);
};

export const getMusicDirectory = async (options: { id: string }) => {
  const { data } = await api.get(`/getMusicDirectory.view`, { params: options });

  type DirChild = ReturnType<typeof normalizeFolder> | ReturnType<typeof normalizeSong>;
  const child: DirChild[] = [];
  const rawChildren = (data.directory?.child || []) as (SubsonicRawFolder & SubsonicRawSong)[];
  rawChildren
    .filter((entry) => entry.isDir)
    .forEach((folder) => child.push(normalizeFolder(folder)));
  rawChildren
    .filter((entry) => entry.isDir === false)
    .forEach((entry) => child.push(normalizeSong(entry)));

  return {
    ...data.directory,
    title: data.directory?.name,
    child,
  };
};

type MusicDirEntry = { isDir?: boolean; id: string };
type MusicDirResult = { child: MusicDirEntry[] };

export const getMusicDirectorySongs = async (
  options: { id: string },
  data: MusicDirResult[] = []
): Promise<MusicDirEntry[]> => {
  if (options.id === 'stop') {
    const songs: MusicDirEntry[] = [];

    (data || []).forEach((song) => {
      (song?.child || []).forEach((entry) => {
        if (entry.isDir === false) {
          songs.push(entry);
        }
      });
    });

    return songs;
  }
  const folders = getMusicDirectory({ id: options.id })
    .then(async (res) => {
      const dirResult = res as unknown as MusicDirResult;
      // If there are no more entries with isDir === true (folder), then return
      if (dirResult.child.filter((entry) => entry.isDir === true).length === 0) {
        // Add the last directory if there are no other directories
        data.push(dirResult);
        return getMusicDirectorySongs({ id: 'stop' }, data);
      }

      data.push(dirResult);
      const nestedFolders = dirResult.child.filter((entry) => entry.isDir === true);

      for (let i = 0; i < nestedFolders.length; i += 1) {
        await getMusicDirectorySongs({ id: nestedFolders[i].id }, data);
      }

      return getMusicDirectorySongs({ id: 'stop' }, data);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      throw err;
    });

  return folders;
};

export const getLyrics = async (options: { artist: string; title: string }) => {
  const { data } = await api.get(`/getLyrics.view`, { params: options });
  return data?.lyrics?.value;
};

export const getLyricsBySongId = async (options: { id: string }) => {
  const { data } = await api.get(`/getLyricsBySongId.view`, { params: options });
  const list = data?.lyricsList?.structuredLyrics;
  if (!list?.length) return null;
  // Prefer synced lyrics over unsynced
  return list.find((l: SubsonicRawLyrics) => l.synced) || list[0] || null;
};
