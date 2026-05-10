# Smart Playlists

Smart Playlists are rule-based playlists stored locally in Sonixd Redux. Instead of manually picking songs, you define a set of conditions and the app fetches and filters songs from your library each time you play the playlist.

Smart Playlists are found in the **Smart Playlists** entry in the sidebar (wand icon, below Playlists).

---

## Library Cache

For the most accurate results, Sonixd Redux can index your full library into a local cache. When the cache is active, all rules and sorting run against your **entire library** - not just a random sample.

### Syncing the cache

Click **Sync Library** at the top of the Smart Playlists page. The app will fetch all songs from your server in batches and save them locally. Progress is shown below the buttons as the sync runs. For large libraries (10 000+ songs) this may take a minute.

The cache is stored in a file on your computer (separate from the settings file) and persists across app restarts. The page header shows when the cache was last synced.

### Auto-sync

The cache is synced automatically every time the app launches. This keeps play counts accurate if you listen on other devices (phone, web player, etc.) between sessions. The sync runs silently in the background - the app is fully usable immediately. If the server is unreachable at launch, the existing cache is preserved untouched.

Click **Sync Library** manually any time you want to force an immediate refresh.

### What updates automatically

You do not need to re-sync the cache for the following changes - they are reflected immediately:

- **Play Count** - incremented in the cache each time a song is scrobbled
- **Starred** - updated instantly when you star or unstar a song (from the player or right-click menu)
- **Rating** - updated instantly when you set or change a song's rating

The only reason to click **Sync Library** again is when you add new songs or albums to your server.

**What about songs played before syncing?** If you play a song that isn't in the local cache yet (for example, a newly added album you haven't synced), the scrobble is still sent to your server as normal - the local cache is simply bypassed for that play. When you next click **Sync Library**, the song is imported from your server with the play count already recorded there. Nothing is lost.

**What about plays from other devices (phone, web player, etc.)?** Sonixd Redux only increments the local cache for scrobbles that happen within the app. Plays from other clients are recorded on your server but are not reflected in the local cache until the next sync. Since the cache syncs automatically on every launch, play counts from other devices are picked up each time you open the app.

### Cache and server changes

If you switch to a different server, the cache is automatically invalidated and a new sync will start on the next launch.

---

## Creating a Smart Playlist

Click **New Playlist** at the top of the Smart Playlists page. The editor opens with the following sections:

### Name

Give your playlist a descriptive name. This name is also used when saving the playlist to your server.

### Rules

Rules filter which songs are eligible for the playlist. All rules must match - they are combined with AND logic.

Click **Add Rule** to add a condition. Each rule has three parts:

| Part         | Description                                                            |
| ------------ | ---------------------------------------------------------------------- |
| **Field**    | What to filter on (Genre, Year, Play Count, Rating, Starred, Duration) |
| **Operator** | How to compare (is, is not, ≥, ≤, between, shorter than, longer than)  |
| **Value**    | The value to compare against                                           |

You can add as many rules as you like, or leave the rules list empty to draw from your entire library with no filtering.

**Available fields:**

| Field          | Type      | Notes                                                                                             |
| -------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Genre          | Text      | Must match exactly (e.g. `Rock`, `Jazz`)                                                          |
| Year           | Number    | Release year of the song                                                                          |
| Play Count     | Number    | Total number of times played                                                                      |
| Rating         | 1–5 stars | User rating set in Sonixd Redux or your server; unrated songs (0 stars) never match a rating rule |
| Starred        | Yes / No  | Whether the song has been starred (favorited)                                                     |
| Duration (min) | Minutes   | Song length in minutes (decimals supported)                                                       |

### Sort by

Choose how the resulting songs are ordered before the limit is applied:

| Sort       | Effect                                                             |
| ---------- | ------------------------------------------------------------------ |
| Play Count | Most or least played first; songs with 0 plays are always excluded |
| Year       | Newest or oldest first                                             |
| Rating     | Highest or lowest rated first                                      |
| Duration   | Longest or shortest first                                          |
| Random     | Shuffled each time you play; includes songs with 0 plays           |

Use the **Direction** dropdown to choose Descending (↓) or Ascending (↑).

### Limit

