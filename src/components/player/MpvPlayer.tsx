import { useCallback, useEffect, useRef, useState } from 'react';
import { cache, ipcRenderer, settings } from '../shared/bridge';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  incrementCurrentIndex,
  setCurrentIndex,
  setStopAfterCurrent,
  getNextPlayerIndex,
  PlayQueue,
} from '../../redux/playQueueSlice';
import { setStatus } from '../../redux/playerSlice';
import { setMpvAudioDeviceId } from '../../redux/configSlice';
import { EqState } from '../../redux/eqSlice';
import { PeqState } from '../../redux/peqSlice';
import { buildMpvAfChain } from '../../shared/mpvEqFilter';
import { resolveSongPlaybackSource } from '../../shared/resolveSongPlaybackSource';
import { resolveDownloadedPathWithResilience } from '../../shared/downloadedPathResilience';
import cacheSong from '../shared/cacheSong';
import { addCachedSongId } from '../../redux/cachedSongsSlice';
import { notifyToast } from '../shared/toast';
import { apiController } from '../../api/controller';
import { Server } from '../../types';

const EQ_DEBOUNCE_MS = 150;

const entryListKey = (pq: PlayQueue) => {
  if (pq.sortedEntry?.length > 0) return 'sortedEntry';
  if (pq.shuffle) return 'shuffledEntry';
  return 'entry';
};

