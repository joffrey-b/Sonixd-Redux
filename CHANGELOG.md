# Changelog

All notable changes to Sonixd Redux are documented here.

---

## [1.1.0]

This release covers a large body of work since the last public version, including
a significant security overhaul, a lot of upgrades underthe hood, a visual refresh, and a long list of bug fixes
across playback, scrobbling, and the interface.

## What's New

### Look and feel

- Refreshed the interface's underlying styling system. Most controls - checkboxes,
  dropdowns, number inputs, pickers, and the sidebar - now have more consistent
  hover, focus, and active-state highlighting in both light and dark themes.
- The parametric EQ graph is now taller and easier to read, with clearer frequency
  labels.
- The quick-search popup can now be pinned open, and its spacing and overflow
  behavior have been cleaned up.
- Deleting a playlist or smart playlist now always asks for confirmation first.
- The Delete button next to a saved EQ/PEQ preset now matches the styling of
  the Load button beside it.

### Library and caching

- The cached-songs and cached-images limits are now tracked and enforced
  separately, with the oldest files automatically cleared once a limit is reached.
  The limit is also now customizable.
  The cache is also reliably saved when you quit the app.
- Library cache updates (play counts, favorites, sync status) are noticeably
  faster, especially for large libraries.

## Bug Fixes

### Playback

- Fixed an issue where the MPV playback engine could fail to start for some
  Windows users.
- Fixed the MPV backend not being found automatically on Windows when the
  "MPV binary path" setting was left blank and MPV was installed in a folder
  with a space in its name (such as the default Program Files location),
  even though MPV was correctly available on your system PATH.
- Fixed playback sometimes not starting automatically when using the built-in
  (non-MPV) audio engine, due to an overly strict browser autoplay restriction.
- Reduced the number of simultaneous requests sent to your server when loading an
  artist's full discography, improving reliability on slower or more heavily
  loaded servers.
- Fixed synced lyrics (.lrc files) failing to load for certain timestamp formats
  or files containing a particular encoding marker.
- Fixed the app briefly freezing when opening the audio spectrogram view.

### Scrobbling / listen history

- Fixed scrobbles being submitted too early when crossfade was enabled, and added
  a consistent minimum-listen-time floor across all playback modes.

### Interface and stability

- Fixed a crash when clicking the info button on an artist's page.
- Fixed playback keyboard shortcuts (play/pause, next/previous track, volume,
  mute) stopping working after clicking the seek bar, the volume slider, or a
  song's rating stars, until clicking somewhere else first.
- Fixed the app showing a blank screen instead of recovering gracefully when an
  unexpected error occurred while rendering a page.
- Fixed misaligned table headers, missing row borders, and inconsistent hover
  highlighting in the song and album lists, particularly in the light theme.
- Fixed pagination controls not consistently enforcing list boundaries.
- Fixed a number of smaller layout issues across smart playlists, the lyrics
  view, the player bar, and the login screen.

### Settings

- Fixed some settings (such as "Allow dev console" and your sidebar
  customization) not actually taking effect after importing a settings
  backup or using "Reset to Defaults", even though the change was saved
  correctly.
- Fixed "Direct Previous Track" and "Preserve Play Next Order" in Playback
  settings sometimes appearing to do nothing when toggled, or appearing to
  flip on their own when a different nearby setting was changed. The
  setting itself was always being saved correctly - only the toggle's own
  display was failing to update.

## Security Improvements

- Significantly hardened how the app's interface communicates with the rest of
  the application, closing off an entire class of potential security issues
  related to that communication layer.
- Added protections to ensure cached files, downloads, and exported data can
  never be written outside of their intended folder.
- Improved how login credentials are stored - your password is only ever saved
  in plain form if you specifically enable the legacy authentication option for
  servers that require it.
- Added validation to several settings fields (custom background images, Discord
  integration, OBS overlay links, and external links opened from the app) to
  reject malformed or unexpected values before they're saved or used.
- Hardened the packaged application's runtime configuration to further reduce
  its attack surface.
- Fixed the "Allow dev console" setting not reliably controlling whether F12
  could open developer tools in the packaged app.

## Under the Hood

This release also updates many of the underlying frameworks and libraries the
app is built on. No action is needed on your part - listed for anyone curious
about what's changed beneath the surface:

- **Electron** (the framework that runs the app) updated from version 34 to 42,
  bringing the latest upstream security and stability fixes.
