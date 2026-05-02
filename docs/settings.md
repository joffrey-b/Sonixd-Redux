# Settings Reference

Access settings via the **Config** icon in the sidebar. Settings are organized into six tabs.

---

## Playback

The Playback tab contains two sections: backend and playback options, and player behavior.

### Player Backend

| Option        | Description                                              |
| ------------- | -------------------------------------------------------- |
| Web (default) | Built-in Chromium audio engine                           |
| MPV           | External MPV process - see [MPV Backend](mpv-backend.md) |

### MPV Settings _(visible when MPV is selected)_

See [MPV Backend](mpv-backend.md) for full details.

| Setting         | Description                                                             |
| --------------- | ----------------------------------------------------------------------- |
| MPV Binary Path | Leave empty to use the system MPV. Set a full path for a custom install |
| Gapless Mode    | Weak (recommended), Yes, or No                                          |
| ReplayGain      | Off, Track, or Album                                                    |
| Audio Device    | Select the audio output device. Click Refresh to update the list        |

### Web Playback Settings _(visible when Web is selected)_

| Setting            | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| Crossfade Duration | Seconds before crossfading to the next track (0 = gapless) |
| Polling Interval   | Milliseconds between position polls (lower = smoother)     |
| Crossfade Type     | The fade curve used during crossfade                       |
| Volume Fade        | Whether the incoming track fades in from silence           |
| Audio Device       | Audio output device for the web player                     |
| Playback Presets   | One-click presets for Gapless or Fade configurations       |

### Player Behavior

| Setting                                 | Description                                                               |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Seek Forward                            | Number of seconds the seek forward button skips                           |
| Seek Backward                           | Number of seconds the seek backward button skips                          |
| Direct Previous Track                   | Previous button always goes to the previous song, never restarts          |
| Preserve Play Next Order                | Tracks added via Play Next queue in order rather than each at top         |
| Persist queue across sessions           | Restore the play queue when the app is reopened                           |
| Allow Transcoding                       | Request transcoded audio from the server _(Jellyfin only)_                |
| Global Media Hotkeys                    | Use your keyboard's media keys to control the player                      |
| Windows System Media Transport Controls | Integrate with Windows 10+ media controls in the taskbar _(Windows only)_ |

### Scrobble

| Setting            | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| Scrobble           | Enable sending playback events to your server               |
| Scrobble Threshold | Percentage of a track that must play before it is scrobbled |

See [Scrobbling](scrobbling.md) for more details.

### Track Filters

Track filters let you exclude songs from the queue based on a regex pattern applied to the song's filename or path. Useful for hiding interludes, skits, or other unwanted tracks.

- Click **Add** to create a new filter
- Each filter has a regex pattern and an **Enabled** toggle
- Filters are applied when songs are added to the queue

---

## Equalizer

See [Equalizer](equalizer.md) for full details on the 10-band graphic EQ and 6-band parametric EQ.

---

## Look & Feel

### Appearance

| Setting            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| Language           | Interface language (9 available)                      |
| Theme              | Application color theme                               |
| Font               | Application font                                      |
| Titlebar Style     | Native OS titlebar or custom (macOS/Windows style)    |
| Dynamic Background | Show a blurred version of the album art as background |
| Highlight On Hover | Highlight list rows on mouse hover                    |

### Window

| Setting               | Description                                             |
| --------------------- | ------------------------------------------------------- |
| Retain Window Size    | Remember window size and position between launches      |
| Default Window Width  | Default width in pixels when not retaining window size  |
| Default Window Height | Default height in pixels when not retaining window size |

### Navigation

| Setting                              | Description                                              |
| ------------------------------------ | -------------------------------------------------------- |
| Start page                           | Which page the app opens on at launch                    |
| Sidebar                              | Choose which items appear in the sidebar                 |
| Default to Album List on Artist Page | Show the album grid instead of top songs on artist pages |

### Library Defaults

| Setting            | Description                                            |
| ------------------ | ------------------------------------------------------ |
| Default Album Sort | Default sort order for the album list on startup       |
| Default Song Sort  | Default sort order for the song list _(Jellyfin only)_ |

### Grid View

| Setting        | Description                              |
| -------------- | ---------------------------------------- |
| Card Size      | Width of album/artist cards (100–350 px) |
| Gap Size       | Space between cards (0–100 px)           |
| Grid Alignment | Left or Center alignment                 |

### List View Layout Editor

Customize which columns appear in each list view (Songs, Albums, Playlists, Artists, Genres, Miniplayer) and their order. You can also set the row height and font size per view.

| Setting            | Description                                    |
| ------------------ | ---------------------------------------------- |
| Highlight On Hover | Highlight rows when the mouse hovers over them |

### Pagination

| Setting                 | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| Items per page (Songs)  | Number of songs shown per page                                              |
| Items per page (Albums) | Number of albums shown per page                                             |
| Server-side pagination  | Fetch pages from the server instead of paginating locally _(Jellyfin only)_ |

---

## Keyboard Shortcuts

See [Keyboard Shortcuts](keyboard-shortcuts.md) for the full list of shortcuts and how to customize them.

---

## System

The System tab combines server configuration, cache management, window behavior, and settings backup.

### Server

| Setting      | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| Media Folder | Filter the library to a specific media folder on your server |

> The filter can be applied selectively per section (Albums, Artists, Songs, etc.).

### Cache

| Setting        | Description                                              |
| -------------- | -------------------------------------------------------- |
| Song Cache     | Cache audio files locally for offline or faster playback |
| Image Cache    | Cache album art locally                                  |
| Cache Location | Folder where cached files are stored                     |
| Clear Cache    | Remove cached songs or images (by type)                  |

### Window

| Setting              | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| System Notifications | Show a system notification when the track changes                |
| Minimize to Tray     | Minimize to system tray instead of taskbar _(Windows/Linux)_     |
| Exit to Tray         | Close button sends to tray instead of quitting _(Windows/Linux)_ |

### Backup & Restore

Export your settings to a JSON file or restore from a previously exported file. Server credentials are **not** included in exports.

> After importing, the application reloads automatically.

---

## Integrations

### Discord Rich Presence

Show the currently playing song as your Discord status.

| Setting           | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| Rich Presence     | Enable or disable Discord Rich Presence                          |
| Discord Client ID | The Discord application ID used for Rich Presence                |
| Display Album Art | Fetch album art from iTunes and display it in the Discord status |

> The default Client ID uses the official Sonixd Redux Discord application. You can set your own if you have registered a custom Discord app.

### OBS Integration

Write currently playing track metadata to a file or a local webserver that OBS can read for overlays.

| Setting            | Description                                             |
| ------------------ | ------------------------------------------------------- |
| Mode               | **Local** (writes a file) or **Web** (runs a webserver) |
| Polling Interval   | How often metadata is updated (milliseconds)            |
| File Path          | Path to the output file _(Local mode)_                  |
| Tuna Webserver URL | URL of the Tuna OBS plugin webserver _(Web mode)_       |

---

## Version

The bottom of the Settings panel shows:

- Current installed version
- Latest available version (fetched from GitHub)
- Links to the GitHub releases page and changelog

If a newer version is available, a notification is shown automatically at launch.
