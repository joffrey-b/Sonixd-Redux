import axios from 'axios';
import axiosRetry from 'axios-retry';
import _ from 'lodash';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid/non-secure';
import i18n from '../i18n/i18n';
import { handleDisconnect } from '../components/settings/DisconnectButton';
import { notifyToast } from '../components/shared/toast';
import { GenericItem, Item, Song } from '../types';
import { mockSettings } from '../shared/mockSettings';
import { settings } from '../components/shared/bridge';

interface JellyfinNameId {
  Id?: string;
  Name?: string;
  Url?: string;
}

interface JellyfinMediaSource {
  Id?: string;
  Size?: number;
  Container?: string;
  Bitrate?: number;
  Path?: string;
  ETag?: string;
}

interface JellyfinCoverArtItem {
  Id?: string;
  AlbumId?: string;
  ImageTags?: { Primary?: string };
  AlbumPrimaryImageTag?: string;
}

interface JellyfinSong extends JellyfinCoverArtItem {
  Id: string;
  ParentId?: string;
  IsFolder?: boolean;
  Name?: string;
  Album?: string;
  AlbumId?: string;
  ArtistItems?: JellyfinNameId[];
  AlbumArtists?: Array<{ Name?: string; Id?: string }>;
  IndexNumber?: number;
  ProductionYear?: number;
  GenreItems?: JellyfinNameId[];
  MediaSources?: JellyfinMediaSource[];
  RunTimeTicks?: number;
  DateCreated?: string;
  ParentIndexNumber?: number;
  UserData?: { PlayCount?: number; IsFavorite?: boolean };
}

interface JellyfinAlbum extends JellyfinCoverArtItem {
  Id: string;
  Name?: string;
  ArtistItems?: JellyfinNameId[];
  AlbumArtists?: Array<{ Name?: string; Id?: string }>;
  ChildCount?: number;
  RunTimeTicks?: number;
  DateCreated?: string;
  ProductionYear?: number;
  GenreItems?: JellyfinNameId[];
  UserData?: { IsFavorite?: boolean };
  song?: JellyfinSong[];
}

interface JellyfinArtist extends JellyfinCoverArtItem {
  Id: string;
  Name?: string;
  AlbumCount?: number;
  RunTimeTicks?: number;
  GenreItems?: JellyfinNameId[];
  Overview?: string;
  ExternalUrls?: JellyfinNameId[];
  UserData?: { IsFavorite?: boolean };
  similarArtist?: JellyfinArtist[];
  album?: JellyfinAlbum[];
}

interface JellyfinPlaylist extends JellyfinCoverArtItem {
  Id: string;
  Name?: string;
  Overview?: string;
  ChildCount?: number;
  RunTimeTicks?: number;
  DateCreated?: string;
  DateLastMediaAdded?: string;
  GenreItems?: JellyfinNameId[];
}

interface JellyfinGenre {
  Id?: string;
  Name?: string;
}

interface JellyfinFolder extends JellyfinCoverArtItem {
  Id: string;
  Name?: string;
  DateCreated?: string;
}

type JellyfinSortType = string;

interface NormalizedJellyfinArtist {
  id: string;
  title: string | undefined;
  albumCount: number | undefined;
  duration: number;
  genre: ReturnType<typeof normalizeItem>[] | undefined;
  image: string;
  starred: string | undefined;
  info: {
    biography: string | undefined;
    externalUrl: ReturnType<typeof normalizeItem>[];
    imageUrl: undefined;
    similarArtist: NormalizedJellyfinArtist[];
  };
  type: Item;
  uniqueId: string;
  album: ReturnType<typeof normalizeAlbum>[];
}

interface RawJellyfinCredentials {
  username?: string;
  token?: string;
  server?: string;
  deviceId?: string;
}

const deriveJellyfinCredentials = (raw: RawJellyfinCredentials) => ({
  username: String(raw.username || ''),
  token: String(raw.token || ''),
  server: String(raw.server || ''),
  deviceId: String(raw.deviceId || ''),
});

// transcode is intentionally not part of this — it's a live-changeable
// Settings -> Playback toggle (no reload involved), unlike the credential
// fields below, which only ever change via login/disconnect + reload. Reading
// it separately means toggling it takes effect immediately rather than only
// after the next credential-cache refresh.
const getTranscode = () =>
  process.env.NODE_ENV === 'test' ? mockSettings.transcode : Boolean(settings.get('transcode'));