- **RSuite** (the UI component library behind most of the app's controls)
  updated from version 4 to version 6.
- **Babel** (the JavaScript build toolchain) updated to its latest release.
- **React** updated from version 18 to 19, and **React Router** from 5 to 7.
- The state management library (**Redux Toolkit**) updated from version 1 to 2.
- Replaced an older, no-longer-maintained date-handling library (Moment.js)
  with a modern, lighter-weight alternative (Day.js).
- The translation system (**i18next**) updated from version 21 to 26.
- The charting library used for the EQ graph, the search popup, the playlist
  virtualized lists, and several other smaller libraries throughout the app
  were all updated to their latest stable versions as well.
- Added 672 new automated unit and component tests (growing the suite from 1
  to 673) and a brand-new end-to-end test suite of 199 tests that exercises
  real user workflows against live servers, to catch regressions before they
  reach a release. All tests have to pass for the app to build.

## Upgrade Notes

Things users upgrading from a previous version should know:

- If you are upgrading from v1.0.7, your Smart Playlist library cache will be
  reset on first launch. Navigate to Smart Playlists → Sync Library to rebuild
  it. Your settings and credentials are preserved.
- If you previously connected using a plain username/password (legacy
  authentication) and are upgrading from v1.0.7, this update fixes an issue
  where your saved login could silently stop working after upgrading even though
  you were never logged out. No action should be needed - this is now detected
  and corrected automatically on first launch.
- If you had customized your 10-band parametric EQ, older 6-band EQ
  configurations are automatically migrated to the new 10-band layout, preserving
  your settings for any frequency band that exists in both.
- Newly added sidebar sections are added automatically without affecting any
  sidebar items you've already removed or reordered.
- Fixed a bug where upgrading from v1.0.7 (or earlier) could incorrectly
  restore the "Playlist List" sidebar item even if you'd deliberately removed
  it. If you'd hidden it before, it will stay hidden after this update.

---

## [1.0.8]

### Changed

- **Updated Electron runtime from 34 to 42**: The underlying Electron framework has been updated to version 42. This brings a more recent version of Chromium and Node.js, improving web standards support, performance, and stability.

### Security

- **Dependency security patches**: Several internal libraries used for server API communication and URL routing have been updated to address known security vulnerabilities. There is no change in behaviour.

---

## [1.0.7]

### Fixed

- **MPV double scrobble on manual song switch**: Switching to a new song by double-clicking while the current song had already passed the scrobble threshold caused the new song to be scrobbled immediately, and then again when it legitimately reached the threshold.

---

## [1.0.6]

### Added

- **Self-signed certificate support**: A new **Accept self-signed certificates** toggle on the login screen allows connecting to servers that use self-signed certificates not present in the system trust store. When enabled, certificate verification is disabled for API calls and audio streaming. A warning is shown when the toggle is active. This setting is intentionally excluded from settings exports and imports - it must be configured manually on each machine - to prevent it from silently carrying over to machines where certificate verification should remain enabled. For full details and security implications, see the [self-signed certificates documentation](https://joffrey-b.github.io/Sonixd-Redux/self-signed-certificates). Note: if your server uses a certificate signed by a private CA, the recommended approach is to import the CA into your system trust store instead - Sonixd Redux will then trust it automatically without needing this toggle.
- **Song caching for the MPV backend**: Song caching now works with the MPV backend. Songs are cached after they finish playing naturally, matching the behaviour of the web backend. Skipping a track before it ends does not cache it.

### Fixed

- **Cover art and song caching ignoring the OS certificate store**: Cover art and song caching previously used Node.js's HTTPS stack which does not use the OS certificate store on Windows and macOS, requiring certificate verification to be skipped entirely. Both now use Electron's Chromium-based network module, which uses the OS certificate store on all platforms and also respects the Accept self-signed certificates toggle.
- **Cache size sometimes showing 0 MB**: The cache size display in settings sometimes showed 0 MB regardless of how much was actually cached. The underlying library used to calculate directory sizes would abort on certain path formats, causing the entire calculation to fail silently. Replaced with a simpler implementation using Node.js built-ins that handles errors per file and is consistent across all platforms.
- **Empty cache directories created before login**: Empty `undefined` folder was created in the cache root on fresh installs, before any server was configured. When disconnecting from a server, empty `image` and `song` directories were created created in the cache root. These directories were harmless but cluttered the cache folder. They are no longer created.

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
