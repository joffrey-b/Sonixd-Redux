# Artist Radio

Artist Radio generates a mix of songs similar to a given artist and plays them as a queue. It is a quick way to start a session seeded by an artist you enjoy without having to build a playlist manually.

---

## How to use it

Open any artist page and click the **wand (✦) button** in the toolbar, next to the play buttons.

The app will fetch up to 50 similar songs from your server and replace the current queue with them. Give it a few seconds - the server needs to look up similarity data to build the list.

---

## How it works by server type

### Navidrome (and other Subsonic-compatible servers)

Navidrome uses its `getSimilarSongs` API to find songs from artists similar to the one you selected. No configuration is needed in Sonixd Redux - the app simply calls this endpoint and Navidrome handles the rest.

The quality of the results depends on how much of your library overlaps with artists that Navidrome considers similar. Last.fm integration is **not required** for Artist Radio to work - Navidrome can source similarity data independently.

### Jellyfin

Jellyfin uses its **InstantMix** feature, which generates a mix based on the metadata tags embedded in your audio files (genre, mood, etc.). It does not require any external service or internet connection - it works entirely from your local library.

InstantMix is always available regardless of your Jellyfin configuration.

---

## What happens when results are empty

If the server returns no similar songs - for example because the artist is too niche or not well represented in your library - a warning toast will appear and the current queue will not be changed.

---

## Related Artists section

The **Related Artists** section at the bottom of the artist page shows artist cards for artists that are considered similar. This section is only shown when the server returns related artist data.