// Synchronous per-field reads (one sendSync per field) — used as the
// getCachedJellyfinCredentials() fallback below, before its first
// refreshJellyfinCredentialCache() invoke resolves.
const getAuth = () =>
  deriveJellyfinCredentials({
    username: String(settings.get('username') || ''),
    token: String(settings.get('token') || ''),
    server: String(settings.get('server') || ''),
    deviceId: String(settings.get('deviceId') || ''),
  });

const getJellyfinCredentials = () => getAuth();

// Module-level cache for getStreamUrl/getCoverArtUrl — both build plain strings
// and are called synchronously throughout the renderer, often once per song
// (normalizeSong calls both for every song in every API response), so they
// can't await an IPC call. Populated lazily via invoke on first use; until that
// resolves, getCachedJellyfinCredentials() falls back to the same per-field
// synchronous reads getJellyfinCredentials() already does, so the very first
// call still returns a correct URL. Not a general credential cache — the axios
// request interceptor below deliberately stays off it, always awaiting a fresh
// bridge call for every single request.
//
// Cleared by clearCredentialCache(), called right before the page reload that
// already happens on both login and disconnect — there's no window where a
// stale cached value could be read, since the reload re-evaluates this module
// from scratch regardless.
let credentialCache: ReturnType<typeof deriveJellyfinCredentials> | null = null;
let credentialCacheRefreshing = false;

