# Changelog

All notable changes to Sonixd Redux are documented here.

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
