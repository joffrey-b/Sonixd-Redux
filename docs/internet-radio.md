# Internet Radio

Sonixd Redux can play internet radio stations configured on your server directly from the sidebar.

---

## Server support

Internet Radio is available on **Subsonic-based servers** (Navidrome and other Subsonic-compatible servers). It is not available on Jellyfin - the sidebar entry and sidebar customization option are hidden when connected to a Jellyfin server.

---

## Setting up stations

Stations are managed on the server side, not in Sonixd Redux. In Navidrome, go to **Settings → Internet Radios** and add stations there. Each station requires:

- **Name** - displayed in Sonixd Redux
- **Stream URL** - the direct audio stream URL (not an m3u file link or a web player page)
- **Homepage URL** _(optional)_ - shown as a clickable link in Sonixd Redux

### Finding the stream URL

The stream URL is the direct link to the audio feed. It typically looks like:

- `http://stream.example.com:8000/stream`
- `https://streaming.example.com/radio/128/stream.mp3`

**From an m3u file:** download the file and open it in a text editor - the stream URL is listed inside, usually as the last line starting with `http`.

**From a web player:** open the browser DevTools (F12), go to the Network tab, start playback, and look for a request of type `media` or a URL ending in `.mp3`, `.aac`, `.ogg`, or containing `/stream`, `/live`, or `/listen`.

**From a radio directory:** sites like [radio-browser.info](https://www.radio-browser.info) list direct stream URLs for thousands of stations.

---

## Playing a station

Open **Internet Radio** in the sidebar. Your configured stations are listed with their name and homepage link. Click the **▶ Play** button to replace the current queue with the station and start playback immediately.

Since internet radio is a live stream:

- The player bar shows only the **play/pause** button - stop, skip, and seek controls are hidden
- The seek bar shows **LIVE** instead of a duration and cannot be interacted with
- Scrobbling does not occur
- Your EQ settings are applied to the stream as normal

---

## Sidebar visibility

The Internet Radio entry can be shown or hidden in **Settings → Look & Feel → Sidebar items**, between Folders and Config.
