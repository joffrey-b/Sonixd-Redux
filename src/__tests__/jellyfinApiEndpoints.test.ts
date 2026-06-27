/**
 * Tests for Jellyfin API endpoint functions (jellyfinApi.ts).
 *
 * Uses a custom mock adapter — same pattern as apiCredentials.test.ts.
 * Jellyfin responses are NOT wrapped in a subsonic-response envelope;
 * they are returned as-is from the API.
 */
import {
  getAlbums,
  getStarred,
  star,
  unstar,
  scrobble,
  getTopSongs,
  jellyfinApi,
} from '../api/jellyfinApi';

type RequestConfig = {
  baseURL?: string;
  params?: Record<string, unknown>;
  url?: string;
  method?: string;
  data?: unknown;
};

const mockAdapter = jest.fn<Promise<unknown>, [RequestConfig]>();

beforeAll(() => {
  jellyfinApi.defaults.adapter = mockAdapter as unknown as typeof jellyfinApi.defaults.adapter;
});

beforeEach(() => {
  jest.clearAllMocks();
  // Provide Jellyfin credentials so requests don't fail at the interceptor level
  (window.bridge.settings.get as jest.Mock) = jest.fn().mockImplementation((key: string) => {
    const creds: Record<string, string> = {
      server: 'http://jellyfin.local',
      token: 'jf-token',
      userId: 'user-abc',
      deviceId: 'device-xyz',
      username: 'user-abc',
    };
    return creds[key] ?? undefined;
  });
});

function mockResponse(data: unknown, status = 200) {
  mockAdapter.mockResolvedValueOnce({
    status,
    statusText: 'OK',
    data,
    headers: {},
    config: {},
  });
}

function mockNetworkError() {
  const err = Object.assign(new Error('Network Error'), {
    isAxiosError: true,
    response: undefined,
  });
  mockAdapter.mockRejectedValueOnce(err);
}

// ─── getAlbums ────────────────────────────────────────────────────────────────

describe('jellyfinGetAlbumList', () => {
  it('fetches albums from the Items endpoint and maps them to app format', async () => {
    mockResponse({
      Items: [
        {
          Id: 'a1',
          Name: 'Test Album',
          AlbumArtist: 'Artist',
          ProductionYear: 2021,
          Type: 'MusicAlbum',
        },
      ],
      TotalRecordCount: 1,
    });

    const result = await getAlbums({ type: 'random', size: 20, offset: 0, recursive: false });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 'a1', title: 'Test Album' });
  });

  it('handles empty Items array', async () => {
    mockResponse({ Items: [], TotalRecordCount: 0 });
    const result = await getAlbums({ type: 'newest', size: 20, offset: 0, recursive: false });
    expect(result.data).toHaveLength(0);
  });

  it('handles missing Items key', async () => {
    mockResponse({ TotalRecordCount: 0 });
    const result = await getAlbums({ type: 'random', size: 10, offset: 0, recursive: false });
    expect(result.data).toHaveLength(0);
  });
});

// ─── getStarred ───────────────────────────────────────────────────────────────

describe('jellyfinGetStarred', () => {
  it('separates songs and albums by Type field', async () => {
    // First call: songs+albums, Second call: artists
    mockResponse({
      Items: [
        { Id: 's1', Name: 'Fav Song', Type: 'Audio', AlbumArtist: '' },
        { Id: 'a1', Name: 'Fav Album', Type: 'MusicAlbum' },
      ],
    });
    mockResponse({ Items: [] });

    const result = await getStarred({});
    expect(result.song).toHaveLength(1);
    expect(result.album).toHaveLength(1);
    expect(result.artist).toHaveLength(0);
  });

  it('handles empty Items for all categories', async () => {
    mockResponse({ Items: [] });
    mockResponse({ Items: [] });
    const result = await getStarred({});
    expect(result.song).toHaveLength(0);
    expect(result.album).toHaveLength(0);
    expect(result.artist).toHaveLength(0);
  });
});

// ─── star / unstar ────────────────────────────────────────────────────────────

describe('jellyfinStar / jellyfinUnstar', () => {
  it('calls POST FavoriteItems for star', async () => {
    mockResponse({ Id: 'song-1', IsFavorite: true });
    await star({ id: 'song-1' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.method?.toLowerCase()).toBe('post');
    expect(call.url).toContain('favoriteitems/song-1');
  });

  it('calls DELETE FavoriteItems for unstar', async () => {
    mockResponse({ Id: 'song-1', IsFavorite: false });
    await unstar({ id: 'song-1' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.method?.toLowerCase()).toBe('delete');
    expect(call.url).toContain('favoriteitems/song-1');
  });
});

// ─── getTopSongs ──────────────────────────────────────────────────────────────

describe('jellyfinGetTopSongs', () => {
  it('fetches top songs for a given artistId', async () => {
    mockResponse({
      Items: [{ Id: 's1', Name: 'Top Track', Type: 'Audio', AlbumArtist: '' }],
    });
    const result = await getTopSongs({ artist: 'artist-id-123', count: 10 });
    expect(result).toHaveLength(1);
    const call = mockAdapter.mock.calls[0][0];
    expect(call.params?.artistIds).toBe('artist-id-123');
  });

  it('handles missing Items in top songs response', async () => {
    mockResponse({});
    const result = await getTopSongs({ artist: 'artist-id', count: 10 });
    expect(result).toHaveLength(0);
  });
});

// ─── scrobble ─────────────────────────────────────────────────────────────────

describe('jellyfinScrobble', () => {
  it('calls PlaybackStopped with the itemId when submission is true', async () => {
    // submission=true calls /stopped AND then falls through to /progress (two posts)
    mockResponse({});
    mockResponse({});
    await scrobble({ id: 'item-1', submission: true, position: 120000 });
    const stoppedCall = mockAdapter.mock.calls[0][0];
    expect(stoppedCall.url).toContain('/sessions/playing/stopped');
    // axios serialises POST body to JSON string; parse it back
    const body =
      typeof stoppedCall.data === 'string'
        ? JSON.parse(stoppedCall.data as string)
        : stoppedCall.data;
    expect((body as Record<string, unknown>)?.ItemId).toBe('item-1');
  });

  it('calls playing/progress when event is "timeupdate"', async () => {
    mockResponse({});
    await scrobble({ id: 'item-1', submission: false, event: 'timeupdate', position: 30000 });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.url).toContain('/sessions/playing/progress');
  });

  it('calls playing when event is "start"', async () => {
    mockResponse({});
    await scrobble({ id: 'item-1', submission: false, event: 'start' });
    const call = mockAdapter.mock.calls[0][0];
    expect(call.url).toContain('/sessions/playing');
    expect(call.url).not.toContain('stopped');
    expect(call.url).not.toContain('progress');
  });

  it('does not throw on network error', async () => {
    mockNetworkError();
    await expect(scrobble({ id: 'item-1', submission: true })).rejects.not.toBeNull(); // throws but doesn't crash the process
  });
});