const refreshCredentialCache = () => {
  if (credentialCacheRefreshing) return;
  credentialCacheRefreshing = true;
  settings
    .getCredentials()
    .then((raw) => {
      credentialCache = deriveJellyfinCredentials(raw);
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

const getCachedJellyfinCredentials = () => {
  if (credentialCache) return credentialCache;
  refreshCredentialCache();
  return getJellyfinCredentials();
};

export const jellyfinApi = axios.create({
  baseURL: '',
});

jellyfinApi.interceptors.request.use(
  async (config) => {
    const raw = await settings.getCredentials();
    const { token, server } = deriveJellyfinCredentials(raw);
    config.baseURL = server;
    config.headers['X-MediaBrowser-Token'] = token;

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

jellyfinApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      notifyToast('warning', i18n.t('Session expired. Logging out.'));
      clearCredentialCache();
      handleDisconnect();
    }

    return Promise.reject(err);
  }
);

axiosRetry(jellyfinApi, {
  retries: 3,
  retryDelay: (retryCount) => {
    return retryCount * 1000;
  },
  retryCondition: axiosRetry.isNetworkError,
});

const getStreamUrl = (id: string, container: string, mediaSourceId: string, eTag: string) => {
  const { server, deviceId, token, username } = getCachedJellyfinCredentials();
  const transcode = getTranscode();
  if (!transcode) {
    return (
      `${server}/audio` +
      `/${id}` +
      `/stream${container ? `.${container}` : ''}` +
      `?static=true` +
      `&deviceId=${deviceId}` +
      `&mediaSourceId=${mediaSourceId}` +
      `&tag=${eTag}` +
      `&api_key=${token}`
    );
  }

  return (
    `${server}/audio` +
    `/${id}/universal` +
    `?userId=${username}` +
    `&deviceId=${deviceId}` +
    `&audioCodec=aac` +
    `&api_key=${token}` +
    `&playSessionId=${deviceId}` +
    `&container=opus,mp3,aac,m4a,m4b,flac,wav,ogg` +
    `&transcodingContainer=ts` +
    `&transcodingProtocol=hls`
  );
};

const getCoverArtUrl = (item: JellyfinCoverArtItem, size?: number) => {
  if (!item.ImageTags?.Primary && !item.AlbumPrimaryImageTag) {
    return 'img/placeholder.png';
  }

  const { server } = getCachedJellyfinCredentials();

  if (item.ImageTags?.Primary) {
    return (
      `${server}/Items` +
      `/${item.Id}` +
      `/Images/Primary` +
      (size ? `?width=${size}&height=${size}` : '?height=350') +
      `&quality=90`
    );
  }

  // Fall back to album art if no image embedded
  return (
    `${server}/Items` +
    `/${item.AlbumId}` +
    `/Images/Primary` +
    (size ? `?width=${size}&height=${size}` : '?height=350') +
    `&quality=90`
  );
};

export const getDownloadUrl = (options: { id: string }) => {
  const { server, token } = getJellyfinCredentials();
  return `${server}/items/${options.id}/download?api_key=${token}`;
};

const normalizeAPIResult = (items: unknown[], totalRecordCount?: number) => {
  return {
    data: items,
    totalRecordCount,
  };
};

const normalizeItem = (item: JellyfinNameId) => {
  return {
    id: item.Id || item.Url,
    title: item.Name,
  };
};

const normalizeSong = (item: JellyfinSong) => {
  return {
    id: item.Id,
    parent: item.ParentId,
    isDir: item.IsFolder,
    title: item.Name,
    album: item.Album,
    albumId: item.AlbumId,
    artist: (item.ArtistItems || []).map((entry) => normalizeItem(entry)),
    albumArtist: item.AlbumArtists && item.AlbumArtists[0]?.Name,
    albumArtistId: item.AlbumArtists && item.AlbumArtists[0]?.Id,
    track: item.IndexNumber,
    year: item.ProductionYear,
    genre: item.GenreItems && item.GenreItems.map((entry) => normalizeItem(entry)),
    albumGenre: item.GenreItems && item.GenreItems[0]?.Name,
    size: item.MediaSources && item.MediaSources[0]?.Size,
    contentType: undefined,
    suffix: item.MediaSources && item.MediaSources[0]?.Container,
    duration: (item.RunTimeTicks || 0) / 10000000,
    bitRate: item.MediaSources && Number(Math.trunc((item.MediaSources[0]?.Bitrate ?? 0) / 1000)),
    path: item.MediaSources && item.MediaSources[0]?.Path,
    playCount: item.UserData && item.UserData.PlayCount,
    discNumber: (item.ParentIndexNumber && item.ParentIndexNumber) || 1,
    created: item.DateCreated,
    streamUrl: getStreamUrl(
      item.MediaSources?.[0]?.Id ?? '',
      item.MediaSources?.[0]?.Container ?? '',
      item.MediaSources?.[0]?.Id ?? '',
      item.MediaSources?.[0]?.ETag ?? ''
    ),
    image: getCoverArtUrl(item, 150),
    starred: item.UserData && item.UserData.IsFavorite ? 'true' : undefined,
    type: Item.Music,
    uniqueId: nanoid(),
  };
};

const normalizeAlbum = (item: JellyfinAlbum) => {
  return {
    id: item.Id,
    title: item.Name,
    albumId: item.Id,
    artist: (item.ArtistItems || []).map((entry) => normalizeItem(entry)),
    albumArtist: item.AlbumArtists && item.AlbumArtists[0]?.Name,
    albumArtistId: item.AlbumArtists && item.AlbumArtists[0]?.Id,
    songCount: item.ChildCount,
    duration: (item.RunTimeTicks || 0) / 10000000,
    created: item.DateCreated,
    year: item.ProductionYear,
    genre: item.GenreItems && item.GenreItems.map((entry) => normalizeItem(entry)),
    albumGenre: item.GenreItems && item.GenreItems[0]?.Name,
    image: getCoverArtUrl(item),
    isDir: false,
    starred: item.UserData && item.UserData.IsFavorite ? 'true' : undefined,
    type: Item.Album,
    uniqueId: nanoid(),
    song: (item.song || []).map((entry) => normalizeSong(entry)),
  };
};

const normalizeArtist = (item: JellyfinArtist): NormalizedJellyfinArtist => {
  return {
    id: item.Id,
    title: item.Name,
    albumCount: item.AlbumCount,
    duration: (item.RunTimeTicks || 0) / 10000000,
    genre: item.GenreItems && item.GenreItems.map((entry) => normalizeItem(entry)),
    image: getCoverArtUrl(item),
    starred: item.UserData && item.UserData?.IsFavorite ? 'true' : undefined,
    info: {
      biography: item.Overview,
      externalUrl: (item.ExternalUrls || []).map((entry) => normalizeItem(entry)),
      imageUrl: undefined,
      similarArtist: (item.similarArtist || []).map((entry) => normalizeArtist(entry)),
    },
    type: Item.Artist,
    uniqueId: nanoid(),
    album: (item.album || []).map((entry) => normalizeAlbum(entry)),
  };
};

const normalizePlaylist = (item: JellyfinPlaylist) => {
  return {
    id: item.Id,
    title: item.Name,
    comment: item.Overview,
    owner: undefined,
    public: undefined,
    songCount: item.ChildCount,
    duration: (item.RunTimeTicks || 0) / 10000000,
    created: item.DateCreated,
    changed: item.DateLastMediaAdded,
    genre: item.GenreItems && item.GenreItems.map((entry) => normalizeItem(entry)),
    image: getCoverArtUrl(item, 350),
    type: Item.Playlist,
    uniqueId: nanoid(),
    song: [],
  };
};

const normalizeGenre = (item: JellyfinGenre) => {
  return {
    id: item.Id,
    title: item.Name,
    songCount: undefined,
    albumCount: undefined,
    type: Item.Genre,
    uniqueId: nanoid(),
  };
};

const normalizeFolder = (item: JellyfinFolder) => {
  return {
    id: item.Id,
    title: item.Name,
    created: item.DateCreated,
    isDir: true,
    image: getCoverArtUrl(item, 150),
    type: Item.Folder,
    uniqueId: nanoid(),
  };
};

const normalizeScanStatus = () => {
  return {
    scanning: false,
    count: 'N/a',
  };
};

export const getPlaylist = async (options: { id: string }) => {
  const { data } = await jellyfinApi.get(
    `/users/${getJellyfinCredentials().username}/items/${options.id}`,
    {
      params: {
        fields: 'Genres, DateCreated, MediaSources, ChildCount, ParentId',
        ids: options.id,
        userId: getJellyfinCredentials().username,
      },
    }
  );

  const { data: songData } = await jellyfinApi.get(`/Playlists/${options.id}/Items`, {
    params: {
      userId: getJellyfinCredentials().username,
      fields: 'Genres, DateCreated, MediaSources, UserData, ParentId',
    },
  });

  return {
    ...normalizePlaylist(data),
    songCount: songData.Items.length,
    song: ((songData.Items || []) as JellyfinSong[]).map(normalizeSong),
  };
};

export const getPlaylists = async () => {
  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      fields: 'Genres, DateCreated, ParentId, Overview', // Removed ChildCount until new Jellyfin releases includes optimization
      includeItemTypes: 'Playlist',
      recursive: true,
      sortBy: 'SortName',
      sortOrder: 'Ascending',
    },
  });

  return (_.filter(data.Items, (item) => item.MediaType === 'Audio') || []).map((entry) =>
    normalizePlaylist(entry)
  );
};