const MpvPlayer = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  // Fix 6: wraps the raw in-memory lookup with an existence check +
  // self-correction (ADR Section 8.5) -- see downloadedPathResilience.ts.
  const resolveDownloadedPath = useCallback(
    (songId: string) => resolveDownloadedPathWithResilience(songId, dispatch),
    [dispatch]
  );
  const playQueue = useAppSelector((state) => state.playQueue);
  const player = useAppSelector((state) => state.player);
  const config = useAppSelector((state) => state.config);
  const misc = useAppSelector((state) => state.misc);
  const isJukebox = useAppSelector((state) => state.jukebox?.enabled ?? false);
  const eq = useAppSelector((state) => state.eq as EqState);
  const peq = useAppSelector((state) => state.peq as PeqState);
  // Counter instead of boolean — increment on each successful init/restart to re-trigger
  // the play/pause and volume effects that depend on it.
  const [mpvReady, setMpvReady] = useState(0);

  const eqDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);
  // Prevents the path/gapless/replaygain restart effect from firing on mount
  // (initial setup is handled by the initialize effect below).
  const pathEffectMountedRef = useRef(false);
  const currentUrlRef = useRef<string>('');
  const preloadedNextUrlRef = useRef<string | null>(null);
  // Tracks the latest playQueue in event handlers to avoid stale closures
  const playQueueRef = useRef(playQueue);
  const configRef = useRef(config);
  // Tracks the latest songCachePath so effects that don't list `misc` in their
  // deps (to avoid changing when they fire) still read a fresh value
  const miscRef = useRef(misc);
  // Tracks the latest player status so the init callback reads the live value
  const playerStatusRef = useRef(player.status);
  // Set before dispatching auto-next to suppress the queue-reload effect
  const autoNextPendingRef = useRef(false);

  useEffect(() => {
    playQueueRef.current = playQueue;
  }, [playQueue]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    miscRef.current = misc;
  }, [misc]);

  useEffect(() => {
    playerStatusRef.current = player.status;
  }, [player.status]);

  const getEntryList = () => {
    const pq = playQueueRef.current;
    return pq[entryListKey(pq)] ?? [];
  };

  // Returns the song to preload as the next track after `fromIndex`.
  // Returns null when there is nothing to preload (end of queue with no repeat).
  const getNextSong = (fromIndex?: number) => {
    const pq = playQueueRef.current;
    const list = pq[entryListKey(pq)] ?? [];
    if (list.length === 0) return null;
    const base = fromIndex ?? pq.currentIndex;
    // Don't wrap around at the end when repeat is off
    if (pq.repeat === 'none' && base >= list.length - 1) return null;
    const nextIndex = getNextPlayerIndex(list.length, pq.repeat, base) ?? 0;
    return list[nextIndex] ?? null;
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
    const properties: Record<string, unknown> = {};
    if (initialAf) properties.af = initialAf;

    ipcRenderer
      .invoke('player-initialize', {
        binaryPath: mpvPath || undefined,
        extraParameters,
        properties,
      })
      .then(async () => {
        // Mark as initialized and load the queue immediately so that pressing
        // play during startup works. Audio device validation runs afterward
        // as a non-blocking background task.
        initializedRef.current = true;

        // Load initial queue if a song is already selected
        const pq = playQueueRef.current;
        const list = pq[entryListKey(pq)] ?? [];
        const currentSong = list[pq.currentIndex];
        const currentUrl = currentSong?.streamUrl;
        if (currentUrl) {
          currentUrlRef.current = currentUrl;
          const nextSong = getNextSong();
          const nextUrl = nextSong?.streamUrl || null;
          preloadedNextUrlRef.current = nextUrl;
          const pause = playerStatusRef.current !== 'PLAYING';
          const [resolvedCurrentUrl, resolvedNextUrl] = await Promise.all([
            resolveSongPlaybackSource(
              currentSong,
              miscRef.current.songCachePath,
              cache.exists,
              resolveDownloadedPath
            ),
            resolveSongPlaybackSource(
              nextSong ?? undefined,
              miscRef.current.songCachePath,
              cache.exists,
              resolveDownloadedPath
            ),
          ]);
          ipcRenderer.send('player-set-queue', {
            current: resolvedCurrentUrl,
            next: resolvedNextUrl,
            pause,
          });
        }
        // Increment to re-trigger the play/pause and volume effects
        setMpvReady((v) => v + 1);

        // Validate the saved audio device in the background — if it no longer
        // exists, fall back to 'auto' and notify the user.
        const savedDeviceId = config.playback.mpvAudioDeviceId;
        if (savedDeviceId) {
          try {
            const devices = await ipcRenderer.invoke('player-get-audio-devices');
            if (
              devices?.length > 0 &&
              !devices.find((d: { value: string }) => d.value === savedDeviceId)
            ) {
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

        return null;
      })
      .catch(() => {});

    const onAutoNext = () => {
      const pq = playQueueRef.current;
      const list = getEntryList();
      if (list.length === 0) return;

      const endedSong = list[pq.currentIndex];
      if (endedSong?.isPodcast && configRef.current.serverType === Server.Subsonic) {
        apiController({
          serverType: configRef.current.serverType,
          endpoint: 'deleteBookmark',
          args: { id: endedSong.id },
        }).catch(() => {});
      }

      if (settings.get('cacheSongs') && endedSong && !endedSong.isPodcast) {
        cacheSong(
          `${endedSong.id}.${endedSong.suffix || 'mp3'}`,
          endedSong.streamUrl.replace(/stream/, 'download')
        )
          .then((cached) => {
            if (cached) dispatch(addCachedSongId(endedSong.id));
            return undefined;
          })
          .catch(() => {});
      }

      // At end of queue with no repeat — MPV stopped, just sync Redux status
      if (pq.repeat === 'none' && pq.currentIndex >= list.length - 1) {
        dispatch(setStatus('PAUSED'));
        return;
      }

      const nextIndex = getNextPlayerIndex(list.length, pq.repeat, pq.currentIndex) ?? 0;
      const nextSong = list[nextIndex];

      // Compute next-next from OLD state before dispatching, to avoid stale playQueueRef
      const newNextSong = getNextSong(nextIndex);
      const newNextUrl = newNextSong?.streamUrl || null;

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
      resolveSongPlaybackSource(
        newNextSong ?? undefined,
        miscRef.current.songCachePath,
        cache.exists,
        resolveDownloadedPath
      )
        .then((resolvedNewNextUrl) => {
          // A newer auto-next or queue change may have superseded this preload
          // while it was in flight — don't let a stale lookup override it.
          if (preloadedNextUrlRef.current !== newNextUrl) return null;
          ipcRenderer.send('player-auto-next', { url: resolvedNewNextUrl });
          return null;
        })
        .catch(() => {});
    };

    const onPlay = () => dispatch(setStatus('PLAYING'));
    const onStop = () => dispatch(setStatus('PAUSED'));
    const onFallback = () => {
      initializedRef.current = false;
      notifyToast(
        'error',
        t(
          'player.mpvNotFound',
          'MPV not found. Install MPV and set its path in Settings → Playback, or add it to your system PATH.'
        )
      );
    };

    ipcRenderer.on('renderer-player-auto-next', onAutoNext);
    ipcRenderer.on('renderer-player-play', onPlay);
    ipcRenderer.on('renderer-player-stop', onStop);
    ipcRenderer.on('renderer-player-fallback', onFallback);

    return () => {
      ipcRenderer.removeListener('renderer-player-auto-next', onAutoNext);
      ipcRenderer.removeListener('renderer-player-play', onPlay);
      ipcRenderer.removeListener('renderer-player-stop', onStop);
      ipcRenderer.removeListener('renderer-player-fallback', onFallback);
      ipcRenderer.send('player-quit');
      initializedRef.current = false;
      if (eqDebounceRef.current) clearTimeout(eqDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load new track when the user changes songs (not when MPV auto-advances)
  useEffect(() => {
    if (!initializedRef.current) return;
    if (isJukebox) return; // jukebox mode: server controls playback

    // auto-next already handled the transition — just clear the flag
    if (autoNextPendingRef.current) {
      autoNextPendingRef.current = false;
      return;
    }

    const pq = playQueueRef.current;
    const list = pq[entryListKey(pq)] ?? [];
    const currentSong = list[pq.currentIndex];
    const currentUrl = currentSong?.streamUrl;
    if (!currentUrl || currentUrl === currentUrlRef.current) {
      return;
    }

    currentUrlRef.current = currentUrl;

    const nextSong = getNextSong();
    const nextUrl = nextSong?.streamUrl || null;
    preloadedNextUrlRef.current = nextUrl;
    // Use playerStatusRef.current (not player.status) to avoid stale closure issues.
    // player-set-queue pre-pauses MPV before loading, so any player-play arriving
    // from the play-effect (separate render due to electron-redux batching) will
    // override the pre-pause and make MPV play correctly.
    const shouldPause = playerStatusRef.current !== 'PLAYING';
    Promise.all([
      resolveSongPlaybackSource(
        currentSong,
        miscRef.current.songCachePath,
        cache.exists,
        resolveDownloadedPath
      ),
      resolveSongPlaybackSource(
        nextSong ?? undefined,
        miscRef.current.songCachePath,
        cache.exists,
        resolveDownloadedPath
      ),
    ])
      .then(([resolvedCurrentUrl, resolvedNextUrl]) => {
        // A newer track change may have superseded this resolution while it was
        // in flight — don't let a stale lookup override the latest selection.
        if (currentUrlRef.current !== currentUrl) return null;
        ipcRenderer.send('player-set-queue', {
          current: resolvedCurrentUrl,
          next: resolvedNextUrl,
          pause: shouldPause,
        });
        return null;
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playQueue.currentIndex, playQueue.currentSongId]);

  // Keep MPV's preloaded next track (playlist position 1) in sync when the queue changes
  useEffect(() => {
    if (!initializedRef.current) return;
    if (autoNextPendingRef.current) return;
    const nextSong = getNextSong();
    const nextUrl = nextSong?.streamUrl || null;
    if (nextUrl === preloadedNextUrlRef.current) return;
    preloadedNextUrlRef.current = nextUrl;
    resolveSongPlaybackSource(
      nextSong ?? undefined,
      miscRef.current.songCachePath,
      cache.exists,
      resolveDownloadedPath
    )
      .then((resolvedNextUrl) => {
        // A newer queue change may have superseded this preload while it was
        // in flight — don't let a stale lookup override it.
        if (preloadedNextUrlRef.current !== nextUrl) return null;
        ipcRenderer.send('player-set-queue-next', { url: resolvedNextUrl });
        return null;
      })
      .catch(() => {});
  }, [
    playQueue.currentIndex,
    playQueue.repeat,
    playQueue.entry,
    playQueue.shuffledEntry,
    playQueue.sortedEntry,
    resolveDownloadedPath,
  ]);

  // Restart current song from the beginning — fired when next/prev wraps to the same song
  useEffect(() => {
    if (!initializedRef.current) return;
    if (isJukebox) return;
    ipcRenderer.send('player-seek-to', 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playQueue.playerRestartCurrent]);

  // When jukebox is disabled, reset MPV position to 0 so the next local play
  // starts from the beginning rather than from where it was before jukebox.
  useEffect(() => {
    if (isJukebox || !initializedRef.current) return;
    ipcRenderer.send('player-seek-to', 0);
  }, [isJukebox]);

  // Play / pause — also fires when mpvReady flips so a click during init is not lost
  // When jukebox mode is enabled, always pause local MPV regardless of player status
  useEffect(() => {
    if (!initializedRef.current) return;
    if (isJukebox) {
      ipcRenderer.send('player-pause');
      return undefined;
    }
    if (player.status === 'PLAYING') {
      ipcRenderer.send('player-play');
    } else {
      ipcRenderer.send('player-pause');
    }
  }, [player.status, mpvReady, isJukebox]);

  // Volume (0–1 in Redux → 0–100 for MPV)
  // mpvReady in deps ensures volume is synced after every MPV init/reinit
  useEffect(() => {
    if (!initializedRef.current) return;
    ipcRenderer.send('player-volume', Math.round(playQueue.volume * 100));
  }, [playQueue.volume, mpvReady]);

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

  // Path / gapless / replaygain change — requires MPV restart.
  // Uses pathEffectMountedRef instead of initializedRef so the effect also fires after a
  // failed start (initializedRef is false after onFallback) — allowing the user to correct
  // a wrong binary path and have MPV start without needing to switch backends.
  useEffect(() => {
    if (!pathEffectMountedRef.current) {
      pathEffectMountedRef.current = true;
      return;
    }
    const { mpvPath, mpvGapless, mpvAudioDeviceId, mpvReplayGain } = config.playback;
    const extraParameters: string[] = [
      `--gapless-audio=${mpvGapless}`,
      `--replaygain=${mpvReplayGain}`,
    ];
    if (mpvAudioDeviceId) extraParameters.push(`--audio-device=${mpvAudioDeviceId}`);
    const afString = buildMpvAfChain(eq, peq);
    const properties: Record<string, unknown> = {};
    if (afString) properties.af = afString;

    const pq = playQueueRef.current;
    const list = pq[entryListKey(pq)] ?? [];
    const currentSong = list[pq.currentIndex];
    const currentUrl = currentSong?.streamUrl;
    const nextSong = getNextSong();
    const nextUrl = nextSong?.streamUrl || null;

    let cancelled = false;
    ipcRenderer
      .invoke('player-restart', {
        binaryPath: mpvPath || undefined,
        extraParameters,
        properties,
      })
      .then(async () => {
        if (cancelled) return null;
        initializedRef.current = true;
        setMpvReady((v) => v + 1);
        if (currentUrl) {
          preloadedNextUrlRef.current = nextUrl;
          const [resolvedCurrentUrl, resolvedNextUrl] = await Promise.all([
            resolveSongPlaybackSource(
              currentSong,
              miscRef.current.songCachePath,
              cache.exists,
              resolveDownloadedPath
            ),
            resolveSongPlaybackSource(
              nextSong ?? undefined,
              miscRef.current.songCachePath,
              cache.exists,
              resolveDownloadedPath
            ),
          ]);
          if (cancelled) return null;
          ipcRenderer.send('player-set-queue', {
            current: resolvedCurrentUrl,
            next: resolvedNextUrl,
            pause: playerStatusRef.current !== 'PLAYING',
          });
        }
        return null;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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
