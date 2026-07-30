# Offline Mode

Sonixd Redux can detect when your server becomes unreachable and switch into offline mode automatically, letting you keep browsing and playing music that's available locally. You can also explicitly download songs, albums, artists, or playlists in advance so they're guaranteed to be available without a connection.

Everything described here is inert until you use it - if you never download anything and stay connected, nothing changes about how the app behaves.

---

## Automatic offline detection

Sonixd Redux periodically checks whether your server is reachable.

- If a check fails, you'll see a warning: **"You seem to be offline. Switching to offline mode in 30 seconds if connectivity isn't restored."**
- If the next check also fails, the app switches to offline mode automatically.
- As soon as a check succeeds again, the app switches back online automatically and syncs anything that happened while you were offline (see [Scrobbles, ratings, and favorites while offline](#scrobbles-ratings-and-favorites-while-offline) below).

While offline (automatically detected or manually forced), a persistent **Offline** indicator is shown next to the player bar. Hovering over it explains that actions will be queued and synced once connectivity is restored.

### Manually forcing offline mode

Go to **Settings → System → Connectivity** and enable **Force offline mode**.

This stops the app from attempting to reach your server at all - useful for saving data on a metered or slow connection, or if you just want to browse your downloaded/cached music without any background network activity. The setting persists across restarts, so remember to turn it back off when you want to reconnect.

---

## Browsing your library while offline

While offline, you can still browse:

- **Albums**, **Artists**, **Genres**, and **Search**
- **Playlists** (server-side playlists are synced automatically in the background so they're available even if you go offline later)
- **Smart Playlists** (via the existing [Library Cache](library.md))
- **Favorites**

This works from a local snapshot of your library's metadata (titles, album/artist/genre info, play counts, ratings, star status) that's kept in sync automatically every time you're online - no setting to turn on, no manual sync step.

If you navigate to something that isn't in the local snapshot while offline (for example, a link to an album that was removed from your server before it could sync), you'll see a plain **"Album/Artist/Playlist not found."** message instead of a crash or an infinite loading state.

**Not covered by offline browsing:** Folder view, Podcasts, and Internet Radio all require a live connection to your server, since they're not built on the same local snapshot.

### The Dashboard's quick-access lists

The Dashboard's **Recently Added**, **Random**, and **Most Played** tiles (and their expanded, full-library views) keep their own distinct ordering while offline, approximated from what's in the local snapshot - by date added, a local shuffle, and total play count respectively.

**Recently Played is the one exception** - there's no last-played timestamp synced into the offline snapshot, so its expanded view falls back to showing your whole library instead, unsorted by recency. This is a known limitation, not a bug: fixing it would require syncing an additional field that isn't tracked locally today.

### The offline-status column

The **Offline Status** column (visible by default in song lists, and customizable like any other column - see [Settings](settings.md)) shows whether each track is available without a connection:

- A **cloud icon** means the track is opportunistically cached (see [The Song Cache](#the-song-cache) below)
- A **solid download icon** means the track was explicitly downloaded (see [Downloads](#downloads) below)
- No icon means the track isn't available offline

If a track is both cached and downloaded, only the download icon is shown - downloading is the stronger guarantee, so that's what's surfaced.

**If you're restoring a settings backup exported before this version**, the Offline Status column won't be automatically re-enabled for you, since your backup predates it. Just turn it back on yourself in **Settings → Look & Feel → List View Layout Editor → Songs**, the same as any other column.

---

## Playback while offline

When you play a track, Sonixd Redux picks the best available source in this order:

1. A downloaded copy, if you downloaded it
2. A cached copy, if the app previously cached it during normal listening
3. The network stream, if you're online

This applies automatically - you don't need to do anything for playback to prefer a local copy when one exists, whether you're online or offline.

### Starting playback of an album, artist, or playlist while offline

If you hit Play on an album, artist, or playlist that has a mix of available and unavailable tracks while offline, Sonixd Redux automatically skips the ones that aren't available and plays the rest, showing a message like **"2 of 5 tracks unavailable offline - playing the rest."**

If none of the tracks are available, you'll see **"None of these tracks are available offline."** instead of starting playback with nothing to play.

Double-clicking an individual track that isn't available offline shows **"This track isn't available offline."** instead of silently failing or trying (and failing) to stream it.

---

## The Song Cache

The Song Cache is Sonixd Redux's existing, opportunistic caching feature: every song you play gets saved locally as you listen to it, up to a configurable size limit, so replaying it later (online or offline) doesn't need the network. It has no folder structure or filenames you're meant to interact with directly - see **Settings → System → Cache** in the [Settings reference](settings.md).

This is different from **Downloads** below, which is something you do intentionally, to guarantee specific songs/albums/artists/playlists are available offline in advance, rather than only after you've already listened to them once.

---

## Downloads

Downloads let you explicitly save songs to your own local folder, in a real, browsable file structure - independent of the opportunistic Song Cache.

### Setting a download folder

Before downloading anything, go to **Settings → System → Downloads** and click **Choose folder...** to pick where downloaded music should be saved. This is required - the Download buttons elsewhere in the app won't do anything until a folder is set.

Files are saved as:

```
<your folder>/<Artist>/<Album>/<Track number> - <Song title>.<extension>
```

using the original, non-transcoded audio file from your server (not a lower-quality stream), so what you download is the same quality as what's stored on your server. Album art is saved once per album alongside the tracks.

### Downloading

- **A single song**: right-click it and choose **Download**.
- **A whole album, artist's discography, or playlist**: open it and click the **Download** button (the same button previously used for "Download as zip" now downloads each song individually with progress, instead of a single zip file).

While a download is in progress, the Download and Remove buttons for that album/artist/playlist are disabled so you can't accidentally start an overlapping operation on the same content - progress is shown as a count (e.g. "3 of 8") rather than a percentage or transfer speed.

### Removing downloads

- **A single song**: right-click it and choose **Remove from offline**.
- **A whole album, artist's discography, or playlist**: click the **Remove from offline** button next to Download.

This only removes the local copy - it never affects anything on your server. If removing a song empties out its folder, the empty folder is cleaned up automatically.

### Downloads overview

Click **View downloads** in **Settings → System → Downloads** to see:

- Total space used by everything you've downloaded
- A full list of every downloaded song, with its title, artist, album, and size
- A **Clear all downloads** button to remove everything at once

If a downloaded file is ever found to be missing on disk (for example, if you manually delete it outside the app, or move your download folder's contents), Sonixd Redux notices the next time it needs that file and quietly updates its own records instead of continuing to claim the song is available or erroring out.

---

## Scrobbles, ratings, and favorites while offline

Starring a song, changing its rating, or finishing a track that would normally trigger a scrobble all still work while offline - they're saved locally and automatically sent to your server as soon as you're back online. You don't need to redo anything or remember what you changed; nothing is lost, and nothing happens twice.

If something in that queue ultimately fails to sync even after reconnecting (for example, a song was deleted from your server in the meantime), you'll see a summary notification rather than a silent failure.

---

## Things to know

- Downloads require manually setting a folder first - nothing downloads automatically just because you're offline.
- The Song Cache and Downloads are independent - clearing one doesn't affect the other, and a song can be in both, cached and downloaded, at the same time.
- Folder view, Podcasts, and Internet Radio need a live connection - they aren't part of offline browsing.
- The Dashboard's Recently Played list falls back to showing your whole library while offline, unsorted - Recently Added, Random, and Most Played all keep their own distinct ordering.
- Download progress is shown as a count of songs completed, not a byte-level progress bar or transfer speed.
- "Remove from offline" only ever deletes your own local copy - it never deletes or modifies anything on your server.
- Restoring a settings backup from before this version won't bring back the Offline Status column automatically - re-enable it yourself via the List View Layout Editor if it's missing.
