/**
 * Tests for Subsonic API endpoint functions (api.ts).
 *
 * Uses a custom mock adapter (identical approach to apiCredentials.test.ts) so
 * the request/response interceptors still run.  The response interceptor unwraps
 * the `subsonic-response` key, so every mock payload must be wrapped in
 * { 'subsonic-response': ... }.
 */
import {
  getAlbums,
  getStarred,
  star,
  unstar,
  setRating,
  getPlaylists,
  getPlaylist,
  getTopSongs,
  scrobble,
  getSearch,
  api,
} from '../api/api';

type RequestConfig = {
  baseURL?: string;
  params?: Record<string, unknown>;
  url?: string;
};

const mockAdapter = jest.fn<Promise<unknown>, [RequestConfig]>();

beforeAll(() => {
  api.defaults.adapter = mockAdapter as unknown as typeof api.defaults.adapter;
});

beforeEach(() => {
  jest.clearAllMocks();
});

function mockResponse(data: Record<string, unknown>, status = 200) {
  mockAdapter.mockResolvedValueOnce({
    status,
    statusText: 'OK',
    data: { 'subsonic-response': { status: 'ok', version: '1.16.1', ...data } },
    headers: {},
    config: {},
  });
}

// ─── getAlbums ────────────────────────────────────────────────────────────────

