import { useEffect, useRef } from 'react';
import { scrobbleTimerMs } from '../shared/scrobbleLogic';

interface UseScrobbleTimerParams {
  duration: number;
  threshold: number;
  playerStatus: 'PLAYING' | 'PAUSED';
  trackId: string | undefined;
  scrobbleEnabled: boolean;
  onScrobble: () => void;
}

/**
 * Fires onScrobble exactly once per track when the scrobble threshold timer
 * elapses while the player is playing.
 *
 * The timer is reset when trackId changes (new track) and cancelled on unmount.
 */
const useScrobbleTimer = ({
  duration,
  threshold,
  playerStatus,
  trackId,
  scrobbleEnabled,
  onScrobble,
}: UseScrobbleTimerParams): void => {
  const hasScrobbledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScrobbleRef = useRef(onScrobble);

  // Keep callback ref current without re-triggering the effect
  useEffect(() => {
    onScrobbleRef.current = onScrobble;
  });

  // Reset scrobbled flag when the track changes
  useEffect(() => {
    hasScrobbledRef.current = false;
  }, [trackId]);

  useEffect(() => {
    if (!scrobbleEnabled || !trackId || duration === 0 || hasScrobbledRef.current) {
      return undefined;
    }

    if (playerStatus !== 'PLAYING') {
      return undefined;
    }

    const delay = scrobbleTimerMs({ duration, threshold });

    const timer = setTimeout(() => {
      if (!hasScrobbledRef.current) {
        hasScrobbledRef.current = true;
        onScrobbleRef.current();
      }
    }, delay);

    timerRef.current = timer;

    return () => {
      clearTimeout(timer);
      timerRef.current = null;
    };
  }, [duration, threshold, playerStatus, trackId, scrobbleEnabled]);
};

export default useScrobbleTimer;
