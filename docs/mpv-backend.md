# MPV Backend

By default Sonixd Redux uses the built-in Chromium audio engine (Web backend). The **MPV backend** is an alternative that uses [MPV](https://mpv.io/) as the audio engine, providing true gapless playback and additional features.

---

## Why use MPV?

| Feature                | Web backend       | MPV backend    |
| ---------------------- | ----------------- | -------------- |
| Gapless playback       | Simulated         | True gapless   |
| ReplayGain             | ✗                 | ✓              |
| Audio device selection | ✓                 | ✓              |
| EQ / PEQ               | ✓                 | ✓              |
| Format support         | Limited (browser) | Broad (ffmpeg) |

---

## Installing MPV

MPV must be installed on your system before enabling the MPV backend.

**Windows**

```
winget install shinchiro.mpv
```

**Linux**

```bash
# Debian / Ubuntu
sudo apt install mpv

# Arch
sudo pacman -S mpv

# Fedora
sudo dnf install mpv
```

**macOS**

```
brew install mpv
```

---

## Enabling the MPV backend

1. Go to **Settings → Playback**
2. Under **Player Backend**, select **MPV**

If MPV is installed system-wide, no further configuration is needed. If you installed MPV to a custom location, set the path under **MPV Binary Path**.

> If MPV fails to start, a notification will appear. Double-check the binary path and that MPV is correctly installed.

---

## MPV Settings

### Gapless Mode

Controls how MPV handles the transition between tracks.

| Option         | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| Weak (default) | Gapless when audio format matches between tracks. Recommended. |
| Yes            | Always gapless, may cause issues with different formats        |
| No             | No gapless - brief silence between tracks                      |

### ReplayGain

Normalizes loudness using ReplayGain tags embedded in your audio files.

| Option | Description                                      |
| ------ | ------------------------------------------------ |
| Off    | No normalization                                 |
| Track  | Adjusts each song to a consistent loudness level |
| Album  | Preserves relative loudness within an album      |

> ReplayGain only works if your audio files contain ReplayGain tags. These are typically written by your music server (Navidrome, Beets, etc.) or a dedicated tool like `loudgain`.

### Audio Device

Select which audio output device MPV uses. Click **Refresh** to update the device list if you plugged in new hardware. The device switches instantly without interrupting playback.

### MPV Binary Path

Leave empty to use the system-installed MPV. Set a full path if you installed MPV to a custom location.

```
Windows example: C:\Program Files\MPV Player\mpv.exe
Linux example:   /usr/local/bin/mpv
```