export const createPlaylist = async (options: { name: string }) => {
  const { data } = await jellyfinApi.post(`/playlists`, {
    Name: options.name,
    UserId: getJellyfinCredentials().username,
    MediaType: 'Audio',
  });

  return data;
};

export const updatePlaylistSongs = async (options: { name: string; entry: Song[] }) => {
  const entryIds = _.map(options.entry, 'id');

  const { data } = await jellyfinApi.post(`/playlists`, {
    Name: options.name,
    Ids: entryIds,
    UserId: getJellyfinCredentials().username,
    MediaType: 'Audio',
  });

  return { id: data.Id };
};

export const updatePlaylistSongsLg = async (options: { id: string; entry: Song[] }) => {
  const entryIds = _.map(options.entry, 'id');
  const entryIdChunks = _.chunk(entryIds, 200);

  const res: unknown[] = [];
  for (let i = 0; i < entryIdChunks.length; i += 1) {
    const ids = entryIdChunks[i].join(',');
    const { data } = await jellyfinApi.post(`/playlists/${options.id}/items`, null, {
      params: { Ids: ids },
    });
    res.push(data);
  }

  return res;
};

export const deletePlaylist = async (options: { id: string }) => {
  return jellyfinApi.delete(`/items/${options.id}`);
};

export const updatePlaylist = async (options: {
  id: string;
  name?: string;
  comment?: string;
  dateCreated?: string;
  genres: GenericItem[];
}) => {
  const genres = _.map(options.genres, 'title');

  return jellyfinApi.post(`/items/${options.id}`, {
    Name: options.name,
    Overview: options.comment,
    DateCreated: options.dateCreated,
    Genres: genres || [], // Required
    Tags: [], // Required
    PremiereDate: null, // Required
    ProviderIds: {}, // Required
  });
};

export const getAlbum = async (options: { id: string }) => {
  const { data } = await jellyfinApi.get(
    `/users/${getJellyfinCredentials().username}/items/${options.id}`,
    {
      params: { fields: 'Genres, DateCreated, ChildCount' },
    }
  );

  const { data: songData } = await jellyfinApi.get(
    `/users/${getJellyfinCredentials().username}/items`,
    {
      params: {
        fields: 'Genres, DateCreated, MediaSources, ParentId',
        parentId: options.id,
        sortBy: 'SortName',
      },
    }
  );

  return normalizeAlbum({ ...data, song: songData.Items });
};

