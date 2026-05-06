import { useEffect, useRef, useState } from 'react';
import { ipcRenderer } from 'electron';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  incrementCurrentIndex,
  setCurrentIndex,
  setStopAfterCurrent,
  getNextPlayerIndex,
} from '../../redux/playQueueSlice';
import { setStatus } from '../../redux/playerSlice';
import { setMpvAudioDeviceId } from '../../redux/configSlice';
import { EqState } from '../../redux/eqSlice';
import { PeqState } from '../../redux/peqSlice';
import { buildMpvAfChain } from '../../shared/mpvEqFilter';
import { settings } from '../shared/setDefaultSettings';
import { notifyToast } from '../shared/toast';

const EQ_DEBOUNCE_MS = 150;

const entryListKey = (pq: any) => {
  if (pq.sortedEntry?.length > 0) return 'sortedEntry';
  if (pq.shuffle) return 'shuffledEntry';
  return 'entry';
};

const MpvPlayer = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const playQueue = useAppSelector((state) => state.playQueue);
  const player = useAppSelector((state) => state.player);
  const config = useAppSelector((state) => state.config);
  const eq = useAppSelector((state: any) => state.eq as EqState);
  const peq = useAppSelector((state: any) => state.peq as PeqState);
  const [mpvReady, setMpvReady] = useState(false);

  const eqDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);
  const currentUrlRef = useRef<string>('');
  const preloadedNextUrlRef = useRef<string | null>(null);
  // Tracks the latest playQueue in event handlers to avoid stale closures
  const playQueueRef = useRef(playQueue);
  // Tracks the latest player status so the init callback reads the live value
  const playerStatusRef = useRef(player.status);
  // Set before dispatching auto-next to suppress the queue-reload effect
  const autoNextPendingRef = useRef(false);

  useEffect(() => {
    playQueueRef.current = playQueue;
  }, [playQueue]);

  useEffect(() => {
    playerStatusRef.current = player.status;
  }, [player.status]);

  const getEntryList = () => {
    const pq = playQueueRef.current;
    return pq[entryListKey(pq)] ?? [];
  };

  // Returns the URL to preload as the next track after `fromIndex`.
  // Returns null when there is nothing to preload (end of queue with no repeat).
  const getNextUrl = (fromIndex?: number) => {
    const pq = playQueueRef.current;
    const list = pq[entryListKey(pq)] ?? [];
    if (list.length === 0) return null;
    const base = fromIndex ?? pq.currentIndex;
    // Don't wrap around at the end when repeat is off
    if (pq.repeat === 'none' && base >= list.length - 1) return null;
    const nextIndex = getNextPlayerIndex(list.length, pq.repeat, base);
    return list[nextIndex]?.streamUrl || null;
  };

  // Initialize MPV once on mount
  useEffect(() => {
    const { mpvPath, mpvGapless, mpvAudioDeviceId, mpvReplayGain } = config.playback;
    const extraParameters: string[] = [
      `--gapless-audio=${mpvGapless}`,
      `--replaygain=${mpvReplayGain}`,
    ];
    if (mpvAudioDeviceId) extraParameters.push(`--audio-device=${mpvAudioDeviceId}`);

    const initialAf = buildMpvAfChain(eq, peq);
    const properties: Record<string, any> = {};
    if (initialAf) properties.af = initialAf;

    ipcRenderer
      .invoke('player-initialize', {
        binaryPath: mpvPath || undefined,
        extraParameters,
        properties,
      })
      .then(async () => {
        // Verify the saved MPV audio device before marking as initialized.
        // Doing this first prevents the track-change effect from firing while
        // the device fix is still in progress (race condition on next-track press).
        const savedDeviceId = config.playback.mpvAudioDeviceId;
        if (savedDeviceId) {
          try {
            const devices = await ipcRenderer.invoke('player-get-audio-devices');
            if (devices?.length > 0 && !devices.find((d: any) => d.value === savedDeviceId)) {
              await ipcRenderer.invoke('player-set-audio-device', 'auto');
              dispatch(setMpvAudioDeviceId(undefined));
              settings.set('mpvAudioDeviceId', null);
              notifyToast(
                'warning',
                t('Selected MPV audio device is no longer available. Using system default.')
              );
            }
          } catch {
            /* ignore */
          }
        }

        initializedRef.current = true;

        // Load initial queue if a song is already selected
        const pq = playQueueRef.current;
        const list = pq[entryListKey(pq)] ?? [];
        const currentUrl = list[pq.currentIndex]?.streamUrl;
        console.log(
          '[MPV init] initialized. currentUrl:',
          currentUrl,
          'playerStatus:',
          playerStatusRef.current
        );
        if (currentUrl) {
          currentUrlRef.current = currentUrl;
          const nextUrl = getNextUrl();
          preloadedNextUrlRef.current = nextUrl;
          const pause = playerStatusRef.current !== 'PLAYING';
          console.log('[MPV init] sending player-set-queue, pause:', pause);
          ipcRenderer.send('player-set-queue', {
            current: currentUrl,
            next: nextUrl,
            pause,
          });
        }
        // Trigger a re-render so the play/pause effect re-runs with the correct initialized state
        setMpvReady(true);
        return null;
      })
      .catch(() => {});

    const onAutoNext = () => {
      const pq = playQueueRef.current;
      const list = getEntryList();
      if (list.length === 0) return;

      // At end of queue with no repeat — MPV stopped, just sync Redux status
      if (pq.repeat === 'none' && pq.currentIndex >= list.length - 1) {
        dispatch(setStatus('PAUSED'));
        return;
      }

      const nextIndex = getNextPlayerIndex(list.length, pq.repeat, pq.currentIndex);
      const nextSong = list[nextIndex];

      // Compute next-next from OLD state before dispatching, to avoid stale playQueueRef
      const newNextUrl = getNextUrl(nextIndex);

      const nextUrl = nextSong?.streamUrl || '';
      // Only arm the flag when the URL actually changes. For single-song repeat-all
      // or repeat-one, nextUrl === currentUrlRef.current, so the track-change effect
      // deps won't change and the effect won't fire to clear it — leaving the flag
      // stuck true and causing the next manual song change to be ignored.
      if (nextUrl && nextUrl !== currentUrlRef.current) {
        autoNextPendingRef.current = true;
      }
      dispatch(incrementCurrentIndex('none'));
      if (nextSong) {
        dispatch(setCurrentIndex(nextSong));
        currentUrlRef.current = nextUrl;
      }

      // Stop after current: advance the queue display but pause immediately
      if (pq.stopAfterCurrent) {
        dispatch(setStopAfterCurrent(false));
        dispatch(setStatus('PAUSED'));
        preloadedNextUrlRef.current = null;
        ipcRenderer.send('player-auto-next', { url: null });
        ipcRenderer.send('player-pause');
        ipcRenderer.send('player-seek-to', 0);
        return;
      }

      preloadedNextUrlRef.current = newNextUrl;
      ipcRenderer.send('player-auto-next', { url: newNextUrl });
    };

    const onPlay = () => {
      console.log('[MPV] renderer-player-play received');
      dispatch(setStatus('PLAYING'));
    };
    const onPause = () => {
      console.log('[MPV] renderer-player-pause received');
      dispatch(setStatus('PAUSED'));
    };
    const onStop = () => {
      console.log('[MPV] renderer-player-stop received');
      dispatch(setStatus('PAUSED'));
    };
    const onFallback = () => {
      initializedRef.current = false;
      notifyToast('error', t('MPV failed to start. Check the binary path in settings.'));
    };
    const onDebugLog = (_: any, msg: string) => console.log('[MPV main →]', msg);

    ipcRenderer.on('renderer-player-auto-next', onAutoNext);
    ipcRenderer.on('renderer-player-play', onPlay);
    ipcRenderer.on('renderer-player-pause', onPause);
    ipcRenderer.on('renderer-player-stop', onStop);
    ipcRenderer.on('renderer-player-fallback', onFallback);
    ipcRenderer.on('mpv-debug-log', onDebugLog);

    return () => {
      ipcRenderer.removeListener('renderer-player-auto-next', onAutoNext);
      ipcRenderer.removeListener('renderer-player-play', onPlay);
      ipcRenderer.removeListener('renderer-player-pause', onPause);
      ipcRenderer.removeListener('renderer-player-stop', onStop);
      ipcRenderer.removeListener('renderer-player-fallback', onFallback);
      ipcRenderer.removeListener('mpv-debug-log', onDebugLog);
      ipcRenderer.send('player-quit');
      initializedRef.current = false;
      if (eqDebounceRef.current) clearTimeout(eqDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load new track when the user changes songs (not when MPV auto-advances)
  useEffect(() => {
    console.log(
      '[MPV track-change] fired. initialized:',
      initializedRef.current,
      'autoNextPending:',
      autoNextPendingRef.current
    );
    if (!initializedRef.current) return;

    // auto-next already handled the transition — just clear the flag
    if (autoNextPendingRef.current) {
      autoNextPendingRef.current = false;
      return;
    }

    const pq = playQueueRef.current;
    const list = pq[entryListKey(pq)] ?? [];
    const currentUrl = list[pq.currentIndex]?.streamUrl;
    console.log(
      '[MPV track-change] currentUrl:',
      currentUrl,
      'currentUrlRef:',
      currentUrlRef.current,
      'player.status:',
      player.status
    );
    if (!currentUrl || currentUrl === currentUrlRef.current) {
      console.log('[MPV track-change] SKIPPING — url unchanged or missing');
      return;
    }
    currentUrlRef.current = currentUrl;

    const nextUrl = getNextUrl();
    preloadedNextUrlRef.current = nextUrl;
    // Use playerStatusRef.current (not player.status) to avoid stale closure issues.
    // player-set-queue pre-pauses MPV before loading, so any player-play arriving
    // from the play-effect (separate render due to electron-redux batching) will
    // override the pre-pause and make MPV play correctly.
    const shouldPause = playerStatusRef.current !== 'PLAYING';
    console.log('[MPV track-change] sending player-set-queue, pause:', shouldPause);
    ipcRenderer.send('player-set-queue', {
      current: currentUrl,
      next: nextUrl,
      pause: shouldPause,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playQueue.currentIndex, playQueue.currentSongId]);

  // Keep MPV's preloaded next track (playlist position 1) in sync when the queue changes
  useEffect(() => {
    if (!initializedRef.current) return;
    if (autoNextPendingRef.current) return;
    const nextUrl = getNextUrl();
    if (nextUrl === preloadedNextUrlRef.current) return;
    preloadedNextUrlRef.current = nextUrl;
    ipcRenderer.send('player-set-queue-next', { url: nextUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playQueue.currentIndex,
    playQueue.repeat,
    playQueue.entry,
    playQueue.shuffledEntry,
    playQueue.sortedEntry,
  ]);

  // Play / pause — also fires when mpvReady flips so a click during init is not lost
  useEffect(() => {
    console.log(
      '[MPV play-effect] fired. initialized:',
      initializedRef.current,
      'status:',
      player.status,
      'mpvReady:',
      mpvReady
    );
    if (!initializedRef.current) return;
    if (player.status === 'PLAYING') {
      console.log('[MPV play-effect] sending player-play');
      ipcRenderer.send('player-play');
    } else {
      console.log('[MPV play-effect] sending player-pause');
      ipcRenderer.send('player-pause');
    }
  }, [player.status, mpvReady]);

  // Volume (0–1 in Redux → 0–100 for MPV)
  useEffect(() => {
    if (!initializedRef.current) return;
    ipcRenderer.send('player-volume', Math.round(playQueue.volume * 100));
  }, [playQueue.volume]);

  // EQ / PEQ — debounced so slider drags don't hammer MPV
  useEffect(() => {
    if (!initializedRef.current) return;
    if (eqDebounceRef.current) clearTimeout(eqDebounceRef.current);
    eqDebounceRef.current = setTimeout(() => {
      const afString = buildMpvAfChain(eq, peq);
      ipcRenderer.send('player-set-af', afString);
    }, EQ_DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eq.enabled, eq.gains, eq.preampDb, peq.enabled, peq.bands, peq.preampDb]);

  // Audio device switch — hot-swap without restarting MPV
  useEffect(() => {
    if (!initializedRef.current) return;
    const { mpvAudioDeviceId } = config.playback;
    ipcRenderer.invoke('player-set-audio-device', mpvAudioDeviceId || 'auto').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.playback.mpvAudioDeviceId]);

  // Path / gapless / replaygain change — requires MPV restart
  useEffect(() => {
    if (!initializedRef.current) return;
    const { mpvPath, mpvGapless, mpvAudioDeviceId, mpvReplayGain } = config.playback;
    const extraParameters: string[] = [
      `--gapless-audio=${mpvGapless}`,
      `--replaygain=${mpvReplayGain}`,
    ];
    if (mpvAudioDeviceId) extraParameters.push(`--audio-device=${mpvAudioDeviceId}`);
    const afString = buildMpvAfChain(eq, peq);
    const properties: Record<string, any> = {};
    if (afString) properties.af = afString;

    const pq = playQueueRef.current;
    const list = pq[entryListKey(pq)] ?? [];
    const currentUrl = list[pq.currentIndex]?.streamUrl;
    const nextUrl = getNextUrl();

    ipcRenderer
      .invoke('player-restart', {
        binaryPath: mpvPath || undefined,
        extraParameters,
        properties,
      })
      .then(() => {
        if (currentUrl) {
          preloadedNextUrlRef.current = nextUrl;
          ipcRenderer.send('player-set-queue', {
            current: currentUrl,
            next: nextUrl,
            pause: playerStatusRef.current !== 'PLAYING',
          });
        }
        return null;
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.playback.mpvPath, config.playback.mpvGapless, config.playback.mpvReplayGain]);

  // Persist MPV settings to electron-store
  useEffect(() => {
    settings.set('playerBackend', config.playback.playerBackend);
  }, [config.playback.playerBackend]);

  useEffect(() => {
    settings.set('mpvPath', config.playback.mpvPath);
  }, [config.playback.mpvPath]);

  useEffect(() => {
    settings.set('mpvGapless', config.playback.mpvGapless);
  }, [config.playback.mpvGapless]);

  useEffect(() => {
    settings.set('mpvReplayGain', config.playback.mpvReplayGain);
  }, [config.playback.mpvReplayGain]);

  return null;
};

export default MpvPlayer;
