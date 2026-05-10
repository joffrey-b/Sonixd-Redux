# Artist Radio

Artist Radio generates a mix of songs similar to a given artist and plays them as a queue. It is a quick way to start a session seeded by an artist you enjoy without having to build a playlist manually.

---

## How to use it

Open any artist page and click the **wand (✦) button** in the toolbar, next to the play buttons.

The app will fetch up to 50 similar songs from your server and replace the current queue with them. Give it a few seconds - the server needs to query an external source to build the list.

---

## How it works by server type

### Navidrome (and other Subsonic-compatible servers)

Navidrome uses **Last.fm** data to find similar artists and songs. When you trigger Artist Radio, Navidrome queries its own Last.fm integration on the server side and returns a list of songs from similar artists already in your library.

This means:

- **No configuration is needed in Sonixd Redux** - the app simply calls the server's `getSimilarSongs` API
- The quality of the results depends on how well Last.fm knows the artist and how much of your library overlaps with similar artists
- If your Navidrome instance does not have Last.fm configured by the server administrator, the mix will come back empty and a warning will appear

> **Note for server administrators:** Last.fm integration is configured in `navidrome.toml` under the `LastFM` section. See the [Navidrome documentation](https://www.navidrome.org/docs/usage/external-integrations/) for details. This is the same configuration used for artist biographies and similar artist cards on the artist page.

### Jellyfin

Jellyfin uses its **InstantMix** feature, which generates a mix based on the metadata tags embedded in your audio files (genre, mood, etc.). It does not require any external service or internet connection - it works entirely from your local library.

InstantMix is always available regardless of your Jellyfin configuration.

---

## What happens when results are empty

If the server returns no similar songs - for example, because Last.fm is not configured on a Navidrome server, or because the artist is too niche for the similarity database - a warning toast will appear and the current queue will not be changed.

---

## Related Artists section

The **Related Artists** section at the bottom of the artist page shows artist cards for artists that are considered similar. This section is only shown when the server returns related artist data (which also requires Last.fm on Navidrome).