export const getAlbums = async (options: {
  type: JellyfinSortType;
  size: number;
  offset: number;
  recursive: boolean;
  musicFolderId?: string;
}) => {
  const sortTypes = [
    { original: 'alphabeticalByName', replacement: 'SortName', sortOrder: 'Ascending' },
    { original: 'alphabeticalByArtist', replacement: 'AlbumArtist', sortOrder: 'Ascending' },
    { original: 'frequent', replacement: 'PlayCount', sortOrder: 'Ascending' },
    { original: 'random', replacement: 'Random', sortOrder: 'Ascending' },
    { original: 'newest', replacement: 'DateCreated', sortOrder: 'Descending' },
    { original: 'recent', replacement: 'DatePlayed', sortOrder: 'Descending' },
  ];

  const sortType = sortTypes.find((type) => type.original === options.type);

  if (options.recursive) {
    const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
      params: {
        fields: 'Genres, DateCreated, ChildCount, ParentId',
        genres: !sortType ? options.type : undefined,
        includeItemTypes: 'MusicAlbum',
        parentId: options.musicFolderId,
        recursive: true,
        sortBy: sortType ? sortType.replacement : 'SortName',
        sortOrder: sortType ? sortType.sortOrder : 'Ascending',
      },
    });

    return normalizeAPIResult(
      ((data.Items || []) as JellyfinAlbum[]).map(normalizeAlbum),
      data.TotalRecordCount
    );
  }

  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      fields: 'Genres, DateCreated, ChildCount, ParentId',
      genres: !sortType ? options.type : undefined,
      includeItemTypes: 'MusicAlbum',
      limit: options.size,
      startIndex: options.offset,
      parentId: options.musicFolderId,
      recursive: true,
      sortBy: sortType ? sortType.replacement : 'SortName',
      sortOrder: sortType ? sortType.sortOrder : 'Ascending',
    },
  });

  return normalizeAPIResult(
    ((data.Items || []) as JellyfinAlbum[]).map(normalizeAlbum),
    data.TotalRecordCount
  );
};

export const getSongs = async (options: {
  type: JellyfinSortType;
  size: number;
  offset: number;
  recursive: boolean;
  order: 'asc' | 'desc';
  musicFolderId?: string;
}) => {
  const sortTypes = [
    { original: 'alphabeticalByName', replacement: 'Name' },
    { original: 'alphabeticalByAlbum', replacement: 'Album' },
    { original: 'alphabeticalByArtist', replacement: 'AlbumArtist' },
    { original: 'alphabeticalByTrackArtist', replacement: 'Artist' },
    { original: 'frequent', replacement: 'PlayCount' },
    { original: 'random', replacement: 'Random' },
    { original: 'newest', replacement: 'DateCreated' },
    { original: 'recent', replacement: 'DatePlayed' },
    { original: 'year', replacement: 'PremiereDate' },
    { original: 'duration', replacement: 'Runtime' },
  ];

  const sortType = sortTypes.find((type) => type.original === options.type);

  if (options.recursive) {
    const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
      params: {
        fields: 'Genres, DateCreated, MediaSources, ParentId',
        genres: !sortType ? options.type : undefined,
        includeItemTypes: 'Audio',
        parentId: options.musicFolderId,
        recursive: true,
        sortBy: sortType ? sortType.replacement : 'SortName',
        sortOrder: options.order === 'asc' ? 'Ascending' : 'Descending',
        imageTypeLimit: 1,
        enableImageTypes: 'Primary',
      },
    });

    return normalizeAPIResult(
      ((data.Items || []) as JellyfinSong[]).map(normalizeSong),
      data.TotalRecordCount
    );
  }

  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      fields: 'Genres, DateCreated, MediaSources, ParentId',
      includeItemTypes: 'Audio',
      limit: options.size,
      startIndex: options.offset,
      parentId: options.musicFolderId,
      recursive: true,
      sortBy: sortType ? sortType.replacement : 'SortName',
      sortOrder: options.order === 'asc' ? 'Ascending' : 'Descending',
      imageTypeLimit: 1,
      enableImageTypes: 'Primary',
    },
  });

  return normalizeAPIResult(
    ((data.Items || []) as JellyfinSong[]).map(normalizeSong),
    data.TotalRecordCount
  );
};

export const getAllSongs = async (options: { offset: number; count: number }) => {
  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      fields: 'Genres, DateCreated, MediaSources, ParentId',
      includeItemTypes: 'Audio',
      limit: options.count,
      startIndex: options.offset,
      recursive: true,
      sortBy: 'SortName',
      sortOrder: 'Ascending',
      imageTypeLimit: 1,
      enableImageTypes: 'Primary',
    },
  });
  return {
    songs: ((data.Items || []) as JellyfinSong[]).map(normalizeSong),
    total: (data.TotalRecordCount as number) ?? null,
  };
};

