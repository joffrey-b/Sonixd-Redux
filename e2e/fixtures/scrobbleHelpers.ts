// Returns a route predicate that matches ONLY submission=true scrobble calls
// (not the submission=false now-playing ping that Navidrome sends on play start)
export function isRealScrobble(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.pathname.includes('/rest/scrobble.view') && u.searchParams.get('submission') === 'true'
    );
  } catch {
    return false;
  }
}

export function isJellyfinPlaybackStopped(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith('/sessions/playing/stopped');
  } catch {
    return false;
  }
}
