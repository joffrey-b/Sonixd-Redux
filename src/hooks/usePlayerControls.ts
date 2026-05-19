import React, { useCallback, useEffect, useRef } from 'react';
import { ipcRenderer } from 'electron';
import { deflate, inflate } from 'zlib';
import { join } from 'path';
import { access, constants, readFile, writeFile } from 'fs';
import { useAppDispatch } from '../redux/hooks';
import {
  decrementCurrentIndex,
  fixPlayer2Index,
  incrementCurrentIndex,
  PlayQueueSaveState,
  restoreState,
  setVolume,
  toggleDisplayQueue,
  toggleRepeat,
  toggleShuffle,
} from '../redux/playQueueSlice';
import { setStatus } from '../redux/playerSlice';
import { apiController } from '../api/controller';
import { Server } from '../types';
import { settings } from '../components/shared/setDefaultSettings';

type PlayerControlOverrides = {
  playPause?: () => void | Promise<void>;
  next?: () => void | Promise<void>;
  prev?: () => void | Promise<void>;
  play?: () => void | Promise<void>;
  pause?: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
  seekTo?: (t: number) => void | Promise<void>;
  seekBackward?: () => void | Promise<void>;
  seekForward?: () => void | Promise<void>;
};

const usePlayerControls = (
  config: any,
  player: any,
  playQueue: any,
  currentEntryList: any,
  playersRef: any,
  isDraggingVolume: any,
  setIsDraggingVolume: any,
  setLocalVolume: any,
  setCurrentTime: any,
  seekPositionRef: React.MutableRefObject<number> | null = null,
  overrides: PlayerControlOverrides = {}
) => {
  const dispatch = useAppDispatch();
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  const handleNextTrack = useCallback(() => {
    if (playQueue.current?.isRadio) return;
    if (playQueue[currentEntryList].length > 0) {
      // If on the last track of the queue without repeat set as all, ignore
      if (
        playQueue.repeat !== 'all' &&
        playQueue.currentIndex === playQueue[currentEntryList].length - 1
      ) {
        return;
      }

      dispatch(incrementCurrentIndex('usingHotkey'));
      dispatch(setStatus('PLAYING'));
    }
  }, [currentEntryList, dispatch, playQueue]);

  const handlePrevTrack = useCallback(() => {
    if (playQueue.current?.isRadio) return;
    if (playQueue[currentEntryList].length === 0) return;
    const { currentPlayer } = playQueue;
    // MPV doesn't use the web audio elements — read position from the ref
    // passed by PlayerBar (kept current via IPC). Fall back to audioEl for web backend.
    const currentSeek =
      seekPositionRef?.current ??
      (currentPlayer === 1
        ? playersRef.current.player1.audioEl.current.currentTime
        : playersRef.current.player2.audioEl.current.currentTime);

    const goToPrev =
      playQueue.directPreviousTrack ||
      (currentSeek < 5 &&
        !(
          (playQueue.repeat === 'none' || playQueue.repeat === 'one') &&
          playQueue.currentIndex === 0
        ));

    if (goToPrev) {
      dispatch(decrementCurrentIndex('usingHotkey'));
      dispatch(fixPlayer2Index());
    } else if (config.playback.playerBackend === 'mpv') {
      // MPV: web audio elements are unused, seek via IPC instead
      ipcRenderer.send('player-seek-to', 0);
    } else if (currentPlayer === 1) {
      playersRef.current.player1.audioEl.current.currentTime = 0;
      playersRef.current.player1.audioEl.current.volume = playQueue.volume ** 2;

      // Reset the alt player if reset during fade
      playersRef.current.player2.audioEl.current.currentTime = 0;
      playersRef.current.player2.audioEl.current.volume = 0;
      playersRef.current.player2.audioEl.current.pause();

      if (config.serverType === Server.Jellyfin && playQueue.scrobble) {
        apiController({
          serverType: config.serverType,
          endpoint: 'scrobble',
          args: {
            id: playQueue[currentEntryList][playQueue.player1.index]?.id,
            submission: false,
            position: 0,
            event: 'timeupdate',
          },
        });
      }
    } else {
      playersRef.current.player2.audioEl.current.currentTime = 0;
      playersRef.current.player2.audioEl.current.volume = playQueue.volume ** 2;

      // Reset the alt player if reset during fade
      playersRef.current.player1.audioEl.current.currentTime = 0;
      playersRef.current.player1.audioEl.current.volume = 0;
      playersRef.current.player1.audioEl.current.pause();

      if (config.serverType === Server.Jellyfin && playQueue.scrobble) {
        apiController({
          serverType: config.serverType,
          endpoint: 'scrobble',
          args: {
            id: playQueue[currentEntryList][playQueue.player2.index]?.id,
            submission: false,
            position: 0,
            event: 'timeupdate',
          },
        });
      }
    }

    dispatch(setStatus('PLAYING'));
  }, [
    config.playback.playerBackend,
    config.serverType,
    currentEntryList,
    dispatch,
    playQueue,
    playersRef,
    seekPositionRef,
  ]);

  const handlePlayPause = useCallback(() => {
    if (playQueue[currentEntryList].length > 0) {
      if (player.status === 'PAUSED') {
        navigator.mediaSession.playbackState = 'playing';
        dispatch(setStatus('PLAYING'));
      } else {
        navigator.mediaSession.playbackState = 'paused';
        dispatch(setStatus('PAUSED'));
      }
    }
  }, [currentEntryList, dispatch, playQueue, player.status]);

  const handlePlay = useCallback(() => {
    navigator.mediaSession.playbackState = 'playing';
    dispatch(setStatus('PLAYING'));
  }, [dispatch]);

  const handlePause = useCallback(() => {
    navigator.mediaSession.playbackState = 'paused';
    dispatch(setStatus('PAUSED'));
  }, [dispatch]);

  const handleStop = useCallback(() => {
    playersRef.current.player2.audioEl.current.pause();
    playersRef.current.player2.audioEl.current.currentTime = 0;
    playersRef.current.player1.audioEl.current.pause();
    playersRef.current.player1.audioEl.current.currentTime = 0;
    setCurrentTime(0);

    navigator.mediaSession.playbackState = 'paused';

    setTimeout(() => {
      dispatch(setStatus('PAUSED'));
    }, 250);
  }, [dispatch, playersRef, setCurrentTime]);

  const handleSeekBackward = useCallback(() => {
    const seekBackwardInterval = Number(settings.get('seekBackwardInterval'));
    if (playQueue[currentEntryList].length > 0) {
      if (seekPositionRef !== null) {
        const newTime = Math.max(0, seekPositionRef.current - seekBackwardInterval);
        setCurrentTime(newTime);
        ipcRenderer.send('player-seek-to', newTime);
        return;
      }
      if (playQueue.isFading) {
        if (playQueue.currentPlayer === 1) {
          playersRef.current.player2.audioEl.current.pause();
          playersRef.current.player2.audioEl.current.currentTime = 0;
        } else {
          playersRef.current.player1.audioEl.current.pause();
          playersRef.current.player1.audioEl.current.currentTime = 0;
        }
      }

      if (playQueue.currentPlayer === 1) {
        const newTime =
          playersRef.current.player1.audioEl.current.currentTime - seekBackwardInterval;
        playersRef.current.player1.audioEl.current.currentTime = newTime;
        setCurrentTime(newTime);
      } else {
        const newTime =
          playersRef.current.player2.audioEl.current.currentTime - seekBackwardInterval;
        playersRef.current.player2.audioEl.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    }
  }, [currentEntryList, playQueue, playersRef, seekPositionRef, setCurrentTime]);

  const handleSeekForward = useCallback(() => {
    if (playQueue[currentEntryList].length > 0) {
      const seekForwardInterval = Number(settings.get('seekForwardInterval'));

      if (seekPositionRef !== null) {
        const duration = playQueue[currentEntryList][playQueue.currentIndex]?.duration ?? Infinity;
        const newTime = Math.min(seekPositionRef.current + seekForwardInterval, duration - 1);
        setCurrentTime(newTime);
        ipcRenderer.send('player-seek-to', newTime);
        return;
      }

      if (playQueue.isFading) {
        if (playQueue.currentPlayer === 1) {
          playersRef.current.player2.audioEl.current.pause();
          playersRef.current.player2.audioEl.current.currentTime = 0;
        } else {
          playersRef.current.player1.audioEl.current.pause();
          playersRef.current.player1.audioEl.current.currentTime = 0;
        }
      }

      if (playQueue.currentPlayer === 1) {
        const check = playersRef.current.player1.audioEl.current.currentTime + seekForwardInterval;
        const songDuration = playersRef.current.player1.audioEl.current.duration;
        const newTime = check > songDuration ? songDuration - 1 : check;
        playersRef.current.player1.audioEl.current.currentTime = newTime;
        setCurrentTime(newTime);
      } else {
        const check = playersRef.current.player2.audioEl.current.currentTime + seekForwardInterval;
        const songDuration = playersRef.current.player2.audioEl.current.duration;
        const newTime = check > songDuration ? songDuration - 1 : check;
        playersRef.current.player2.audioEl.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    }
  }, [currentEntryList, playQueue, playersRef, seekPositionRef, setCurrentTime]);

  const handleSeekSlider = useCallback(
    (e: number | any) => {
      // If trying to seek back while fading to the next track, we need to
      // pause and reset the next track so that they don't begin overlapping
      if (playQueue.isFading) {
        if (playQueue.currentPlayer === 1) {
          playersRef.current.player2.audioEl.current.pause();
          playersRef.current.player2.audioEl.current.currentTime = 0;
        } else {
          playersRef.current.player1.audioEl.current.pause();
          playersRef.current.player1.audioEl.current.currentTime = 0;
        }
      }

      if (playQueue.currentPlayer === 1) {
        playersRef.current.player1.audioEl.current.currentTime = e;
      } else {
        playersRef.current.player2.audioEl.current.currentTime = e;
      }

      setCurrentTime(e);
    },
    [playQueue.currentPlayer, playQueue.isFading, playersRef, setCurrentTime]
  );

  const handleSeekTo = useCallback(
    (seekTime: number) => {
      if (playQueue.currentPlayer === 1) {
        playersRef.current.player1.audioEl.current.currentTime = seekTime;
      } else {
        playersRef.current.player2.audioEl.current.currentTime = seekTime;
      }
      setCurrentTime(seekTime);
    },
    [playQueue.currentPlayer, playersRef, setCurrentTime]
  );

  const handleVolumeSlider = (e: number) => {
    if (!isDraggingVolume) {
      setIsDraggingVolume(true);
    }
    const vol = Number((e / 100).toFixed(2));
    setLocalVolume(vol);
  };

  const handleVolumeKey = useCallback(
    (e: any) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        const vol = Number((playQueue.volume + 0.05 > 1 ? 1 : playQueue.volume + 0.05).toFixed(2));
        setLocalVolume(vol);
        dispatch(setVolume(vol));
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        const vol = Number((playQueue.volume - 0.05 < 0 ? 0 : playQueue.volume - 0.05).toFixed(2));
        setLocalVolume(vol);
        dispatch(setVolume(vol));
      }
    },
    [dispatch, playQueue.volume, setLocalVolume]
  );

  const handleVolumeWheel = useCallback(
    (e: any) => {
      if (e.deltaY > 0) {
        if (!isDraggingVolume) {
          setIsDraggingVolume(true);
        }
        let vol = Number((playQueue.volume - 0.01).toFixed(2));
        vol = vol < 0 ? 0 : vol;
        setLocalVolume(vol);
        dispatch(setVolume(vol));
      } else {
        let vol = Number((playQueue.volume + 0.01).toFixed(2));
        vol = vol > 1 ? 1 : vol;
        setLocalVolume(vol);
        dispatch(setVolume(vol));
      }
    },
    [dispatch, isDraggingVolume, playQueue.volume, setIsDraggingVolume, setLocalVolume]
  );

  const handleRepeat = useCallback(() => {
    const currentRepeat = settings.get('repeat');
    const newRepeat = currentRepeat === 'none' ? 'all' : currentRepeat === 'all' ? 'one' : 'none';
    dispatch(toggleRepeat());
    settings.set('repeat', newRepeat);
  }, [dispatch]);

  const handleShuffle = useCallback(() => {
    dispatch(toggleShuffle());
    settings.set('shuffle', !settings.get('shuffle'));
  }, [dispatch]);

  const handleDisplayQueue = () => {
    dispatch(toggleDisplayQueue());
  };

  const handleSaveQueue = useCallback(
    (path: string) => {
      const queueLocation = join(path, 'queue');

      const data: PlayQueueSaveState = {
        entry: playQueue.entry,
        shuffledEntry: playQueue.shuffledEntry,

        // current song
        current: playQueue.current,
        currentIndex: playQueue.currentIndex,
        currentSongId: playQueue.currentSongId,
        currentSongUniqueId: playQueue.currentSongUniqueId,

        // players
        player1: playQueue.player1,
        player2: playQueue.player2,
        currentPlayer: playQueue.currentPlayer,

        // server the queue belongs to — used to prevent restoring across server switches
        serverUrl: localStorage.getItem('server') || '',
      };

      const dataString = JSON.stringify(data);

      // This whole compression task is actually quite quick
      // While we could add a notify toast, it would only show for a moment
      // before compression would finish.
      // Compression level 1 seems to give sufficient performance, as it was able to save
      // around 10k songs by using ~3.5 MB while still being quite fast.
      deflate(
        dataString,
        {
          level: 1,
        },
        (error, deflated) => {
          if (error) {
            ipcRenderer.send('saved-state');
          } else {
            writeFile(queueLocation, deflated, (writeError) => {
              if (writeError) console.error(writeError);
              ipcRenderer.send('saved-state');
            });
          }
        }
      );
    },
    [playQueue]
  );

  const handleRestoreQueue = useCallback(
    (path: string) => {
      const queueLocation = join(path, 'queue');
      access(queueLocation, constants.F_OK, (accessError) => {
        // If the file doesn't exist or we can't access it, just don't try
        if (accessError) {
          if ((accessError as any).code !== 'ENOENT') console.error(accessError);
          return;
        }

        readFile(queueLocation, (error, buffer) => {
          if (error) {
            console.error(error);
            return;
          }

          inflate(buffer, (decompressError, data) => {
            if (decompressError) {
              console.error(decompressError);
            } else {
              const parsed: PlayQueueSaveState = JSON.parse(data.toString());
              const savedServer = parsed.serverUrl || '';
              const currentServer = localStorage.getItem('server') || '';
              // Don't restore a queue that belongs to a different server
              if (savedServer && savedServer !== currentServer) return;
              dispatch(restoreState(parsed));
            }
          });
        });
      });
    },
    [dispatch]
  );

  useEffect(() => {
    ipcRenderer.on('player-next-track', () => {
      (overridesRef.current.next ?? handleNextTrack)();
    });

    ipcRenderer.on('player-prev-track', () => {
      (overridesRef.current.prev ?? handlePrevTrack)();
    });

    ipcRenderer.on('player-play-pause', () => {
      (overridesRef.current.playPause ?? handlePlayPause)();
    });

    ipcRenderer.on('player-play', () => {
      (overridesRef.current.play ?? handlePlay)();
    });

    ipcRenderer.on('player-pause', () => {
      (overridesRef.current.pause ?? handlePause)();
    });

    ipcRenderer.on('player-stop', () => {
      (overridesRef.current.stop ?? handleStop)();
    });

    ipcRenderer.on('player-shuffle', () => {
      handleShuffle();
    });

    ipcRenderer.on('player-repeat', () => {
      handleRepeat();
    });

    ipcRenderer.on('save-queue-state', (_event, path: string) => {
      handleSaveQueue(path);
    });

    ipcRenderer.on('restore-queue-state', (_event, path: string) => {
      handleRestoreQueue(path);
    });

    return () => {
      ipcRenderer.removeAllListeners('player-next-track');
      ipcRenderer.removeAllListeners('player-prev-track');
      ipcRenderer.removeAllListeners('player-play-pause');
      ipcRenderer.removeAllListeners('player-play');
      ipcRenderer.removeAllListeners('player-pause');
      ipcRenderer.removeAllListeners('player-stop');
      ipcRenderer.removeAllListeners('player-shuffle');
      ipcRenderer.removeAllListeners('player-repeat');
      ipcRenderer.removeAllListeners('save-queue-state');
      ipcRenderer.removeAllListeners('restore-queue-state');
    };
  }, [
    handleNextTrack,
    handlePause,
    handlePlay,
    handlePlayPause,
    handlePrevTrack,
    handleRepeat,
    handleShuffle,
    handleStop,
    handleSaveQueue,
    handleRestoreQueue,
  ]);

  useEffect(() => {
    const media = navigator.mediaSession;

    media.setActionHandler('play', () => (overridesRef.current.play ?? handlePlay)());
    media.setActionHandler('pause', () => (overridesRef.current.pause ?? handlePause)());
    media.setActionHandler('stop', () => (overridesRef.current.stop ?? handleStop)());
    media.setActionHandler('nexttrack', () => (overridesRef.current.next ?? handleNextTrack)());
    media.setActionHandler('previoustrack', () => (overridesRef.current.prev ?? handlePrevTrack)());
    media.setActionHandler('seekbackward', () =>
      (overridesRef.current.seekBackward ?? handleSeekBackward)()
    );
    media.setActionHandler('seekforward', () =>
      (overridesRef.current.seekForward ?? handleSeekForward)()
    );
    media.setActionHandler('seekto', ({ seekTime }) => {
      if (seekTime !== undefined) (overridesRef.current.seekTo ?? handleSeekTo)(seekTime);
    });
  }, [
    handlePlay,
    handlePause,
    handleStop,
    handleNextTrack,
    handlePrevTrack,
    handleSeekBackward,
    handleSeekForward,
    handleSeekTo,
  ]);

  return {
    handleNextTrack,
    handlePrevTrack,
    handlePlayPause,
    handleSeekBackward,
    handleSeekForward,
    handleSeekSlider,
    handleVolumeKey,
    handleVolumeSlider,
    handleVolumeWheel,
    handleRepeat,
    handleShuffle,
    handleDisplayQueue,
    handleStop,
  };
};

export default usePlayerControls;
