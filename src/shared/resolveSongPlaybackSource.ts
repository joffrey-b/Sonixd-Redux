// Given a song and the current song cache path, returns the local cached file
// path if it exists on disk, otherwise the song's network stream URL.
// Mirrors the logic already used by the Web Audio backend
// (Player.tsx's getSrc1/getSrc2) so both backends share one tested
// implementation of "prefer local cache over network" going forward.

export async function resolveSongPlaybackSource(
  song: { id?: string; suffix?: string; streamUrl?: string } | undefined,
  songCachePath: string,
  cacheExists: (path: string) => Promise<boolean>
): Promise<string | undefined> {
  if (!song) return undefined;
  const ext = song.suffix || 'mp3';
  const cachedPath = `${songCachePath}/${song.id}.${ext}`;
  return (await cacheExists(cachedPath)) ? cachedPath : song.streamUrl;
}