export const getTopSongs = async (options: {
  artist: string;
  count: number;
  musicFolderId?: string;
}) => {
  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      artistIds: options.artist,
      fields: 'Genres, DateCreated, MediaSources, ParentId',
      includeItemTypes: 'Audio',
      limit: options.count,
      startIndex: 0,
      parentId: options.musicFolderId,
      recursive: true,
      sortBy: 'CommunityRating',
      sortOrder: 'Descending',
      imageTypeLimit: 1,
      enableImageTypes: 'Primary',
    },
  });

  return ((data.Items || []) as JellyfinSong[]).map(normalizeSong);
};

export const getArtist = async (options: { id: string; musicFolderId?: string }) => {
  const { data } = await jellyfinApi.get(
    `/users/${getJellyfinCredentials().username}/items/${options.id}`,
    {
      params: { fields: 'Genres' },
    }
  );
  const { data: albumData } = await jellyfinApi.get(
    `/users/${getJellyfinCredentials().username}/items`,
    {
      params: {
        artistIds: options.id,
        includeItemTypes: 'MusicAlbum',
        fields: 'AudioInfo, ParentId, Genres, DateCreated, ChildCount, ParentId',
        recursive: true,
        sortBy: 'SortName',
        parentId: options.musicFolderId,
      },
    }
  );

  const { data: similarData } = await jellyfinApi.get(`/artists/${options.id}/similar`, {
    params: {
      limit: 15,
      userId: getJellyfinCredentials().username,
      parentId: options.musicFolderId,
    },
  });

  return normalizeArtist({
    ...data,
    similarArtist: similarData.Items,
    album: albumData.Items,
  });
};

export const getArtists = async (options: { musicFolderId?: string }) => {
  const { data } = await jellyfinApi.get(`/artists/albumartists`, {
    params: {
      imageTypeLimit: 1,
      fields: 'Genres, ParentId',
      recursive: true,
      sortBy: 'SortName',
      sortOrder: 'Ascending',
      userId: getJellyfinCredentials().username,
      parentId: options.musicFolderId,
    },
  });

  return ((data.Items || []) as JellyfinArtist[]).map(normalizeArtist);
};

export const getArtistSongs = async (options: { id: string; musicFolderId?: string }) => {
  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      artistIds: options.id,
      fields: 'Genres, DateCreated, MediaSources, UserData, ParentId',
      includeItemTypes: 'Audio',
      recursive: true,
      sortBy: 'Album',
      parentId: options.musicFolderId,
    },
  });

  const entries = ((data.Items || []) as JellyfinSong[]).map(normalizeSong);

  // The entries returned by Jellyfin's API are out of their normal album order
  const entriesDescByYear = _.orderBy(
    entries || [],
    ['year', 'album', 'discNumber', 'track'],
    ['desc', 'asc', 'asc', 'asc']
  );

  return entriesDescByYear;
};

export const getRandomSongs = async (options: {
  size?: number;
  genre?: string;
  fromYear?: number;
  toYear?: number;
  musicFolderId?: string;
}) => {
  let { fromYear, toYear } = options;

  if (!options.fromYear && options.toYear) {
    fromYear = 1930;
  }

  if (options.fromYear && !options.toYear) {
    toYear = dayjs().year() + 1;
  }

  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      fields: 'Genres, DateCreated, MediaSources, UserData, ParentId',
      genres: options.genre,
      includeItemTypes: 'Audio',
      limit: options.size,
      recursive: true,
      sortBy: 'Random',
      years:
        fromYear != null && toYear != null ? _.range(fromYear, toYear + 1).join(',') : undefined,
      parentId: options.musicFolderId,
    },
  });

  return ((data.Items || []) as JellyfinSong[]).map(normalizeSong);
};

export const getStarred = async (options: { musicFolderId?: string }) => {
  const { data: songAndAlbumData } = await jellyfinApi.get(
    `/users/${getJellyfinCredentials().username}/items`,
    {
      params: {
        fields: 'Genres, DateCreated, MediaSources, ChildCount, UserData, ParentId',
        includeItemTypes: 'MusicAlbum, Audio',
        isFavorite: true,
        recursive: true,
        parentId: options.musicFolderId,
      },
    }
  );

  const { data: artistData } = await jellyfinApi.get(`/artists`, {
    params: {
      fields: 'Genres, ParentId',
      imageTypeLimit: 1,
      recursive: true,
      sortBy: 'SortName',
      sortOrder: 'Ascending',
      isFavorite: true,
      userId: getJellyfinCredentials().username,
      parentId: options.musicFolderId,
    },
  });

  const allItems = (songAndAlbumData.Items || []) as Array<
    JellyfinAlbum & JellyfinSong & { Type?: string }
  >;
  return {
    album: allItems.filter((d) => d.Type === 'MusicAlbum').map(normalizeAlbum),
    song: allItems.filter((d) => d.Type === 'Audio').map(normalizeSong),
    artist: ((artistData.Items || []) as JellyfinArtist[]).map(normalizeArtist),
  };
};

