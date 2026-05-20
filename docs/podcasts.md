# Podcasts

Sonixd Redux can browse and play podcast episodes that are managed by your server.

---

## Server compatibility

Podcast support requires a server that implements the Subsonic podcast API endpoints. Compatibility by server:

| Server              | Supported |
| ------------------- | --------- |
| Airsonic-Advanced   | ✓ Yes     |
| Subsonic (original) | ✓ Yes     |
| Navidrome           | ✗ No      |
| Jellyfin            | ✗ No      |

When connected to a server that does not support podcasts, the Podcasts page shows a clear message instead of an empty list.

---

## How it works

Podcast management in Sonixd Redux follows the Subsonic model: **the server is responsible for subscribing to feeds, downloading episodes, and storing the audio files**. Sonixd Redux is the playback client - it streams episodes from the server, just like regular music.

This means:

- You subscribe to podcast feeds and trigger episode downloads through your **server's web interface or administration panel**, not within Sonixd Redux
- **Sonixd Redux cannot initiate episode downloads directly.** Downloads are a server-side operation and must be triggered from your server's interface
- Episodes must be downloaded to the server before they can be played in Sonixd Redux
- Episodes that have not been downloaded yet are shown in the list with a **Not downloaded** label and disabled play buttons

---

## Setting up podcasts

1. Open your server's web interface or administration panel
2. Navigate to the podcast management section
3. Add a new podcast by pasting the RSS feed URL of the podcast you want to subscribe to
4. The server will fetch the episode list from the feed
5. For each episode you want to play, trigger the download from your server's interface to download the audio file to the server
6. Once downloaded, the episode becomes available in Sonixd Redux

---

## Browsing podcasts

Click **Podcasts** in the sidebar to open the podcast channel list. Each channel shows its cover art, title, and episode count. Click a channel to open its episode list.

Each episode shows:

- **Title**
- **Publish date**
- **Duration** (if available)
- **Not downloaded** - if the episode has not been downloaded to the server yet

---

## Playing episodes

Episodes that have been downloaded to the server have three action buttons:

| Button        | Action                                      |
| ------------- | ------------------------------------------- |
| ▶ (Play)      | Replace the current queue with this episode |
| ⊕ (Add Next)  | Insert the episode after the current song   |
| + (Add Later) | Append the episode to the end of the queue  |

The **Play All** and **Add All** buttons in the header act on all downloaded episodes in the channel.

Episodes that have not been downloaded show disabled buttons. Download them from your server's web interface first.

---

## Refreshing feeds

Click **Refresh feeds** at the top of the Podcasts page to tell the server to check all subscribed feeds for new episodes. This updates the episode list but does not download any audio - you still need to trigger downloads from the server's web interface.

---

## Player backend

Podcast episodes use whichever backend you have configured in Settings. The web backend works reliably with all podcast-compatible servers.

If you use the MPV backend, podcasts will play through MPV just like music. This works fine on most servers, but some servers (notably Airsonic-Advanced) cannot efficiently handle MPV's connection behaviour and will spike to high CPU usage during playback or when switching episodes, which will cause playback issues. If you experience this, switch to the web backend for podcast playback.

---

## Bookmarks

Sonixd Redux automatically saves your position in a podcast episode when you pause. When you return to the same episode later, playback resumes from where you left off and a toast notification confirms the resume position.

- **Pausing** saves the current position to the server
- **Pressing stop** clears the bookmark - next play starts from the beginning
- **Finishing an episode** clears the bookmark - next play starts from the beginning
- **Switching to another episode** without pausing first preserves the bookmark from a previous pause (if existing), but doesn't create a new one on switch
- **Positions** within the last minute of an episode are not bookmarked, since the episode is effectively complete

Bookmarks are stored server-side via the Subsonic bookmark API, so they persist across app restarts and are shared with any other Subsonic client that supports bookmarks.

---

## Scrobbling

Podcast episodes are **not scrobbled** to Last.fm. Scrobbling is for music playback only.

---

## Sidebar visibility

The Podcasts entry can be shown or hidden in **Settings → Look & Feel → Sidebar items**. It is only visible when connected to a Subsonic-based server.
