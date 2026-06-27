import { useCallback, useEffect, useRef, useState } from 'react';
import { ipcRenderer } from '../components/shared/bridge';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { setJukeboxEnabled, setJukeboxStatus } from '../redux/jukeboxSlice';
import { setStatus } from '../redux/playerSlice';
import {
  setVolume,
  setCurrentIndex,
  incrementCurrentIndex,
  decrementCurrentIndex,
  clearPlayQueue,
} from '../redux/playQueueSlice';
import { apiController } from '../api/controller';
import { getCurrentEntryList } from '../shared/utils';
import { notifyToast } from '../components/shared/toast';

const POLL_INTERVAL_PLAYING = 1000;
const POLL_INTERVAL_PAUSED = 3000;

const useJukebox = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const jukebox = useAppSelector((state) => state.jukebox);
  const playQueue = useAppSelector((state) => state.playQueue);
  const config = useAppSelector((state) => state.config);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mutedRef = useRef(false);
  const pausePositionRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const syncInProgressRef = useRef<Promise<void> | null>(null);
  const pollFailureCountRef = useRef(0);
  const [loopCount, setLoopCount] = useState(0);
  // Refs to avoid stale closures in poll without adding them to useCallback deps
  const playQueueRef = useRef(playQueue);
  const jukeboxRef = useRef(jukebox);
  useEffect(() => {
    playQueueRef.current = playQueue;
  }, [playQueue]);
  useEffect(() => {
    jukeboxRef.current = jukebox;
  }, [jukebox]);

  const serverType = config.serverType;

  const callJukebox = useCallback(
    (args: Parameters<typeof apiController>[0]['args']) =>
      apiController({ serverType, endpoint: 'jukeboxControl', args }),
    [serverType]
  );

  // Sync the current play queue to the server jukebox playlist and start at the given index.
  // Order matters: set loads the playlist, start launches MPV (creates the IPC socket),
  // then skip seeks to the right track. Skipping before start fails with "connection refused".
  const syncQueueToServer = useCallback(
    async (startIndex = 0) => {
      // If a sync is already running, await it before starting a new one so that
      // concurrent calls (e.g. rapid queue modifications) do not interleave their
      // set/start/skip IPC sequences and leave the server in an inconsistent state.
      // Reading playQueueRef.current AFTER the await ensures we always sync the
      // latest playlist state rather than a stale snapshot.
      if (syncInProgressRef.current) {
        try {
          await syncInProgressRef.current;
        } catch {
          /* ignore errors from the previous sync */
        }
      }
      const pq = playQueueRef.current;
      const entryList = getCurrentEntryList(pq);
      const songs = pq[entryList];
      if (songs.length === 0) return;
      // Internet radio streams are not valid jukebox queue items — the server cannot
      // resolve a radio station URL via the jukebox song-ID API.
      if (songs.some((s) => s.isRadio)) return;
      const ids = songs.map((s) => s.id);
      const promise = (async () => {
        await callJukebox({ action: 'set', id: ids });
        await callJukebox({ action: 'start' });
        if (startIndex > 0) {
          await callJukebox({ action: 'skip', index: startIndex, offset: 0 });
        }
      })();
      syncInProgressRef.current = promise;
      try {
        await promise;
      } finally {
        syncInProgressRef.current = null;
      }
    },
    [callJukebox]
  );

  // Kept current every render so poll can call it without adding it to poll's deps
  const syncQueueToServerRef = useRef(syncQueueToServer);
  syncQueueToServerRef.current = syncQueueToServer;

  // Poll server state and sync Redux — uses refs to avoid restarting the timer on every state change
  const poll = useCallback(async () => {
    if (!jukeboxRef.current?.enabled) return;
    try {
      const result = await callJukebox({ action: 'status' });
      if (!result) return;
      pollFailureCountRef.current = 0;
      // Capture playing transition before updating anything
      const wasPlaying = wasPlayingRef.current;
      wasPlayingRef.current = result.playing;
      dispatch(setJukeboxStatus(result));
      dispatch(setStatus(result.playing ? 'PLAYING' : 'PAUSED'));
      // Sync current track index to Redux play queue
      if (result.currentIndex >= 0) {
        const pq = playQueueRef.current;
        const entryList = getCurrentEntryList(pq);
        const song = pq[entryList][result.currentIndex];
        if (song && song.uniqueId !== pq.currentSongUniqueId) {
          if (pq.repeat === 'one') {
            // Server advanced to the next song, but repeat-one means we stay on the
            // current song. Skip back immediately and count it as a loop.
            await callJukebox({ action: 'skip', index: pq.currentIndex, offset: 0 });
            setLoopCount((c) => c + 1);
          } else {
            dispatch(setCurrentIndex(song));
          }
        }
      }
      // Sync gain to local volume — skip when locally muted so the bar doesn't jump to 0
      if (!mutedRef.current) {
        const pq = playQueueRef.current;
        if (Math.abs(result.gain - pq.volume) > 0.01) {
          dispatch(setVolume(result.gain));
        }
      }
      // Repeat-all / repeat-one: server reached end of playlist and stopped naturally.
      // wasPlayingRef detects the playing→stopped transition. Manual pause/stop call
      // poll() immediately, so by the next scheduled poll wasPlaying is already false
      // and this branch is skipped — only a natural end triggers it.
      if (!result.playing && wasPlaying) {
        const pq = playQueueRef.current;
        const entryList = getCurrentEntryList(pq);
        const songs = pq[entryList];
        if (songs.length > 0 && pq.repeat === 'all') {
          await syncQueueToServerRef.current(0);
          dispatch(setCurrentIndex(songs[0]));
          setLoopCount((c) => c + 1);
        } else if (songs.length > 0 && pq.repeat === 'one') {
          await syncQueueToServerRef.current(result.currentIndex >= 0 ? result.currentIndex : 0);
          setLoopCount((c) => c + 1);
        }
      }
    } catch {
      pollFailureCountRef.current += 1;
      if (pollFailureCountRef.current >= 3) {
        notifyToast('warning', t('Jukebox server is unreachable. Check your connection.'));
        pollFailureCountRef.current = 0;
      }
    }
  }, [callJukebox, dispatch, t]); // stable — uses refs, not reactive state

  // Start/stop polling when jukebox is enabled/disabled
  useEffect(() => {
    if (!jukebox.enabled) {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      return undefined;
    }

    const schedule = () => {
      const interval = jukeboxRef.current?.status?.playing
        ? POLL_INTERVAL_PLAYING
        : POLL_INTERVAL_PAUSED;
      pollTimerRef.current = setTimeout(async () => {
        await poll();
        if (jukeboxRef.current?.enabled) schedule();
      }, interval);
    };

    schedule();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [jukebox.enabled, poll]);

  // When the user selects a song locally (double-click, album play), sync the full queue to the
  // server and start playback. The ID comparison prevents re-syncing on poll-driven advances
  // (where the server already has the right song and the IDs match).
  useEffect(() => {
    if (!jukeboxRef.current?.enabled) return;
    const pq = playQueueRef.current;
    const entryList = getCurrentEntryList(pq);
    const localSong = pq[entryList][pq.currentIndex];
    if (!localSong?.id) return;
    const jk = jukeboxRef.current;
    const serverCurrentId = jk?.status?.entry?.[jk?.status?.currentIndex ?? -1];
    if (localSong.id === serverCurrentId) return;
    syncQueueToServer(pq.currentIndex).catch(() => {});
  }, [playQueue.entryVersion, syncQueueToServer]);

  // When shuffle is toggled, the active playlist order changes but the current song stays the same.
  // The ID comparison above would see a match and skip the sync, leaving the server with the wrong
  // playlist order. Always re-sync when shuffle changes so next/prev work correctly.
  useEffect(() => {
    if (!jukeboxRef.current?.enabled) return;
    const pq = playQueueRef.current;
    const entryList = getCurrentEntryList(pq);
    if (pq[entryList].length === 0) return;
    syncQueueToServer(pq.currentIndex).catch(() => {});
  }, [playQueue.shuffle, syncQueueToServer]);

  // --- Jukebox control functions used by PlayerBar ---

  const enable = useCallback(async () => {
    try {
      const result = await callJukebox({ action: 'status' });
      if (result === null) {
        notifyToast(
          'error',
          t(
            'Jukebox not available. Check that it is enabled on your server and that your account has permission.'
          )
        );
        return;
      }
      // Clear local queue so jukebox and local playback are fully separate
      dispatch(clearPlayQueue());
      dispatch(setStatus('PAUSED'));
      // Sync server gain to current local volume so the bar doesn't jump on enable/disable
      const localVolume = playQueueRef.current.volume;
      await callJukebox({ action: 'setGain', gain: localVolume });
      dispatch(setJukeboxEnabled(true));
      // Override position to 0 — the server may still report the last playback position
      // even after being stopped, but we always start fresh when enabling jukebox.
      dispatch(setJukeboxStatus({ ...result, gain: localVolume, position: 0 }));
      dispatch(setStatus('PAUSED'));
    } catch {
      notifyToast(
        'error',
        t(
          'Jukebox not available. Check that it is enabled on your server and that your account has permission.'
        )
      );
    }
  }, [callJukebox, dispatch, t]);

  const disable = useCallback(async () => {
    await callJukebox({ action: 'stop' }).catch(() => {});
    // Clear queue before disabling so the MpvPlayer resync effect sees an empty
    // queue and skips loading — jukebox and local playback are fully separate.
    dispatch(clearPlayQueue());
    dispatch(setStatus('PAUSED'));
    dispatch(setJukeboxEnabled(false));
  }, [callJukebox, dispatch]);

  const setMuted = useCallback(
    async (muted: boolean) => {
      if (!jukeboxRef.current?.enabled) return;
      mutedRef.current = muted;
      const gain = muted ? 0 : playQueueRef.current.volume;
      await callJukebox({ action: 'setGain', gain });
    },
    [callJukebox]
  );

  const play = useCallback(async () => {
    if (!jukeboxRef.current?.enabled) return;
    const pq = playQueueRef.current;
    const jk = jukeboxRef.current;
    const entryList = getCurrentEntryList(pq);
    const localSong = pq[entryList][pq.currentIndex];
    const serverCurrentId = jk?.status?.entry?.[jk?.status?.currentIndex ?? -1];
    const savedPosition = pausePositionRef.current;
    pausePositionRef.current = 0;
    if (localSong?.id && localSong.id === serverCurrentId) {
      await callJukebox({ action: 'start' });
      if (savedPosition > 0) {
        const idx = jk?.status?.currentIndex ?? 0;
        await callJukebox({ action: 'skip', index: idx, offset: savedPosition });
      }
    } else {
      await syncQueueToServer(pq.currentIndex);
      if (savedPosition > 0) {
        await callJukebox({ action: 'skip', index: pq.currentIndex, offset: savedPosition });
      }
    }
    await poll();
  }, [syncQueueToServer, callJukebox, poll]);

  const pause = useCallback(async () => {
    if (!jukeboxRef.current?.enabled) return;
    wasPlayingRef.current = false; // prevent poll from treating this as a natural end
    pausePositionRef.current = Math.floor(jukeboxRef.current?.status?.position ?? 0);
    await callJukebox({ action: 'stop' });
    await poll();
  }, [callJukebox, poll]);

  const playPause = useCallback(async () => {
    if (jukeboxRef.current?.status?.playing) {
      await pause();
    } else {
      await play();
    }
  }, [play, pause]);

  const stop = useCallback(async () => {
    if (!jukeboxRef.current?.enabled) return;
    wasPlayingRef.current = false; // prevent poll from treating this as a natural end
    pausePositionRef.current = 0;
    const idx = jukeboxRef.current?.status?.currentIndex ?? -1;
    await callJukebox({ action: 'stop' });
    if (idx >= 0) await callJukebox({ action: 'skip', index: idx, offset: 0 });
    await poll();
  }, [callJukebox, poll]);

  const next = useCallback(async () => {
    if (!jukeboxRef.current?.enabled) return;
    const pq = playQueueRef.current;
    const entryList = getCurrentEntryList(pq);
    const total = pq[entryList].length;
    if (total === 0) return;
    const currentIdx = jukeboxRef.current?.status?.currentIndex ?? 0;
    const nextIndex = currentIdx + 1;
    if (nextIndex >= total && pq.repeat !== 'all') return;
    const target = nextIndex >= total ? 0 : nextIndex;
    wasPlayingRef.current = false; // prevent a concurrent scheduled poll from treating the end-of-stream as a natural end
    await callJukebox({ action: 'skip', index: target, offset: 0 });
    if (!jukeboxRef.current?.status?.playing) {
      pausePositionRef.current = 0;
      await callJukebox({ action: 'start' });
    }
    dispatch(incrementCurrentIndex('usingHotkey'));
    await poll();
  }, [callJukebox, dispatch, poll]);

  const prev = useCallback(async () => {
    if (!jukeboxRef.current?.enabled) return;
    const pq = playQueueRef.current;
    const entryList = getCurrentEntryList(pq);
    const total = pq[entryList].length;
    if (total === 0) return;
    const position = jukeboxRef.current?.status?.position ?? 0;
    const currentIdx = jukeboxRef.current?.status?.currentIndex ?? 0;
    wasPlayingRef.current = false; // prevent a concurrent scheduled poll from treating the end-of-stream as a natural end
    if (!playQueueRef.current.directPreviousTrack && position > 5) {
      await callJukebox({ action: 'skip', index: currentIdx, offset: 0 });
    } else {
      const prevIndex = currentIdx > 0 ? currentIdx - 1 : pq.repeat === 'all' ? total - 1 : 0;
      await callJukebox({ action: 'skip', index: prevIndex, offset: 0 });
      dispatch(decrementCurrentIndex('usingHotkey'));
    }
    if (!jukeboxRef.current?.status?.playing) {
      pausePositionRef.current = 0;
      await callJukebox({ action: 'start' });
    }
    await poll();
  }, [callJukebox, dispatch, poll]);

  const seek = useCallback(
    async (positionSeconds: number) => {
      if (!jukeboxRef.current?.enabled) return;
      // Wait for any in-progress queue sync — a racing set+start would reset the position
      if (syncInProgressRef.current) await syncInProgressRef.current;
      // Keep pausePositionRef in sync so play() resumes from the seeked position
      if (!jukeboxRef.current?.status?.playing) {
        pausePositionRef.current = Math.floor(positionSeconds);
      }
      // Use local currentIndex: more reliable than jukebox status right after a queue sync
      const idx = playQueueRef.current.currentIndex;
      await callJukebox({ action: 'skip', index: idx, offset: positionSeconds });
      await poll();
    },
    [callJukebox, poll]
  );

  const setGain = useCallback(
    async (gain: number) => {
      if (!jukeboxRef.current?.enabled) return;
      await callJukebox({ action: 'setGain', gain });
      dispatch(setVolume(gain));
    },
    [callJukebox, dispatch]
  );

  const pushQueue = useCallback(
    async (startIndex = 0) => {
      if (!jukeboxRef.current?.enabled) return;
      await syncQueueToServer(startIndex);
      await poll();
    },
    [syncQueueToServer, poll]
  );

  const skipToSong = useCallback(
    async (uniqueId: string) => {
      if (!jukeboxRef.current?.enabled) return;
      const pq = playQueueRef.current;
      const entryList = getCurrentEntryList(pq);
      const index = pq[entryList].findIndex((s) => s.uniqueId === uniqueId);
      if (index < 0) return;
      await callJukebox({ action: 'skip', index, offset: 0 });
      await poll();
    },
    [callJukebox, poll]
  );

  // Stop the server when the app closes while jukebox is active
  useEffect(() => {
    const handleStopOnClose = async () => {
      try {
        await callJukebox({ action: 'stop' });
      } catch {
        // best effort
      }
      ipcRenderer.send('jukebox-stopped');
    };
    ipcRenderer.on('stop-jukebox-on-close', handleStopOnClose);
    return () => {
      ipcRenderer.removeAllListeners('stop-jukebox-on-close');
    };
  }, [callJukebox]);

  return {
    enabled: jukebox.enabled,
    status: jukebox.status,
    loopCount,
    enable,
    disable,
    play,
    pause,
    playPause,
    stop,
    next,
    prev,
    seek,
    setGain,
    setMuted,
    pushQueue,
    skipToSong,
  };
};

export default useJukebox;