export const star = async (options: { id: string }) => {
  const { data } = await jellyfinApi.post(
    `/users/${getJellyfinCredentials().username}/favoriteitems/${options.id}`
  );
  return data;
};

export const unstar = async (options: { id: string }) => {
  const { data } = await jellyfinApi.delete(
    `/users/${getJellyfinCredentials().username}/favoriteitems/${options.id}`
  );
  return data;
};

export const batchStar = async (options: { ids: string[] }) => {
  const promises = [];
  for (let i = 0; i < options.ids.length; i += 1) {
    promises.push(star({ id: options.ids[i] }));
  }

  const res = await Promise.all(promises);

  return res;
};

export const batchUnstar = async (options: { ids: string[] }) => {
  const promises = [];
  for (let i = 0; i < options.ids.length; i += 1) {
    promises.push(unstar({ id: options.ids[i] }));
  }

  const res = await Promise.all(promises);

  return res;
};

export const getSimilarSongs = async (options: {
  id: string;
  count: number;
  musicFolderId?: string;
}) => {
  const { data } = await jellyfinApi.get(`/items/${options.id}/instantmix`, {
    params: {
      userId: getJellyfinCredentials().username,
      fields: 'Genres, DateCreated, MediaSources, UserData, ParentId',
      parentId: options.musicFolderId,
      limit: options.count || 100,
    },
  });

  return ((data.Items || []) as JellyfinSong[]).map(normalizeSong);
};

export const getSongsByGenre = async (options: {
  genre: string;
  size: number;
  offset: number;
  musicFolderId?: string | number;
  recursive?: boolean;
}) => {
  if (options.recursive) {
    const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
      params: {
        fields: 'Genres, DateCreated, MediaSources, UserData, ParentId',
        genres: options.genre,
        recursive: true,
        includeItemTypes: 'Audio',
        StartIndex: 0,
      },
    });

    const entries = ((data.Items || []) as JellyfinSong[]).map(normalizeSong);

    return normalizeAPIResult(
      _.orderBy(entries || [], ['album', 'track'], ['asc', 'asc']),
      data.TotalRecordCount
    );
  }

  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      fields: 'Genres, DateCreated, MediaSources, UserData, ParentId',
      genres: options.genre,
      recursive: true,
      includeItemTypes: 'Audio',
      limit: options.size || 100,
      startIndex: options.offset,
    },
  });

  const entries = ((data.Items || []) as JellyfinSong[]).map(normalizeSong);

  return normalizeAPIResult(
    _.orderBy(entries || [], ['album', 'track'], ['asc', 'asc']),
    data.TotalRecordCount
  );
};

export const getGenres = async (options: { musicFolderId?: string }) => {
  const { data } = await jellyfinApi.get(`/musicgenres`, {
    params: { parentId: options.musicFolderId },
  });
  return ((data.Items || []) as JellyfinGenre[]).map(normalizeGenre);
};

