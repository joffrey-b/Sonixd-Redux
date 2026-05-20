# Changelog

All notable changes to Sonixd Redux are documented here.

---

## [1.0.5]

### Added

- **Podcast bookmarks**: Sonixd Redux now remembers where you left off in a podcast episode. When you pause and later return to the same episode, playback resumes from the saved position and a toast shows the time it is resuming from. Pressing stop or finishing an episode clears the bookmark so the next play starts from the beginning. Switching to another episode without pausing first preserves the bookmark from a previous pause (if existing), but doesn't create a new one on switch. Works with both the web and MPV backends. Subsonic-compatible servers only.

### Fixed

- **Sidebar entries missing after upgrading from an older version**: Upgrading from versions 1.0.0 through 1.0.3 to 1.0.4 caused most sidebar entries to disappear, leaving only the entries introduced in the version being upgraded to (Smart Playlists, Internet Radio, Podcasts). This affected fresh installs of 1.0.2 and 1.0.3 as well. The root cause was a migration that appended new entries to whatever list was on disk - but on installs where the sidebar had never been customised, the list was never written to disk, so the migration started from an empty list and only wrote the new entries. The sidebar settings page was one of the entries lost, making the issue difficult to resolve without editing the settings file manually. A versioned migration system now tracks which entries have been introduced to each install, and a one-time repair detects and corrects the corrupted state automatically on first launch of 1.0.5. User customisations (deliberately hidden entries) are preserved from 1.0.5 onwards.

---

## [1.0.4]

### Added

- **Podcasts** ([#11](https://github.com/joffrey-b/Sonixd-Redux/issues/11)): Browse podcast channels and play downloaded episodes from your server. Podcast-compatible servers (Subsonic servers that implement the podcast API) only. Episodes not yet downloaded to the server are listed with a disabled play button. Use your server's web interface to subscribe to feeds and download episodes. Podcast episodes are not scrobbled and do not show lyrics. If your server is a subsonic server with no podcast support, the podcast menu entry returns a friendly message.
  If you use the MPV backend, podcasts will play through MPV just like music. This works fine on most servers, but some servers (notably Airsonic-Advanced which I used during my tests) cannot efficiently handle MPV's connection behaviour and will spike to high CPU usage during playback or when switching episodes, which will cause playback issues. If you experience this, switch to the web backend for podcast playback.
  For more information, check out the [podcast documentation](https://joffrey-b.github.io/Sonixd-Redux/podcasts).

- **Jukebox mode** ([#12](https://github.com/joffrey-b/Sonixd-Redux/issues/12)): Control your server's audio output directly from Sonixd Redux. Music plays through speakers connected to your server instead of your local device - useful for home servers hooked up to an amplifier or speakers. Enable with the jukebox icon in the player bar (Subsonic-compatible servers only). All controls work remotely: play, pause, stop, next, previous, seek, volume, and shuffle. When active, the playback settings panel shows a notice that backend settings are not applicable - the server handles all audio.
  Full setup guide in the [jukebox mode documentation](https://joffrey-b.github.io/Sonixd-Redux/jukebox). It is highly recommended to read it as the setup might require specific configuration on your machine.

### Fixed

- **White flash on startup and login**: The app briefly displayed a white window before the interface appeared, both on launch and after logging into a server. The window now shows the correct background colour immediately - dark for dark themes, white for light themes - so there is no visible flash.
- **MPV previous track ignoring the 5-second rule**: In MPV mode, pressing previous always went to the previous track regardless of playback position. The expected behaviour is to restart the current track if more than 5 seconds have passed, and go to the previous track otherwise (configurable via the "Direct Previous Track" setting). This now works correctly in MPV mode, matching the web backend.
- **Previous track shortcut with empty queue**: Pressing the previous track keyboard shortcut when no queue was loaded incorrectly flipped the player status to "playing", causing the play/pause button to show a paused icon with no way to interact with it.
- **Next/previous keyboard shortcuts active during radio**: Pressing the next or previous keyboard shortcut while an internet radio station was playing caused unexpected behaviour. These shortcuts now do nothing during radio playback, matching the hidden state of the skip buttons in the player bar.
- **Toast notifications showing wrong plural**: Toast notifications showed "Playing 1 songs" and "Added 1 songs" instead of the correct singular forms. Toasts now correctly say "Playing 1 track" / "Added 1 track" for a single track and the plural form for more than one. The word "song" has also been replaced by "track" since podcasts are not songs. Non-English translations have also been updated.
- **Shuffle with a single song**: Enabling shuffle when only one song was in the queue caused the song to disappear from the now playing list.
- **Play queue restored across server switches**: When "Remember play queue" was enabled, the queue from a previous session was restored even after switching to a different server. The queue is now only restored when reconnecting to the same server it was saved from.
- **Discord rich presence error with internet radio**: Some radio stations have no duration metadata, which caused a Discord RPC validation error and broke rich presence for all subsequent tracks. Discord now correctly shows only a start time for radio stations, with no countdown.
- **MPV scrobbling broken on repeat**: When a song repeated (repeat one, or repeat all with a single song in the queue), only the first play was scrobbled. Subsequent plays of the same song are now scrobbled correctly. A song will also be scrobbled if you manually reset the player seek bar to the beginning and listen to said song until it reaches the configured scrobble threshold.
- **Toast notifications truncated**: Long toast messages were cut off with an ellipsis instead of wrapping to a new line.
- **Missing stylesheet console error**: A reference to an unused stylesheet (animate.min.css, inherited from the original Sonixd) caused a 404 error in the console on every launch. The reference has been removed.
- **Graphic EQ deprecation warning**: The vertical EQ sliders used a deprecated CSS property that browsers are phasing out. Replaced with the standardized equivalent, which was already present alongside it.

---

## [1.0.3]

### Added

- **Internet Radio** ([#10](https://github.com/joffrey-b/Sonixd-Redux/issues/10)): Play internet radio stations configured on your Navidrome server directly from a new sidebar entry. Stations appear with a play button and a link to their homepage. While playing, the player bar shows only play/pause and a LIVE indicator - stop, skip, seek, and scrobbling are disabled. Subsonic-based servers only - the entry is hidden for Jellyfin users.
  For more information, check out the [internet radio documentation](https://joffrey-b.github.io/Sonixd-Redux/internet-radio).

### Fixed

- **Library sync timestamp not persisted**: The "Last synced" timestamp on the Smart Playlists page reset to blank on every app restart. It now persists across launches and appears immediately when the app opens.

---

## [1.0.2]

### Added

- **Artist Radio** ([#8](https://github.com/joffrey-b/Sonixd-Redux/issues/8)): One-click similar-artist mix from any artist page. Available as the wand (✦) button in the artist toolbar - replaces the queue with 50 similar songs and starts playback immediately.
  For more information, check out the [artist radio documentation](https://joffrey-b.github.io/Sonixd-Redux/artist-radio).

- **Smart Playlists** ([#9](https://github.com/joffrey-b/Sonixd-Redux/issues/9)): Rule-based playlists stored locally. Filter by Genre, Year, Play Count, Rating, Starred, and Duration. Set sort order and a song limit. Save the result to your server as a static playlist snapshot. Accessible from the new Smart Playlists entry in the sidebar.
  For more information, check out the [smart playlists documentation](https://joffrey-b.github.io/Sonixd-Redux/smart-playlists).

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
