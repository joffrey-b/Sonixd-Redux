/**
 * Returns true if a scrobble should be submitted at this point in time.
 *
 * Rules mirror the Player.tsx listen handlers:
 * - Track must be at least 30 seconds into playback
 * - Track must have a non-zero duration
 * - Must not have already scrobbled this track
 * - currentTime must exceed 4 minutes OR the threshold% of duration
 */
export function shouldScrobble(params: {
  currentTime: number;
  duration: number;
  threshold: number;
  hasScrobbled: boolean;
}): boolean {
  const { currentTime, duration, threshold, hasScrobbled } = params;
  if (hasScrobbled) return false;
  if (duration === 0) return false;
  if (currentTime < 30) return false;
  return currentTime >= 240 || currentTime >= duration * (threshold / 100);
}

/**
 * Returns the timer delay (ms) at which the scrobble should fire.
 * Clamped to a minimum of 30 seconds.
 */
export function scrobbleTimerMs(params: { duration: number; threshold: number }): number {
  const { duration, threshold } = params;
  const thresholdMs = duration * (threshold / 100) * 1000;
  return Math.max(30_000, thresholdMs);
}