export const getIndexes = async () => {
  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`);
  return ((data.Items || []) as JellyfinFolder[]).map(normalizeFolder);
};

export const getMusicDirectory = async (options: { id: string }) => {
  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      parentId: options.id,
      fields: 'Genres, DateCreated, MediaSources, UserData, ParentId',
      sortBy: 'SortName',
      sortOrder: 'Ascending',
    },
  });

  const { data: parentData } = await jellyfinApi.get(
    `/users/${getJellyfinCredentials().username}/items/${options.id}`
  );

  type JellyfinDirItem = JellyfinFolder & JellyfinSong & { Type?: string };
  const dirItems = (data.Items || []) as JellyfinDirItem[];
  const folders = dirItems.filter((entry) => entry.Type !== 'Audio');
  const songs = dirItems.filter((entry) => entry.Type === 'Audio');

  return {
    id: parentData?.Id,
    title: parentData?.Name || 'Unknown folder',
    parent: parentData?.ParentId,
    child: [
      ...folders.map((entry) => normalizeFolder(entry)),
      ...songs.map((entry) => normalizeSong(entry)),
    ],
  };
};

export const getMusicDirectorySongs = async (options: { id: string }) => {
  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
    params: {
      excludeItemTypes: 'MusicAlbum, MusicArtist, Folder',
      fields: 'Genres, DateCreated, MediaSources, UserData, ParentId',
      recursive: true,
      parentId: options.id,
    },
  });

  const entries = ((data.Items || []) as JellyfinSong[]).map(normalizeSong);

  // The entries returned by Jellyfin's API are out of their normal album order
  const entriesByAlbum = _.orderBy(
    entries || [],
    ['album', 'discNumber', 'track'],
    ['asc', 'asc', 'asc']
  );

  return entriesByAlbum;
};

export const getMusicFolders = async () => {
  const { data } = await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`);
  return ((data.Items || []) as JellyfinFolder[]).map(normalizeFolder);
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
  const songs =
    options.songCount !== 0 &&
    (
      await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
        params: {
          fields: 'Genres, DateCreated, MediaSources, ParentId',
          includeItemTypes: 'Audio',
          includeArtists: false,
          includeGenres: false,
          includeMedia: false,
          includeStudios: false,
          limit: options.songCount,
          startIndex: options.songOffset,
          parentId: options.musicFolderId,
          recursive: true,
          searchTerm: options.query,
        },
      })
    )?.data;

  const albums =
    options.albumCount !== 0 &&
    (
      await jellyfinApi.get(`/users/${getJellyfinCredentials().username}/items`, {
        params: {
          fields: 'Genres, DateCreated, ChildCount, ParentId',
          includeItemTypes: 'MusicAlbum',
          includeArtists: false,
          includeGenres: false,
          includeMedia: false,
          includeStudios: false,
          limit: options.albumCount,
          startIndex: options.albumOffset,
          parentId: options.musicFolderId,
          recursive: true,
          searchTerm: options.query,
        },
      })
    )?.data;

  const artists =
    options.artistCount !== 0 &&
    (
      await jellyfinApi.get(`/artists`, {
        params: {
          fields: 'Genres, ParentId',
          limit: options.artistCount,
          startIndex: options.artistOffset,
          parentId: options.musicFolderId,
          searchTerm: options.query,
          imageTypeLimit: 1,
          recursive: true,
          userId: getJellyfinCredentials().username,
        },
      })
    )?.data;

  return {
    artist: {
      data: ((artists?.Items || []) as JellyfinArtist[]).map(normalizeArtist),
      nextCursor:
        (options.artistCount || 0) + (options.artistOffset || 0) < artists?.TotalRecordCount &&
        (options.artistCount || 0) + (options.artistOffset || 0),
    },
    album: {
      data: ((albums?.Items || []) as JellyfinAlbum[]).map(normalizeAlbum),
      nextCursor:
        (options.albumCount || 0) + (options.albumOffset || 0) < albums?.TotalRecordCount &&
        (options.albumCount || 0) + (options.albumOffset || 0),
    },
    song: {
      data: ((songs?.Items || []) as JellyfinSong[]).map(normalizeSong),
      nextCursor:
        (options.songCount || 0) + (options.songOffset || 0) < songs?.TotalRecordCount &&
        (options.songCount || 0) + (options.songOffset || 0),
    },
  };
};

export const scrobble = async (options: {
  id: string;
  submission: boolean;
  position?: number;
  event?: 'pause' | 'unpause' | 'timeupdate' | 'start';
}) => {
  if (options.submission) {
    // Checked by jellyfin-plugin-lastfm for whether or not to send the "finished" scrobble (uses PositionTicks)
    await jellyfinApi.post(`/sessions/playing/stopped`, {
      ItemId: options.id,
      IsPaused: true,
      PositionTicks: options.position && Math.round(options.position),
    });
  }

  if (options.event) {
    if (options.event === 'start') {
      return jellyfinApi.post(`/sessions/playing`, {
        ItemId: options.id,
        PositionTicks: options.position && Math.round(options.position),
      });
    }

    return jellyfinApi.post(`/sessions/playing/progress`, {
      ItemId: options.id,
      EventName: options.event,
      IsPaused: options.event === 'pause',
      PositionTicks: options.position && Math.round(options.position),
    });
  }

  return jellyfinApi.post(`/sessions/playing/progress`, {
    ItemId: options.id,
    PositionTicks: options.position && Math.round(options.position),
  });
};

export const startScan = async (options: { musicFolderId?: string }) => {
  if (options.musicFolderId) {
    return jellyfinApi.post(`/items/${options.musicFolderId}/refresh`, {
      Recursive: true,
      ImageRefreshMode: 'Default',
      ReplaceAllImages: false,
      ReplaceAllMetadata: false,
    });
  }

  return jellyfinApi.post(`/library/refresh`);
};

export const getScanStatus = async () => {
  return normalizeScanStatus();
};