The maximum number of songs to put in the queue. There is no hard cap - you can set this to 1000 or more. Keep in mind that very high limits will take longer to process and may result in a large queue.

---

## Playing a Smart Playlist

Each playlist in the list has the following buttons:

| Button             | Action                                                         |
| ------------------ | -------------------------------------------------------------- |
| ▶ (Play)           | Fetch songs and replace the current queue                      |
| ⊕ (Add Next)       | Fetch songs and insert them after the current song             |
| + (Add Later)      | Fetch songs and append them to the end of the queue            |
| ☁ (Save to Server) | Fetch songs and save them as a regular playlist on your server |
| ✎ (Edit)           | Open the editor to modify the playlist rules                   |
| 🗑 (Delete)         | Remove the playlist from Sonixd Redux                          |

---

## Saving to your server

The **Save to Server** button generates the song list using the current rules and creates a regular playlist on your server containing those songs.

**Important:** this saves a static snapshot. The server playlist will not update automatically when your library changes - it reflects exactly which songs matched the rules at the moment you clicked the button. To refresh it, delete the server playlist and save again.

This is useful for:

- Syncing a "best of" list to a mobile app or other client
- Sharing a curated list with other users on the same server
- Keeping a permanent copy of a generated mix

---

## How songs are fetched

### With library cache (recommended)

When the local cache is active, smart playlists search your **full library**. Every song is checked against your rules, results are sorted, and trimmed to your limit. This gives accurate results for all fields including Play Count, Rating, and Starred.

### Without library cache (fallback)

When no cache is available, the app falls back to fetching a pool of songs from the server and filtering client-side. The pool is limited to ~500 songs, so results are approximate:

- **Starred = Yes** → fetches your entire starred songs list
- **Genre is X** (without a year filter) → fetches up to 500 random songs of that genre
- **Year filter** → fetches up to 500 random songs from that year range
- **All other cases** → fetches a random pool of up to 500 songs from your full library

All rules are then applied to that pool, results are sorted, and trimmed to your limit.

### Limitation without cache: "Sort by Play Count" without rules

Without the library cache, sorting by Play Count with no rules gives you the most-played songs **within a random sample of 500**, not across your full library. Results will differ each time you play the playlist. The editor shows a reminder when you select this combination.

**Recommended:** sync the library cache for reliable Play Count sorting.

---

## Example playlists

### Most played of all time

| Setting   | Value      |
| --------- | ---------- |
| Rules     | _(none)_   |
| Sort by   | Play Count |
| Direction | Descending |
| Limit     | 50         |

> **Note:** Requires the library cache for accurate results. Without it, results are drawn from a random pool - see [the fallback section](#without-library-cache-fallback) above.

### Highly rated rock songs

| Setting   | Value                               |
| --------- | ----------------------------------- |
| Rules     | Genre **is** `Rock`, Rating **≥** 4 |
| Sort by   | Rating                              |
| Direction | Descending                          |
| Limit     | 100                                 |

### Recent releases

| Setting   | Value           |
| --------- | --------------- |
| Rules     | Year **≥** 2020 |
| Sort by   | Year            |
| Direction | Descending      |
| Limit     | 50              |

### Short songs for a commute

| Setting | Value                               |
| ------- | ----------------------------------- |
| Rules   | Duration (min) **shorter than** 3.5 |
| Sort by | Random                              |
| Limit   | 40                                  |

### Forgotten favourites (starred but rarely played)

| Setting   | Value                                  |
| --------- | -------------------------------------- |
| Rules     | Starred **is** Yes, Play Count **≤** 3 |
| Sort by   | Play Count                             |
| Direction | Ascending                              |
| Limit     | 50                                     |

### Jazz from the 60s and 70s

| Setting | Value                                               |
| ------- | --------------------------------------------------- |
| Rules   | Genre **is** `Jazz`, Year **between** 1960 and 1979 |
| Sort by | Random                                              |
| Limit   | 60                                                  |

---

## Storage

Smart Playlists are stored locally on your computer inside Sonixd Redux's settings file. They are not synced to your server and will not appear in other clients. They are included in the **Settings → Backup & Restore** export/import, so you can transfer them between machines.

The library cache is stored in a separate file alongside the settings. It is not included in the Backup & Restore export - re-sync from the Smart Playlists page after restoring or moving to a new machine.