describe('getAlbums', () => {
  it('fetches albums with correct params and returns normalised data', async () => {
    mockResponse({
      albumList2: {
        album: [{ id: 'a1', name: 'First Album', artist: 'Artist', year: 2020 }],
      },
    });

    const result = await getAlbums({ type: 'newest', size: 20, offset: 0 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 'a1' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.url).toContain('getAlbumList2');
    expect(call.params?.type).toBe('newest');
  });

  it('returns empty array when response has no album key', async () => {
    mockResponse({ albumList2: {} });
    const result = await getAlbums({ type: 'random', size: 10, offset: 0 });
    expect(result.data).toHaveLength(0);
  });

  it('uses the type parameter correctly for alphabeticalByName', async () => {
    mockResponse({ albumList2: { album: [] } });
    await getAlbums({ type: 'alphabeticalByName', size: 50, offset: 0 });
    expect(mockAdapter.mock.calls[0][0].params?.type).toBe('alphabeticalByName');
  });
});

// ─── getStarred ───────────────────────────────────────────────────────────────

describe('getStarred', () => {
  it('returns starred songs, albums, and artists', async () => {
    mockResponse({
      starred2: {
        song: [{ id: 's1', title: 'Star Song', isDir: false }],
        album: [{ id: 'a1', name: 'Star Album' }],
        artist: [{ id: 'ar1', name: 'Star Artist' }],
      },
    });

    const result = await getStarred({});
    expect(result.song).toHaveLength(1);
    expect(result.album).toHaveLength(1);
    expect(result.artist).toHaveLength(1);
  });

  it('handles empty starred response gracefully', async () => {
    mockResponse({ starred2: { song: [], album: [], artist: [] } });
    const result = await getStarred({});
    expect(result.song).toHaveLength(0);
    expect(result.album).toHaveLength(0);
    expect(result.artist).toHaveLength(0);
  });

  it('handles missing arrays in starred2', async () => {
    mockResponse({ starred2: {} });
    const result = await getStarred({});
    expect(result.song).toHaveLength(0);
    expect(result.album).toHaveLength(0);
    expect(result.artist).toHaveLength(0);
  });
});

// ─── star / unstar ────────────────────────────────────────────────────────────

describe('star / unstar', () => {
  it('calls star endpoint with correct id param for music type', async () => {
    mockResponse({ status: 'ok' });
    await star({ id: 'song-1', type: 'music' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.url).toContain('star.view');
    expect(call.params?.id).toBe('song-1');
    expect(call.params?.albumId).toBeUndefined();
  });

  it('calls star endpoint with albumId for album type', async () => {
    mockResponse({ status: 'ok' });
    await star({ id: 'album-1', type: 'album' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.params?.albumId).toBe('album-1');
    expect(call.params?.id).toBeUndefined();
  });

  it('calls unstar endpoint with correct id param for music type', async () => {
    mockResponse({ status: 'ok' });
    await unstar({ id: 'song-2', type: 'music' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.url).toContain('unstar.view');
    expect(call.params?.id).toBe('song-2');
  });

  it('calls unstar with artistId for artist type', async () => {
    mockResponse({ status: 'ok' });
    await unstar({ id: 'artist-1', type: 'artist' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.params?.artistId).toBe('artist-1');
    expect(call.params?.id).toBeUndefined();
  });
});

// ─── setRating ────────────────────────────────────────────────────────────────

describe('setRating', () => {
  it('calls setRating endpoint with id and rating', async () => {
    mockResponse({ status: 'ok' });
    await setRating({ ids: ['song-1'], rating: 4 });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.url).toContain('setRating.view');
    expect(call.params?.rating).toBe(4);
  });

  it('calls setRating with rating 0 to clear', async () => {
    mockResponse({ status: 'ok' });
    await setRating({ ids: ['song-1'], rating: 0 });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.params?.rating).toBe(0);
  });

  it('sends one request per id in the ids array', async () => {
    mockResponse({ status: 'ok' });
    mockResponse({ status: 'ok' });
    await setRating({ ids: ['s1', 's2'], rating: 3 });
    expect(mockAdapter).toHaveBeenCalledTimes(2);
  });
});

// ─── getPlaylists / getPlaylist ───────────────────────────────────────────────

describe('getPlaylists', () => {
  it('fetches all playlists', async () => {
    mockResponse({
      playlists: {
        playlist: [{ id: 'pl1', name: 'My Playlist', owner: 'user', public: false, songCount: 10 }],
      },
    });
    const result = await getPlaylists();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'pl1', title: 'My Playlist' });
  });

  it('handles empty playlist list', async () => {
    mockResponse({ playlists: { playlist: [] } });
    const result = await getPlaylists();
    expect(result).toHaveLength(0);
  });

  it('handles missing playlist key in response', async () => {
    mockResponse({ playlists: {} });
    const result = await getPlaylists();
    expect(result).toHaveLength(0);
  });
});

describe('getPlaylist', () => {
  it('fetches a single playlist by id', async () => {
    mockResponse({
      playlist: {
        id: 'pl1',
        name: 'Favourites',
        owner: 'alice',
        public: true,
        songCount: 5,
        entry: [],
      },
    });
    const result = await getPlaylist({ id: 'pl1' });
    expect(result).toMatchObject({ id: 'pl1', title: 'Favourites' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.params?.id).toBe('pl1');
  });
});

// ─── getTopSongs ──────────────────────────────────────────────────────────────

describe('getTopSongs', () => {
  it('fetches top songs for a given artist', async () => {
    mockResponse({
      topSongs: {
        song: [{ id: 's1', title: 'Top Hit', isDir: false }],
      },
    });
    const result = await getTopSongs({ artist: 'Test Artist', count: 10 });
    expect(result).toHaveLength(1);
    const call = mockAdapter.mock.calls[0][0];
    expect(call.params?.artist).toBe('Test Artist');
    expect(call.params?.count).toBe(10);
  });

  it('returns empty array when topSongs is absent', async () => {
    mockResponse({});
    const result = await getTopSongs({ artist: 'Unknown', count: 5 });
    expect(result).toHaveLength(0);
  });

  it('returns empty array when topSongs.song is absent', async () => {
    mockResponse({ topSongs: {} });
    const result = await getTopSongs({ artist: 'Empty', count: 5 });
    expect(result).toHaveLength(0);
  });
});

// ─── scrobble ─────────────────────────────────────────────────────────────────

describe('scrobble', () => {
  it('calls the scrobble endpoint with id', async () => {
    mockResponse({ status: 'ok' });
    await scrobble({ id: 'song-1', submission: true });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.url).toContain('scrobble.view');
    expect(call.params?.id).toBe('song-1');
  });

  it('passes the submission flag', async () => {
    mockResponse({ status: 'ok' });
    await scrobble({ id: 'song-1', submission: false });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.params?.submission).toBe(false);
  });
});

// ─── getSearch ────────────────────────────────────────────────────────────────

describe('getSearch', () => {
  it('calls search3.view endpoint with correct query', async () => {
    mockResponse({
      searchResult3: { artist: [], album: [], song: [] },
    });
    await getSearch({ query: 'beethoven' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.url).toContain('search3.view');
    expect(call.params?.query).toBe('beethoven');
  });

  it('returns combined artist/album/song result structure', async () => {
    mockResponse({
      searchResult3: {
        artist: [{ id: 'ar1', name: 'Artist 1' }],
        album: [{ id: 'al1', name: 'Album 1' }],
        song: [{ id: 's1', title: 'Song 1', isDir: false }],
      },
    });
    const result = await getSearch({ query: 'test' });
    expect(result.artist.data).toHaveLength(1);
    expect(result.album.data).toHaveLength(1);
    expect(result.song.data).toHaveLength(1);
  });

  it('handles empty search results without throwing', async () => {
    mockResponse({ searchResult3: {} });
    const result = await getSearch({ query: 'no results' });
    expect(result.artist.data).toHaveLength(0);
    expect(result.album.data).toHaveLength(0);
    expect(result.song.data).toHaveLength(0);
  });
});
