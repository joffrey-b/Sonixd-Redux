// Test server configuration
export const SERVERS = {
  navidrome: {
    url: 'http://localhost:4533',
    username: 'admin',
    password: 'admin',
    type: 'subsonic' as const,
  },
  jellyfin: {
    url: 'http://localhost:8096',
    username: 'admin',
    password: 'admin',
    type: 'jellyfin' as const,
  },
} as const;

// Navidrome reachable over HTTPS through the nginx-tls proxy (e2e/nginx-tls.conf),
// terminating TLS with the self-signed cert from e2e/scripts/setup-tls.sh. Reuses
// the same Navidrome instance/credentials as SERVERS.navidrome above.
export const SERVERS_HTTPS = {
  navidrome: {
    url: 'https://localhost:4534',
    username: 'admin',
    password: 'admin',
  },
} as const;

// Track metadata — must match the actual tags in e2e/test-music/
export const TRACKS = {
  track01: {
    title: 'Test Track 01',
    artist: 'Test Artist',
    album: 'Test Album',
    track: 1,
    genre: 'Electronic',
    year: 2024,
    filename: 'track-01.flac',
    durationSeconds: 62,
  },
  track02: {
    title: 'Test Track 02',
    artist: 'Test Artist',
    album: 'Test Album',
    track: 2,
    genre: 'Electronic',
    year: 2024,
    filename: 'track-02.flac',
    durationSeconds: 62,
  },
  track03: {
    title: 'Test Track 03',
    artist: 'Test Artist',
    album: 'Test Album',
    track: 3,
    genre: 'Electronic',
    year: 2024,
    filename: 'track-03.flac',
    durationSeconds: 62,
  },
  soloTrack: {
    title: 'Solo Track',
    artist: 'Solo Artist',
    album: 'Solo Album',
    track: 1,
    genre: 'Electronic',
    year: 2024,
    filename: 'track-04.flac',
    durationSeconds: 62,
  },
  jazzTrack: {
    title: 'Jazz Track',
    artist: 'Jazz Artist',
    album: 'Jazz Album',
    track: 1,
    genre: 'Jazz',
    year: 2024,
    filename: 'track-05.flac',
    durationSeconds: 62,
  },
} as const;

// All Electronic-genre track titles (tracks 01-04)
export const ELECTRONIC_TRACK_TITLES = [
  TRACKS.track01.title,
  TRACKS.track02.title,
  TRACKS.track03.title,
  TRACKS.soloTrack.title,
] as const;

// The actual default scrobble threshold from setDefaultSettings.ts
const DEFAULT_SCROBBLE_THRESHOLD = 90;

// The scrobble fires at max(30s, threshold% × track duration).
// Add a 10s buffer for CI runner overhead and MPV startup lag.
export const SCROBBLE_WAIT_MS =
  Math.max(30_000, (DEFAULT_SCROBBLE_THRESHOLD / 100) * TRACKS.track01.durationSeconds * 1000) +
  10_000;

// Keep SCROBBLE_MIN_SECONDS as a seconds alias for readability in tests
export const SCROBBLE_MIN_SECONDS = Math.ceil(SCROBBLE_WAIT_MS / 1000);

// Created in e2e/scripts/setup-navidrome.sh via createInternetRadioStation.view.
// A real station rather than a synthetic one — see the comment there for why.
export const RADIO_STATION = {
  name: 'La grosse radio metal',
  homepageUrl: 'https://www.lagrosseradio.com/',
  streamUrl: 'https://hd.lagrosseradio.info/lagrosseradio-metal-192.mp3',
} as const;

// Imported via e2e/test-music/Imported Mix.m3u, picked up by the explicit
// rescan in setup-navidrome.sh (the automatic @startup scan runs before the
// admin user exists, so the playlist needs that second, post-admin scan to
// be attributed/imported at all). Spans 3 different artists/albums — same
// mixed-anchor falsifiability used for sort/limit tests elsewhere this
// session.
export const IMPORTED_PLAYLIST = {
  name: 'Imported Mix',
  trackTitles: [TRACKS.track01.title, TRACKS.soloTrack.title, TRACKS.jazzTrack.title],
} as const;
