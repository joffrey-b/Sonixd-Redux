# Changelog

All notable changes to Sonixd Redux are documented here.

---

## [1.0.1]

### Added

- **Follow System theme** ([#6](https://github.com/joffrey-b/Sonixd-Redux/issues/6)): New "Follow System" option at the top of the theme picker - automatically switches between Default Dark and Default Light based on the OS theme, with live switching when the OS theme changes. Selected by default on fresh installs.
- **Default Light theme** ([#5](https://github.com/joffrey-b/Sonixd-Redux/issues/5)): Completed the previously unfinished Default Light theme - player bar, sidebar, and title bar are now consistently light (`#E8E8EB` / `#DFDFE2`) with dark text to match the content area.
- **OLED Dark theme** ([#7](https://github.com/joffrey-b/Sonixd-Redux/issues/7)): New built-in theme designed for OLED displays - true black (`#000000`) page background so pixels are fully off, near-black surfaces for the player bar and sidebar, and the same blue accent (`#2196F3`) as Default Dark for primary elements, progress bars, and row selection.
- **Built-in theme enforcement** ([#5](https://github.com/joffrey-b/Sonixd-Redux/issues/5)): Built-in themes (`themesDefault`) are always overwritten on startup so theme fixes and additions reach existing installs automatically without requiring a reset.

### Changed

- **Settings export/import**: `themesDefault` is now excluded from exported files and ignored on import. Built-in themes are always managed by the app; only custom user themes (`themes`) are transferred.
- **CI**: Added `.gitlab-ci.yml` for local GitLab development runner (Windows, `shell` executor) - test job on every push, Windows `.exe` build job on tags.
- **CI**: Bumped Node.js from `20.x` to `24.x` across all GitHub Actions workflows and `package.json` engines field.

### Fixed

#### MPV

- **Single-song repeat track-skip bug** ([#1](https://github.com/joffrey-b/Sonixd-Redux/issues/1)): Double-clicking a new song after a single-song album had looped at least once was silently ignored. The `autoNextPendingRef` flag was left stuck `true` because the track-change effect never fired (same index and song ID - no dep change). Fixed by only arming the flag when the URL actually changes.
- **Stop-after-current progress bar** ([#2](https://github.com/joffrey-b/Sonixd-Redux/issues/2)): After stopping at the end of a song, the progress bar showed the elapsed time of the finished song against the duration of the next song (e.g. `3:51 ── 3:39`). Fixed by sending `player-seek-to 0` on stop-after-current, and by immediately syncing `renderer-player-current-time` from the main process on every seek (MPV does not emit `timeposition` events while paused).
- **Invalid MPV audio device on startup** ([#3](https://github.com/joffrey-b/Sonixd-Redux/issues/3)): When an unavailable `mpvAudioDeviceId` was loaded (e.g. after importing settings from another machine), MPV was initialized with the bad `--audio-device` flag and rapidly skipped through every track in the queue. Fixed by verifying the device immediately after MPV initializes - before loading the queue - and hot-swapping to `auto` if not found.
- **Invalid MPV audio device double toast** ([#3](https://github.com/joffrey-b/Sonixd-Redux/issues/3)): The "device unavailable" toast could fire twice due to a stale closure in `refreshMpvDevices`'s 2-second retry timer. Fixed with a ref that always reflects the latest device ID. The toast is now shown once by `MpvPlayer` at startup; `PlaybackConfig` silently clears any stale ID when settings are opened.
- **`setSinkId` called in MPV mode** ([#3](https://github.com/joffrey-b/Sonixd-Redux/issues/3)): The Web Audio `setSinkId` effect in `Player.tsx` ran regardless of backend, causing Chromium's audio device system to malfunction when an invalid `audioDeviceId` was present (e.g. imported from another machine), which in turn caused the MPV device list to appear empty. Fixed by guarding both `setSinkId` call sites with `!isMpv`.

#### Audio device settings

- **Web audio device toast repeated on every remount** ([#4](https://github.com/joffrey-b/Sonixd-Redux/issues/4)): When `audioDeviceId` referred to an unavailable device, the warning toast fired every time the Settings page was opened. Fixed by clearing the stale ID from Redux and the store when the toast fires, so the condition cannot be true again.
- **Web audio device toast in MPV mode** ([#4](https://github.com/joffrey-b/Sonixd-Redux/issues/4)): The "selected audio device is no longer available" toast was shown even when using the MPV backend, where `audioDeviceId` is irrelevant. Fixed with a `!isMpv` guard.

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
