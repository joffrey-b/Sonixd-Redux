# Scrobbling

Sonixd Redux sends playback updates to your server so it can track play counts and scrobble to external services like Last.fm.

---

## Enabling scrobbling

Go to **Settings → Playback** and enable **Scrobble**.

When enabled, Sonixd Redux sends two types of events to your server:

1. **Now Playing** - sent ~5 seconds after a track starts playing
2. **Submission** - sent when the scrobble threshold is reached

---

## Scrobble threshold

The threshold controls what percentage of a track must be played before a submission is sent.

- Go to **Settings → Playback → Scrobble Threshold**
- Set a value between 0% and 100% (default is typically 50%)
- A track is always submitted after **4 minutes** of playback, regardless of threshold

> This mirrors the Last.fm scrobbling spec: a track counts once you've played half of it or 4 minutes, whichever comes first.

---

## Last.fm / ListenBrainz

Scrobbling to Last.fm or ListenBrainz is handled by your server, not by Sonixd Redux directly.

Once configured on the server side, play counts and scrobbles happen automatically.
