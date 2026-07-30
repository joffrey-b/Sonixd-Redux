// Given a song and the current song cache path, returns a local file path if
// one is available, otherwise the song's network stream URL. Check order
// (ADR Section 8.3): downloaded -> cached -> network, matching the
// offline-status column's "downloaded wins" icon precedence (Phase 3's
// getOfflineStatusIconState). Mirrors the logic already used by the Web Audio
// backend (Player.tsx's getSrc1/getSrc2) so both backends share one tested
// implementation going forward.
//
// getDownloadedPath is optional and async: Fix 6's resilience requirement
// means it must verify the file still exists (not just look it up in
// memory) before trusting it and self-correct the index if not (ADR Section
// 8.5) -- see shared/downloadedPathResilience.ts. This is not a new category
// of hot-path cost (Lesson #1): the cache tier right below it already does
// the same kind of IPC-based existence check on every single resolution.
// Optional only so existing callers/tests that predate Phase 4 don't need to
// change to keep compiling, not because skipping the downloaded check is
// ever the intended production behavior.
export async function resolveSongPlaybackSource(
  song: { id?: string; suffix?: string; streamUrl?: string } | undefined,
  songCachePath: string,
  cacheExists: (path: string) => Promise<boolean>,
  getDownloadedPath?: (songId: string) => Promise<string | undefined>
): Promise<string | undefined> {
  if (!song) return undefined;

  if (song.id && getDownloadedPath) {
    const downloadedPath = await getDownloadedPath(song.id);
    if (downloadedPath) return downloadedPath;
  }

  const ext = song.suffix || 'mp3';
  const cachedPath = `${songCachePath}/${song.id}.${ext}`;
  return (await cacheExists(cachedPath)) ? cachedPath : song.streamUrl;
}
