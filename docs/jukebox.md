# Jukebox Mode

Jukebox mode lets you output music directly on your server machine. Instead of streaming audio to your computer, Sonixd Redux sends commands to the server and the server plays the music through its own audio hardware - useful for home servers connected to speakers or amplifiers.

---

## Server compatibility

| Server              | Supported |
| ------------------- | --------- |
| Navidrome           | ✓ Yes     |
| Airsonic-Advanced   | ✓ Yes     |
| Subsonic (original) | ✓ Yes     |
| Jellyfin            | ✗ No      |

---

## Setting up jukebox mode

- To setup jukebox mode, refer to your server's documentation.

### Audio output on Linux servers

Servers that use MPV for jukebox playback try PipeWire first, then fall back to ALSA. On a headless server, PipeWire is usually not running, so you may see this in the logs:

```
mpv: pw.conf: can't load config client.conf: No such file or directory
```

This is not fatal - MPV will fall back to ALSA automatically. To silence the warnings you can install PipeWire, or configure your server to use ALSA explicitly (see your server's documentation for how to specify the MPV audio device). Run `mpv --audio-device=help` on the server to list available devices.

The service user running your server also needs permission to access the audio hardware. Add it to the `audio` group:

```bash
sudo usermod -a -G audio <service-user>
sudo systemctl restart <service-name>
```

Also make sure the ALSA channels are not muted on the server. On a fresh server install all channels default to muted:

```bash
sudo apt install alsa-utils   # if not already installed
amixer -c 0 sset Master 80% unmute
amixer -c 0 sset PCM 80% unmute
```

### Admin access required

Some servers (including Navidrome) restrict jukebox access to admin accounts by default. Make sure the credentials configured in Sonixd Redux have the necessary permissions on your server.

---

## Navidrome setup example (Debian, systemd)

This is a complete working example for Navidrome running as a systemd service on a headless Debian server.

### 1. Enable jukebox in `navidrome.toml`

```toml
Jukebox.Enabled = true
MPVCmdTemplate = "mpv --audio-device=alsa/plughw:CARD=PCH,DEV=0 --no-audio-display --pause %f --input-ipc-server=%s"
```

The `MPVCmdTemplate` bypasses ALSA's `default` device, which on Debian 13 is routed through the PipeWire ALSA plugin and fails when no user audio session is running. Replace `plughw:CARD=PCH,DEV=0` with the device matching your hardware - run `mpv --audio-device=help` to list options. `DEV=0` is typically the analog rear jack; `DEV=3` and `DEV=7` are HDMI outputs.

### 2. Add the service user to the `audio` group

```bash
sudo usermod -a -G audio navidrome
```

### 3. Remove device access restrictions from the systemd service

The default Navidrome systemd service file may contain `DeviceAllow` or `DevicePolicy` lines that prevent MPV from accessing the audio hardware. Edit the service:

```bash
sudo systemctl edit navidrome --full
```

Remove any `DeviceAllow=` and `DevicePolicy=` lines, then reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart navidrome
```

### 4. Unmute ALSA

Headless Debian servers ship with all audio channels muted:

```bash
sudo apt install alsa-utils
amixer -c 0 sset Master 80% unmute
amixer -c 0 sset PCM 80% unmute
```

### 5. Use an admin account

Navidrome restricts jukebox access to admin accounts by default (`Jukebox.AdminOnly = true`). Make sure the credentials in Sonixd Redux belong to a Navidrome admin user, or change the value to false.

---

## Enabling jukebox mode in Sonixd Redux

Click the **jukebox icon** (🎵) in the player controls bar. It appears only when connected to a Subsonic-compatible server.

- If jukebox is available and your account has permission, the icon highlights and jukebox mode activates.
- If it is not available, a message will explain what to check.

When jukebox mode is active, the **Settings → Playback** page shows a notice that backend settings are not applicable - the server handles all audio.

To exit jukebox mode, click the jukebox icon again. Local playback resumes.

---

## How it works

In jukebox mode:

- All player controls (play, pause, stop, next, previous, seek, volume) send commands to the server instead of driving local audio.
- The current track, playback position, and playing state are polled from the server every second while playing (every 3 seconds while paused) and kept in sync with the Sonixd Redux interface.
- The **volume slider** controls the server's output gain. When jukebox mode is enabled, the server's gain is set to match your current local volume, so there is no jump when switching modes.
- The **seek bar** reflects the server's current playback position.

---

## Playing music in jukebox mode

Use Sonixd Redux as you normally would to browse your library and build a queue. When you press play on an album, artist, or playlist, the queue is sent to the server and playback begins on the server's audio output.

Scrobbling works in jukebox mode. Sonixd Redux sends scrobble events based on the playback position reported by the server, using the same threshold configured in your settings. Play counts are also updated in the local library cache.

---

## Limitations

### Polling and responsiveness

Jukebox mode has an inherent latency that does not exist in local playback modes. Rather than receiving real-time events from the server, Sonixd Redux **polls** the server for its current state: every **1 second** while playing, and every **3 seconds** while paused or stopped. All UI updates (seek bar position, track title, playing/paused indicator) reflect the last poll result, not live server state.

This means that performing several actions in rapid succession - such as pressing next or previous multiple times quickly, seeking multiple times in a row, or switching songs before the previous command has been acknowledged - can result in unexpected behaviour: the wrong track title displaying briefly, the server playing a different song than expected, or commands landing out of order. These glitches are transient and resolve on the next poll cycle, but they are a fundamental consequence of the polling architecture and cannot be eliminated entirely.

For normal listening (play, pause, skip once, seek once), the polling rate is fast enough that the experience feels responsive. If you notice odd behaviour, waiting a second or two for the next poll to sync the state will usually correct it.

- Jukebox mode is only available on Subsonic-compatible servers (not Jellyfin).
- Local audio (MPV and web backends) is silent while jukebox mode is active.
- EQ, PEQ, ReplayGain, and audio device selection apply on the server side only, through Navidrome's own MPV configuration - not through Sonixd Redux's settings.
- **Internet radio** is not supported in jukebox mode. Radio stations cannot be queued via the jukebox song-ID API. Attempting to play internet radio while jukebox is active has no effect.
- **Stop after current** does not work in jukebox mode. The server automatically advances to the next song before Sonixd Redux can intercept it.
- **Scrobbling** is handled by Sonixd Redux based on the position polled from the server. The server does not scrobble independently in jukebox mode.
- **Gapless playback** is not supported. The server loads songs one at a time via jukebox commands rather than as a continuous playlist, so MPV's `--gapless-audio` flag has no effect even if added to `MPVCmdTemplate`.
- **Synced lyrics** are updated based on the playback position polled from the server (every 1 second while playing). The active line highlight and auto-scroll may lag behind the audio by up to one second, compared to the near-instant sync of local playback. Clicking a lyric line to seek may not work reliably in jukebox mode depending on server behaviour (in my tests, clicking a lyric line just makes the song restart).
