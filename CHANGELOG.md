# Changelog

All notable changes to Sonixd Redux are documented here.

---

## [1.0.3]

### Added

- **Internet Radio** ([#10](https://github.com/joffrey-b/Sonixd-Redux/issues/10)): Play internet radio stations configured on your Navidrome server directly from a new sidebar entry. Stations appear with a play button and a link to their homepage. While playing, the player bar shows only play/pause and a LIVE indicator - stop, skip, seek, and scrobbling are disabled. Subsonic-based servers only - the entry is hidden for Jellyfin users.

### Fixed

- **Library sync timestamp not persisted**: The "Last synced" timestamp on the Smart Playlists page reset to blank on every app restart. It now persists across launches and appears immediately when the app opens.

---

## [1.0.2]

### Added

- **Artist Radio** ([#8](https://github.com/joffrey-b/Sonixd-Redux/issues/8)): One-click similar-artist mix from any artist page. Available as the wand (✦) button in the artist toolbar - replaces the queue with 50 similar songs and starts playback immediately.

- **Smart Playlists** ([#9](https://github.com/joffrey-b/Sonixd-Redux/issues/9)): Rule-based playlists stored locally. Filter by Genre, Year, Play Count, Rating, Starred, and Duration. Set sort order and a song limit. Save the result to your server as a static playlist snapshot. Accessible from the new Smart Playlists entry in the sidebar.

- **Library Cache**: Full local index of your library for accurate Smart Playlist filtering. Click **Sync Library** on the Smart Playlists page to index all songs. When active, all rules and sorting run against your entire library. The cache syncs automatically on every launch; play count, starred status, and rating are also kept up to date as you use the app.

### Fixed

- **App crash on offline server**: Albums, Songs, and Folders views crashed with a blank screen when the server was unreachable. They now show an error message instead.
- **Update notification cannot be dismissed**: The "new version available" toast had no visible close button. A Dismiss button is now shown alongside the GitHub link.
- "PLAYLIST" label on the playlist detail page now displays as "Playlist", consistent with the "Album" and "Artist" casing used elsewhere.

---

## [1.0.1]

### Added

- **Follow System theme** ([#6](https://github.com/joffrey-b/Sonixd-Redux/issues/6)): New "Follow System" option in the theme picker - automatically switches between Default Dark and Default Light based on your OS theme, with live switching when the OS theme changes. Selected by default on fresh installs.
- **Default Light theme** ([#5](https://github.com/joffrey-b/Sonixd-Redux/issues/5)): Completed the previously unfinished Default Light theme - player bar, sidebar, and title bar are now consistently light with dark text.
- **OLED Dark theme** ([#7](https://github.com/joffrey-b/Sonixd-Redux/issues/7)): New built-in theme for OLED displays - true black background so pixels are fully off, with the same blue accent as Default Dark.
- **Built-in theme updates**: Built-in themes are now always refreshed on startup, so theme improvements reach existing installs automatically.

### Changed

- **Settings export/import**: Built-in themes are excluded from exports and ignored on import - only your custom themes are transferred.

### Fixed

#### MPV

- **Single-song repeat track-skip bug** ([#1](https://github.com/joffrey-b/Sonixd-Redux/issues/1)): Double-clicking a new song after a looping single-song album was silently ignored.
- **Stop-after-current progress bar** ([#2](https://github.com/joffrey-b/Sonixd-Redux/issues/2)): After stopping at the end of a song, the progress bar showed the wrong elapsed time against the next song's duration.
- **Invalid MPV audio device on startup** ([#3](https://github.com/joffrey-b/Sonixd-Redux/issues/3)): Loading a saved audio device that no longer exists (e.g. after importing settings from another machine) caused MPV to rapidly skip through every track in the queue. The app now falls back to the default device automatically.
- **Invalid MPV audio device double notification** ([#3](https://github.com/joffrey-b/Sonixd-Redux/issues/3)): The "device unavailable" warning could appear twice on startup.
- **MPV mode interfering with web audio device selection** ([#3](https://github.com/joffrey-b/Sonixd-Redux/issues/3)): Using an invalid audio device while in MPV mode could cause the MPV device list to appear empty.

#### Audio device settings

- **Audio device warning repeated on every settings open** ([#4](https://github.com/joffrey-b/Sonixd-Redux/issues/4)): The "selected audio device is no longer available" warning appeared every time the Settings page was opened, even after being dismissed.
- **Audio device warning shown in MPV mode** ([#4](https://github.com/joffrey-b/Sonixd-Redux/issues/4)): The web audio device warning was incorrectly shown when using the MPV backend, where audio device selection works differently.

---

## [1.0.0]

### Added - New in Sonixd Redux

#### MPV Backend

- Alternative audio backend powered by [MPV](https://mpv.io/), selectable in Settings → Playback
- True gapless playback (`weak` mode recommended; `yes` and `no` also available)
- ReplayGain support (Off / Track / Album) using tags embedded in audio files
- Audio device selection independent from the Web backend
- Configurable MPV binary path (uses system MPV by default)
- Full EQ and parametric EQ support via MPV audio filter chain
- Seek, volume, mute, stop-after-current
- Fallback notification when MPV fails to start

#### Parametric Equalizer (PEQ)

- 10-band PEQ with per-band control: type (peaking, low shelf, high shelf, low pass, high pass, notch), frequency, gain, Q
- Preamp control
- Frequency response curve (SVG) showing the combined EQ shape in real time
- Custom presets: save, load, and delete named presets

#### Graphic EQ

- Added a 10-band graphic EQ
- Preamp control
- Custom presets: save, load, and delete named presets

#### Spectrogram

- Full-track spectrogram view: downloads and analyses the entire audio file, displays frequency vs. time with a colour-coded dB scale, labeled frequency and time axes, resizable window

#### Scrobbling

- Configurable scrobble threshold (percentage of track played before submitting)

#### Keyboard Shortcuts

- Fully customizable keyboard shortcuts
- Option for shortcuts to work when the window is not focused
- Global shortcuts for playback (play/pause, next, previous, volume, mute)

#### Other

- Sleep timer with custom time input and stop after current playing song
- Backup and restore settings (export/import as JSON)
- Play next behavior control
- Previous track behavior control
- Discord RPC shows album images, retrieved from iTunes
- Non-intrusive update notification on launch (checks GitHub releases)
- Lyrics: synced and unsynced lyrics support with click-on-text and zoom function
- Drag-and-drop: autoscroll, improved reordering, crash fixes
- Timestamp display improvements
- Translations updated for all 9 supported languages

---

## Base - Inherited from Sonixd

Sonixd Redux is based on [Sonixd](https://github.com/jeffvli/sonixd) by jeffvli, licensed under GPL-3.0.

The following features come from the original project:

- Subsonic and Jellyfin API support
- Music library browsing (albums, artists, genres, songs, folders, playlists)
- Web audio player with crossfade and gapless playback
- Queue management (shuffle, repeat, play next/later, drag & drop)
- Favorites, ratings, play counts
- Scrobbling (Last.fm via Navidrome/Jellyfin)
- Discord Rich Presence integration
- OBS integration
- Mini-player
- Multiple themes
- Sidebar customization
- Track filtering
- System tray support
- Global media hotkeys (Windows, macOS, Linux)
- i18n support (9 languages)
