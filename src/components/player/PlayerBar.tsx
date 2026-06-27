import React, { useEffect, useState, useRef, useMemo, startTransition } from 'react';
import { ipcRenderer, settings } from '../shared/bridge';
import { useHotkeys } from 'react-hotkeys-hook';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { FlexboxGrid, Grid, Row, Col, Whisper } from 'rsuite';
import CommentingOIcon from '@rsuite/icons/legacy/CommentingO';
import UpIcon from '@rsuite/icons/legacy/Up';
import { WhisperInstance } from 'rsuite/Whisper';
import { useNavigate } from 'react-router-dom';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import format from 'format-duration';
import { useTranslation } from 'react-i18next';
import {
  PlayerContainer,
  PlayerColumn,
  PlayerControlIcon,
  DurationSpan,
  VolumeIcon,
  LinkButton,
  CoverArtContainer,
} from './styled';
import {
  setVolume,
  setStopAfterCurrent,
  incrementEntryPlayCount,
} from '../../redux/playQueueSlice';
import { setStatus } from '../../redux/playerSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import Player, { type PlayerRef } from './Player';
import MpvPlayer from './MpvPlayer';
import CustomTooltip from '../shared/CustomTooltip';
import placeholderImg from '../../img/placeholder.png';
import DebugWindow from '../debug/DebugWindow';
import { getCurrentEntryList, writeOBSFiles } from '../../shared/utils';
import {
  SecondaryTextWrapper,
  StyledButton,
  StyledInputNumber,
  StyledRate,
} from '../shared/styled';
import { Artist, Play, Server, Song } from '../../types';
import { InfoModal } from '../modal/Modal';
import useGetLyrics from '../../hooks/useGetLyrics';
import LyricsModal from './LyricsModal';
import usePlayerControls from '../../hooks/usePlayerControls';
import { setSidebar } from '../../redux/configSlice';
import Popup from '../shared/Popup';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import { apiController } from '../../api/controller';
import Slider from '../slider/Slider';
import useDiscordRpc from '../../hooks/useDiscordRpc';
import { incrementPlayCountInCache } from '../../hooks/useLibraryCache';
import { shouldScrobble as checkShouldScrobble } from '../../shared/scrobbleLogic';
import useJukebox from '../../hooks/useJukebox';
import { notifyToast } from '../shared/toast';

const PlayerBar = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const playQueue = useAppSelector((state) => state.playQueue);
  const player = useAppSelector((state) => state.player);
  const config = useAppSelector((state) => state.config);
  const isMpv = config.playback.playerBackend === 'mpv';
  const folder = useAppSelector((state) => state.folder);
  const dispatch = useAppDispatch();
  const [currentTime, setCurrentTime] = useState(0);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [currentEntryList, setCurrentEntryList] = useState<
    'sortedEntry' | 'shuffledEntry' | 'entry'
  >('entry');
  const [localVolume, setLocalVolume] = useState(Number(settings.get('volume')));
  const [muted, setMuted] = useState(false);
  const localVolumeRef = useRef(localVolume);
  const jukeboxSetGainRef = useRef<((v: number) => void) | null>(null);
  const [showCoverArtModal, setShowCoverArtModal] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [sleepTimerSeconds, setSleepTimerSeconds] = useState<number | null>(null);
  const [sleepTimerCustom, setSleepTimerCustom] = useState('');
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);
  const { handlePlayQueueAdd } = usePlayQueueHandler();
  const isRadio = Boolean(playQueue.current?.isRadio);
  const jukebox = useJukebox();
  const isJukebox = jukebox.enabled;
  // Updated every render — lets the IPC volume handlers call setGain without stale closure
  jukeboxSetGainRef.current = isJukebox && !muted ? jukebox.setGain : null;
  const songDuration = useMemo(
    () => format((playQueue[currentEntryList][playQueue.currentIndex]?.duration || 0) * 1000),
    [currentEntryList, playQueue]
  );
  const songCurrentTime = useMemo(
    () => format((isJukebox ? jukebox.status.position : currentTime) * 1000 || 0),
    [currentTime, isJukebox, jukebox.status.position]
  );

  const handlePlayRandom = async () => {
    setIsLoadingRandom(true);
    try {
      const res: Song[] = await apiController({
        serverType: config.serverType,
        endpoint: 'getRandomSongs',
        args: {
          size: 200,
          musicFolderId: folder.musicFolder,
        },
      });

      handlePlayQueueAdd({ byData: res, play: Play.Play });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setIsLoadingRandom(false);
    }
  };

  const playersRef = useRef<PlayerRef | null>(null);
  const currentTimeRef = useRef(currentTime);
  const podcastStopPressedRef = useRef(false);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  const sleepTimerWhisperRef = useRef<WhisperInstance>(null);
  const navigate = useNavigate();
  useDiscordRpc({ playersRef, currentTimeRef, isMpv });

  const isCurrentPodcastOrRadio = Boolean(
    playQueue.current?.isPodcast || playQueue.current?.isRadio
  );
  const { data: lyrics } = useGetLyrics(config, {
    id: isCurrentPodcastOrRadio ? undefined : playQueue.current?.id,
    artist: isCurrentPodcastOrRadio ? undefined : playQueue.current?.albumArtist,
    title: isCurrentPodcastOrRadio ? undefined : playQueue.current?.title,
  });

  useEffect(() => {
    setCurrentTime(0);
    if (!isMpv) {
      // Reset web audio element positions so the next local play starts from 0
      // even if the same song URL is reused (which would skip the src reload).
      if (playersRef.current?.player1?.audioEl?.current) {
        playersRef.current.player1.audioEl.current.currentTime = 0;
      }
      if (playersRef.current?.player2?.audioEl?.current) {
        playersRef.current.player2.audioEl.current.currentTime = 0;
      }
    }
  }, [isJukebox, isMpv]);

  useEffect(() => {
    if (isMpv || isJukebox) return undefined; // MPV/jukebox: time comes from IPC or polling
    if (player.status === 'PLAYING') {
      const interval = setInterval(() => {
        startTransition(() => {
          if (playQueue.currentPlayer === 1) {
            setCurrentTime(playersRef.current?.player1?.audioEl.current?.currentTime || 0);
          } else {
            setCurrentTime(playersRef.current?.player2?.audioEl.current?.currentTime || 0);
          }
        });
      }, 100);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [isMpv, isJukebox, playQueue.currentPlayer, player.status]);

  useEffect(() => {
    if (config.external.obs.enabled && config.external.obs.pollingInterval >= 100) {
      const interval = setInterval(() => {
        const currentPlayerRef =
          playQueue.currentPlayer === 1
            ? playersRef.current?.player1?.audioEl.current
            : playersRef.current?.player2?.audioEl.current;

        const progressMs = Math.floor(
          (isMpv ? currentTimeRef.current : currentPlayerRef?.currentTime || 0) * 1000
        );

        if (config.external.obs.type === 'web') {
          axios
            .post(
              config.external.obs.url,
              {
                data: {
                  album: playQueue.current?.album,
                  album_url: null,
                  artists: (playQueue.current?.artist || []).map((artist: Artist) => artist.title),
                  cover_url: playQueue.current?.image.match('placeholder')
                    ? undefined
                    : playQueue.current?.image.replaceAll('150', '350'),
                  duration: Math.floor((playQueue.current?.duration || 0) * 1000),
                  progress: progressMs,
                  status: player.status === 'PLAYING' ? 'playing' : 'stopped',
                  title: playQueue.current?.title,
                },
                date: Date.now(),
                hostname: 'Sonixd Redux',
              },
              {
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Headers': '*',
                  'Access-Control-Allow-Origin': '*',
                },
              }
            )
            // eslint-disable-next-line no-console
            .catch((e) => console.error(e));
        } else if (config.external.obs.path) {
          writeOBSFiles(config.external.obs.path, {
            album: playQueue.current?.album,
            album_url: null,
            artists: (playQueue.current?.artist || []).map((artist: Artist) => artist.title),
            cover_url: playQueue.current?.image.match('placeholder')
              ? undefined
              : playQueue.current?.image,
            duration: Math.floor((playQueue.current?.duration || 0) * 1000),
            progress: progressMs,
            status: player.status === 'PLAYING' ? 'playing' : 'stopped',
            title: playQueue.current?.title,
          });
        }
      }, config.external.obs.pollingInterval);

      return () => clearInterval(interval);
    }

    return undefined;
  }, [
    config.external.obs.enabled,
    config.external.obs.path,
    config.external.obs.pollingInterval,
    config.external.obs.type,
    config.external.obs.url,
    isMpv,
    playQueue,
    player.status,
  ]);

  useEffect(() => {
    setCurrentEntryList(getCurrentEntryList(playQueue));
  }, [playQueue]);

  const {
    handleNextTrack,
    handlePrevTrack,
    handlePlayPause,
    handleSeekBackward,
    handleSeekForward,
    handleSeekSlider,
    handleVolumeSlider,
    handleVolumeWheel,
    handleRepeat,
    handleShuffle,
    handleDisplayQueue,
    handleStop,
  } = usePlayerControls(
    config,
    player,
    playQueue,
    currentEntryList,
    playersRef,
    isDraggingVolume,
    setIsDraggingVolume,
    setLocalVolume,
    setCurrentTime,
    isMpv ? currentTimeRef : null,
    isJukebox
      ? {
          playPause: jukebox.playPause,
          next: jukebox.next,
          prev: jukebox.prev,
          play: jukebox.play,
          pause: jukebox.pause,
          stop: jukebox.stop,
          seekTo: jukebox.seek,
          seekBackward: () =>
            jukebox.seek(
              Math.max(0, jukebox.status.position - Number(settings.get('seekBackwardInterval')))
            ),
          seekForward: () => {
            const dur = playQueue[currentEntryList][playQueue.currentIndex]?.duration ?? Infinity;
            jukebox.seek(
              Math.min(
                jukebox.status.position + Number(settings.get('seekForwardInterval')),
                dur - 1
              )
            );
          },
        }
      : {}
  );

  // In MPV mode: pause and seek to 0 immediately — handleStop has a 250ms delay
  // before dispatching setStatus('PAUSED'), which would let MPV play from position 0
  // for ~250ms before pausing.
  const handleStopEffective = () => {
    if (playQueue.current?.isPodcast && config.serverType === Server.Subsonic) {
      // Delete any saved bookmark so next play starts from the beginning
      apiController({
        serverType: config.serverType,
        endpoint: 'deleteBookmark',
        args: { id: playQueue.current.id },
      }).catch(() => {});
      if (isMpv) {
        // For MPV: flag to suppress the next pause-triggered bookmark save
        podcastStopPressedRef.current = true;
      } else {
        // For web: reset currentTime to 0 synchronously before handleStop triggers the
        // pause event, so handleOnPause sees position 0 and does not save a bookmark
        if (playersRef.current?.player1?.audioEl?.current) {
          playersRef.current.player1.audioEl.current.currentTime = 0;
        }
        if (playersRef.current?.player2?.audioEl?.current) {
          playersRef.current.player2.audioEl.current.currentTime = 0;
        }
      }
    }
    handleStop();
    if (isMpv) {
      // Dispatch PAUSED immediately regardless — handleStop has a 250ms delay
      dispatch(setStatus('PAUSED'));
    }
    if (isMpv) {
      // Only send IPC commands when MPV is actually playing (not during podcasts)
      ipcRenderer.send('player-pause');
      ipcRenderer.send('player-seek-to', 0);
    }
  };

  // Jukebox-aware control handlers — defined early so hotkeys can reference them
  const effectiveHandlePlayPause = isJukebox ? jukebox.playPause : handlePlayPause;
  const effectiveHandleStop = isJukebox ? jukebox.stop : handleStopEffective;
  const effectiveHandleNext = isJukebox ? jukebox.next : handleNextTrack;
  const effectiveHandlePrev = isJukebox ? jukebox.prev : handlePrevTrack;

  useEffect(() => {
    setLocalVolume(Number(playQueue.volume.toPrecision(2)));
  }, [playQueue.volume]);

  useEffect(() => {
    // Handle volume slider dragging
    const debounce = setTimeout(() => {
      if (isDraggingVolume) {
        dispatch(setVolume(localVolume));
        if (isJukebox) {
          if (!muted) jukebox.setGain(localVolume);
        } else {
          const audioEl = (
            playQueue.currentPlayer === 1
              ? playersRef.current?.player1
              : playersRef.current?.player2
          )?.audioEl.current;
          if (audioEl) audioEl.volume = localVolume ** 2;
        }
        settings.set('volume', localVolume);
      }
      setIsDraggingVolume(false);
    }, 100);

    return () => clearTimeout(debounce);
    // jukebox.setGain is a stable useCallback — including jukebox (new object each render) would cause loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dispatch,
    isDraggingVolume,
    isJukebox,
    jukebox.setGain,
    localVolume,
    muted,
    playQueue.currentPlayer,
    playQueue.fadeDuration,
  ]);

  useEffect(() => {
    if (isMpv || isJukebox) return;
    // Set the seek back to 0 when the player is incremented/decremented, otherwise the
    // slider bar will temporarily stick to the current time of the previous track before resetting to 0
    const p1El = playersRef.current?.player1?.audioEl.current;
    const p2El = playersRef.current?.player2?.audioEl.current;
    p1El?.pause();
    p2El?.pause();
    if (p1El) p1El.currentTime = 0;
    if (p2El) p2El.currentTime = 0;
  }, [isMpv, isJukebox, playQueue.playerUpdated]);

  useEffect(() => {
    if (isMpv || isJukebox) return;
    // Restart the current song from the beginning without pausing — fired when next/prev
    // wraps back to the same song (single-song queue) or hits the start of the queue.
    const rp1El = playersRef.current?.player1?.audioEl.current;
    const rp2El = playersRef.current?.player2?.audioEl.current;
    if (rp1El) rp1El.currentTime = 0;
    if (rp2El) rp2El.currentTime = 0;

    if (player.status === 'PLAYING') {
      rp1El?.play().catch(() => {});
    }
    // player.status intentionally omitted from deps — this effect should only fire on
    // playerRestartCurrent, not on every play/pause toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMpv, isJukebox, playQueue.playerRestartCurrent]);

  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();

  // enableOnFormTags: ['slider', 'radio'] — react-slider's thumb has
  // role="slider" and RSuite's Rate (star rating) renders each star as
  // role="radio"; both take DOM focus on click (sliders intentionally, so
  // arrow keys can nudge the value afterward) but react-hotkeys-hook's
  // default ignore list treats both as form elements and silently suppresses
  // every hotkey while either has focus. These are global player controls,
  // not text entry, so they should keep working regardless of which slider
  // (seek/volume) or rating star was just clicked — unlike input/textarea/
  // select, which are deliberately left off this list so typing still
  // suppresses them as expected.
  const hk = config.hotkeys;
  useHotkeys(
    hk.playPause,
    () => effectiveHandlePlayPause(),
    { preventDefault: true, enableOnFormTags: ['slider', 'radio'] },
    [hk.playPause, effectiveHandlePlayPause]
  );
  useHotkeys(
    hk.nextTrack,
    () => effectiveHandleNext(),
    { preventDefault: true, enableOnFormTags: ['slider', 'radio'] },
    [hk.nextTrack, effectiveHandleNext]
  );
  useHotkeys(
    hk.prevTrack,
    () => effectiveHandlePrev(),
    { preventDefault: true, enableOnFormTags: ['slider', 'radio'] },
    [hk.prevTrack, effectiveHandlePrev]
  );
  useHotkeys(
    hk.volumeUp,
    () => {
      const v = Math.min(1, Math.round((localVolume + 0.05) * 100) / 100);
      setLocalVolume(v);
      dispatch(setVolume(v));
      if (isJukebox && !muted) jukebox.setGain(v);
    },
    { preventDefault: true, enableOnFormTags: ['slider', 'radio'] },
    [hk.volumeUp, localVolume, isJukebox, muted, jukebox.setGain]
  );
  useHotkeys(
    hk.volumeDown,
    () => {
      const v = Math.max(0, Math.round((localVolume - 0.05) * 100) / 100);
      setLocalVolume(v);
      dispatch(setVolume(v));
      if (isJukebox && !muted) jukebox.setGain(v);
    },
    { preventDefault: true, enableOnFormTags: ['slider', 'radio'] },
    [hk.volumeDown, localVolume, isJukebox, muted, jukebox.setGain]
  );
  useHotkeys(
    hk.mute,
    () => setMuted((m) => !m),
    { preventDefault: true, enableOnFormTags: ['slider', 'radio'] },
    [hk.mute]
  );

  useEffect(() => {
    localVolumeRef.current = localVolume;
  }, [localVolume]);

  useEffect(() => {
    ipcRenderer.on('player-volume-up', () => {
      const v = Math.min(1, Math.round((localVolumeRef.current + 0.05) * 100) / 100);
      setLocalVolume(v);
      dispatch(setVolume(v));
      jukeboxSetGainRef.current?.(v);
    });
    ipcRenderer.on('player-volume-down', () => {
      const v = Math.max(0, Math.round((localVolumeRef.current - 0.05) * 100) / 100);
      setLocalVolume(v);
      dispatch(setVolume(v));
      jukeboxSetGainRef.current?.(v);
    });
    ipcRenderer.on('player-mute', () => {
      setMuted((m) => !m);
    });
    return () => {
      ipcRenderer.removeAllListeners('player-volume-up');
      ipcRenderer.removeAllListeners('player-volume-down');
      ipcRenderer.removeAllListeners('player-mute');
    };
  }, [dispatch]);

  useEffect(() => {
    if (config.player.globalShortcuts) {
      ipcRenderer.send('enable-global-shortcuts');
    } else {
      ipcRenderer.send('disable-global-shortcuts');
    }
  }, [config.player.globalShortcuts, config.hotkeys]);

  // Use a ref so jukebox polling (which flips player.status every 1-3s) doesn't reset
  // the 1-second countdown timeout on every poll cycle.
  const playerStatusForSleepRef = useRef(player.status);
  useEffect(() => {
    playerStatusForSleepRef.current = player.status;
  }, [player.status]);

  useEffect(() => {
    if (sleepTimerSeconds === null) return undefined;
    if (sleepTimerSeconds <= 0) {
      if (playerStatusForSleepRef.current === 'PLAYING') effectiveHandlePlayPause();
      setSleepTimerSeconds(null);
      return undefined;
    }
    const timeout = setTimeout(
      () => setSleepTimerSeconds((s) => (s !== null && s > 0 ? s - 1 : null)),
      1000
    );
    return () => clearTimeout(timeout);
  }, [sleepTimerSeconds, effectiveHandlePlayPause]);

  const formatSleepTimer = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const SLEEP_PRESETS = [5, 15, 30, 45, 60, 90];

  // In MPV mode: receive time updates from main process instead of polling the audio element
  useEffect(() => {
    if (!isMpv) return undefined;
    const handler = (_: unknown, time: number) => startTransition(() => setCurrentTime(time));
    ipcRenderer.on('renderer-player-current-time', handler);
    return () => {
      ipcRenderer.removeAllListeners('renderer-player-current-time');
    };
  }, [isMpv]);

  // In MPV mode: mute is local state only, so sync it to MPV directly
  useEffect(() => {
    if (!isMpv) return;
    ipcRenderer.send('player-mute', muted);
  }, [isMpv, muted]);

  // In jukebox mode: mute by setting server gain to 0, unmute by restoring server gain
  useEffect(() => {
    if (!isJukebox) return;
    jukebox.setMuted(muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJukebox, muted, jukebox.setMuted]);

  // MPV scrobbling — reset submission flag on each new song or track restart (loop)
  const mpvSubmissionScrobbledRef = useRef(false);
  const mpvPrevTimeRef = useRef(0);
  const [mpvRestartCount, setMpvRestartCount] = useState(0);
  const mpvNowPlayingTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isMpv) return;
    // Block scrobbling until the new song's time arrives — prevents a stale currentTime
    // from the previous song triggering an immediate scrobble on the new song.
    mpvSubmissionScrobbledRef.current = true;
  }, [isMpv, playQueue.currentSongId]);
  useEffect(() => {
    if (!isMpv) return;
    if (mpvPrevTimeRef.current > 5 && currentTime < 2) {
      // Time jumped back — loop or new song after a long track
      mpvSubmissionScrobbledRef.current = false;
      setMpvRestartCount((c) => c + 1);
    } else if (currentTime < 2) {
      // New song starting from the beginning (first ticks confirm time is fresh)
      mpvSubmissionScrobbledRef.current = false;
    }
    mpvPrevTimeRef.current = currentTime;
  }, [isMpv, currentTime]);

  // MPV scrobbling — "now playing" notification 5s after playback starts
  useEffect(() => {
    if (
      !isMpv ||
      isJukebox ||
      !playQueue.scrobble ||
      player.status !== 'PLAYING' ||
      playQueue.current?.isRadio ||
      playQueue.current?.isPodcast
    )
      return undefined;
    if (mpvNowPlayingTimerRef.current) clearTimeout(mpvNowPlayingTimerRef.current);
    mpvNowPlayingTimerRef.current = setTimeout(() => {
      mpvNowPlayingTimerRef.current = null;
      apiController({
        serverType: config.serverType,
        endpoint: 'scrobble',
        args: {
          id: playQueue.current?.id,
          albumId: playQueue.current?.albumId,
          submission: false,
          position: config.serverType === Server.Jellyfin ? 5 * 1e7 : 5000,
          event: 'start',
        },
      });
    }, 5000);
    return () => {
      if (mpvNowPlayingTimerRef.current) {
        clearTimeout(mpvNowPlayingTimerRef.current);
        mpvNowPlayingTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMpv,
    isJukebox,
    playQueue.scrobble,
    playQueue.currentSongId,
    player.status,
    mpvRestartCount,
  ]);

  // MPV scrobbling — submission scrobble when playback position exceeds threshold
  useEffect(() => {
    if (
      !isMpv ||
      isJukebox ||
      !playQueue.scrobble ||
      mpvSubmissionScrobbledRef.current ||
      playQueue.current?.isPodcast
    )
      return;
    const duration = playQueue[currentEntryList][playQueue.currentIndex]?.duration || 0;
    if (!duration) return;
    if (
      checkShouldScrobble({
        currentTime,
        duration,
        threshold: playQueue.scrobbleThreshold,
        hasScrobbled: mpvSubmissionScrobbledRef.current,
      })
    ) {
      mpvSubmissionScrobbledRef.current = true;
      incrementPlayCountInCache(playQueue.current?.id);
      if (playQueue.current?.id) dispatch(incrementEntryPlayCount(playQueue.current.id));
      apiController({
        serverType: config.serverType,
        endpoint: 'scrobble',
        args: {
          id: playQueue.current?.id,
          albumId: playQueue.current?.albumId,
          submission: true,
          position: config.serverType === Server.Jellyfin ? currentTime * 1e7 : undefined,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMpv, currentTime, playQueue.scrobble]);

  // Jukebox scrobbling — reset submission flag on each new song
  const jukeboxSubmissionScrobbledRef = useRef(false);
  const jukeboxNowPlayingTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isJukebox) return;
    jukeboxSubmissionScrobbledRef.current = false;
  }, [isJukebox, playQueue.currentSongId, playQueue.entryVersion, jukebox.loopCount]);
  // Jukebox scrobbling — reset when position jumps backward (manual prev/next/seek to beginning)
  const jukeboxPrevPositionRef = useRef(0);
  useEffect(() => {
    if (!isJukebox) return;
    const pos = jukebox.status.position ?? 0;
    if (jukeboxPrevPositionRef.current > 5 && pos < 2) {
      jukeboxSubmissionScrobbledRef.current = false;
    }
    jukeboxPrevPositionRef.current = pos;
  }, [isJukebox, jukebox.status.position]);

  // Jukebox scrobbling — "now playing" notification 5s after playback starts
  useEffect(() => {
    if (
      !isJukebox ||
      !playQueue.scrobble ||
      !jukebox.status.playing ||
      playQueue.current?.isPodcast
    )
      return undefined;
    if (jukeboxNowPlayingTimerRef.current) clearTimeout(jukeboxNowPlayingTimerRef.current);
    jukeboxNowPlayingTimerRef.current = setTimeout(() => {
      jukeboxNowPlayingTimerRef.current = null;
      apiController({
        serverType: config.serverType,
        endpoint: 'scrobble',
        args: {
          id: playQueue.current?.id,
          albumId: playQueue.current?.albumId,
          submission: false,
          position: config.serverType === Server.Jellyfin ? 5 * 1e7 : 5000,
          event: 'start',
        },
      });
    }, 5000);
    return () => {
      if (jukeboxNowPlayingTimerRef.current) {
        clearTimeout(jukeboxNowPlayingTimerRef.current);
        jukeboxNowPlayingTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJukebox, playQueue.scrobble, playQueue.currentSongId, jukebox.status.playing]);

  // Jukebox scrobbling — submission scrobble when playback position exceeds threshold
  useEffect(() => {
    if (
      !isJukebox ||
      !playQueue.scrobble ||
      jukeboxSubmissionScrobbledRef.current ||
      playQueue.current?.isPodcast
    )
      return;
    const duration = playQueue[currentEntryList][playQueue.currentIndex]?.duration || 0;
    if (!duration) return;
    const position = jukebox.status.position;
    if (
      checkShouldScrobble({
        currentTime: position,
        duration,
        threshold: playQueue.scrobbleThreshold,
        hasScrobbled: jukeboxSubmissionScrobbledRef.current,
      })
    ) {
      jukeboxSubmissionScrobbledRef.current = true;
      incrementPlayCountInCache(playQueue.current?.id);
      if (playQueue.current?.id) dispatch(incrementEntryPlayCount(playQueue.current.id));
      apiController({
        serverType: config.serverType,
        endpoint: 'scrobble',
        args: {
          id: playQueue.current?.id,
          albumId: playQueue.current?.albumId,
          submission: true,
          position: config.serverType === Server.Jellyfin ? position * 1e7 : undefined,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJukebox, jukebox.status.position, playQueue.scrobble]);

  // Podcast bookmarks — restore position when a podcast episode starts
  useEffect(() => {
    if (isJukebox || config.serverType !== Server.Subsonic) return undefined;
    if (!playQueue.current?.isPodcast) return undefined;

    let cancelled = false;
    const songId = playQueue.current.id;

    const restore = async () => {
      interface Bookmark {
        entry?: { id: string };
        position?: number;
      }
      let bookmarks: unknown;
      try {
        bookmarks = await apiController({
          serverType: config.serverType,
          endpoint: 'getBookmarks',
        });
      } catch {
        return;
      }
      if (cancelled) return;
      const list: Bookmark[] = Array.isArray(bookmarks) ? (bookmarks as Bookmark[]) : [];
      const bookmark = list.find((bm) => bm.entry?.id === songId);
      if (!bookmark?.position || bookmark.position < 5000) return;
      const positionSeconds = Math.floor(bookmark.position / 1000);
      if (isMpv) {
        // MPV needs a small delay for the file to be opened before seeking
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 200);
        });
        if (cancelled) return;
        ipcRenderer.send('player-seek-to', positionSeconds);
      } else {
        const activePlayer =
          playQueue.currentPlayer === 1
            ? playersRef.current?.player1?.audioEl?.current
            : playersRef.current?.player2?.audioEl?.current;
        if (activePlayer) {
          // Setting currentTime before the browser has loaded metadata (readyState
          // < HAVE_METADATA) is unreliable and can be silently ignored — wait for
          // loadedmetadata first, mirroring the MPV branch above which already
          // accounts for the player needing a moment before it'll accept a seek.
          if (activePlayer.readyState < 1) {
            await new Promise<void>((resolve) => {
              const onReady = () => {
                activePlayer.removeEventListener('loadedmetadata', onReady);
                resolve();
              };
              activePlayer.addEventListener('loadedmetadata', onReady);
            });
          }
          if (cancelled) return;
          activePlayer.currentTime = positionSeconds;
        }
      }
      setCurrentTime(positionSeconds);
      notifyToast('info', t('Resuming from {{time}}', { time: format(bookmark.position) }));
    };

    restore();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playQueue.currentSongId]);

  // Podcast bookmarks — save position when playback pauses on a podcast episode
  useEffect(() => {
    if (isJukebox || config.serverType !== Server.Subsonic) return;
    if (player.status !== 'PAUSED') return;
    if (!playQueue.current?.isPodcast) return;
    if (podcastStopPressedRef.current) {
      podcastStopPressedRef.current = false;
      return;
    }
    const pos = currentTimeRef.current;
    const duration = playQueue.current?.duration;
    if (pos <= 5 || !duration || pos >= duration - 10) return;
    apiController({
      serverType: config.serverType,
      endpoint: 'createBookmark',
      args: { id: playQueue.current.id, position: Math.floor(pos * 1000) },
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.status]);

  // In MPV mode: seeking must go through IPC, not audioEl.currentTime
  const handleSeekSliderMpv = (e: number) => {
    setCurrentTime(e);
    ipcRenderer.send('player-seek-to', e);
  };

  const effectiveHandleSeekSlider = isMpv ? handleSeekSliderMpv : handleSeekSlider;
  const effectiveHandleSeek = isJukebox ? jukebox.seek : effectiveHandleSeekSlider;
  const effectiveHandleSeekBackward = isJukebox
    ? () =>
        jukebox.seek(
          Math.max(0, jukebox.status.position - Number(settings.get('seekBackwardInterval')))
        )
    : handleSeekBackward;
  const effectiveHandleSeekForward = isJukebox
    ? () => {
        const dur = playQueue[currentEntryList][playQueue.currentIndex]?.duration ?? Infinity;
        jukebox.seek(
          Math.min(jukebox.status.position + Number(settings.get('seekForwardInterval')), dur - 1)
        );
      }
    : handleSeekForward;

  return (
    <>
      {isMpv && <MpvPlayer />}
      <Player ref={playersRef} currentEntryList={currentEntryList} muted={isMpv ? true : muted}>
        {playQueue.showDebugWindow && <DebugWindow currentEntryList={currentEntryList} />}
        <PlayerContainer
          data-testid="player-bar"
          aria-label="playback controls"
          role="complementary"
        >
          <FlexboxGrid align="middle" style={{ height: '100%' }}>
            <FlexboxGrid.Item colspan={6} style={{ textAlign: 'left', paddingLeft: '10px' }}>
              <PlayerColumn $left $height="80px">
                <Grid style={{ width: '100%' }}>
                  <Row
                    style={{
                      height: '70px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      flexWrap: 'nowrap',
                    }}
                  >
                    {(!config.lookAndFeel.sidebar.coverArt ||
                      !config.lookAndFeel.sidebar.expand) && (
                      <Col xs={2} style={{ height: '100%', width: '80px', paddingRight: '10px' }}>
                        <CoverArtContainer $expand={config.lookAndFeel.sidebar.expand}>
                          <LazyLoadImage
                            data-testid="player-album-art"
                            src={
                              playQueue[currentEntryList][playQueue.currentIndex]?.image ||
                              placeholderImg
                            }
                            tabIndex={0}
                            onClick={() => setShowCoverArtModal(true)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                setShowCoverArtModal(true);
                              }
                            }}
                            alt="trackImg"
                            effect="opacity"
                            width="65"
                            height="65"
                            style={{ cursor: 'pointer' }}
                          />
                          <StyledButton
                            aria-label="show cover art"
                            size="xs"
                            onClick={() => {
                              dispatch(setSidebar({ coverArt: true }));
                              settings.set('sidebar.coverArt', true);
                            }}
                          >
                            <UpIcon />
                          </StyledButton>
                        </CoverArtContainer>
                      </Col>
                    )}

                    <Col xs={2} style={{ minWidth: '120px', maxWidth: '450px', flex: 1 }}>
                      {playQueue.entry?.length > 0 && (
                        <>
                          <Row
                            style={{
                              height: '23px',
                              display: 'flex',
                              alignItems: 'flex-end',
                              flexWrap: 'nowrap',
                              overflow: 'hidden',
                            }}
                          >
                            <div style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden' }}>
                              <CustomTooltip
                                enterable
                                placement="top"
                                text={playQueue?.current?.title}
                              >
                                <LinkButton
                                  data-testid="player-track-title"
                                  tabIndex={0}
                                  onClick={() => navigate(`/nowplaying`)}
                                  style={{ display: 'block' }}
                                >
                                  {playQueue?.current?.title || t('Unknown Title')}
                                </LinkButton>
                              </CustomTooltip>
                            </div>
                            {lyrics && (
                              <div style={{ flexShrink: 0 }}>
                                <CustomTooltip
                                  enterable
                                  placement="top"
                                  text={t('Lyrics')}
                                  onClick={() => setShowLyricsModal(true)}
                                >
                                  <StyledButton
                                    data-testid="lyrics-bubble"
                                    size="xs"
                                    appearance="subtle"
                                  >
                                    <CommentingOIcon />
                                  </StyledButton>
                                </CustomTooltip>
                              </div>
                            )}
                          </Row>
                          <Row
                            style={{
                              height: '23px',
                              display: 'flex',
                              alignItems: 'center',
                              color: 'var(--rs-text-tertiary)',
                            }}
                          >
                            <span
                              style={{
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                              }}
                            >
                              {(playQueue.current?.artist?.length ?? 0) > 0 ? (
                                playQueue.current?.artist?.map((artist: Artist, i: number) => (
                                  <React.Fragment key={`${artist.id}-link`}>
                                    <SecondaryTextWrapper $subtitle="true">
                                      {i > 0 && <>{', '}</>}
                                    </SecondaryTextWrapper>
                                    <CustomTooltip
                                      enterable
                                      placement="topStart"
                                      text={artist?.title}
                                    >
                                      <LinkButton
                                        tabIndex={0}
                                        $subtitle="true"
                                        onClick={() => {
                                          if (artist?.id) {
                                            navigate(`/library/artist/${artist?.id}`);
                                          }
                                        }}
                                      >
                                        {artist?.title}
                                      </LinkButton>
                                    </CustomTooltip>
                                  </React.Fragment>
                                ))
                              ) : (
                                <SecondaryTextWrapper $subtitle="true">
                                  {t('Unknown Artist')}
                                </SecondaryTextWrapper>
                              )}
                            </span>
                          </Row>
                          <Row
                            style={{
                              height: '23px',
                              display: 'flex',
                              alignItems: 'flex-start',
                            }}
                          >
                            {(playQueue?.current?.album && (
                              <CustomTooltip
                                enterable
                                placement="topStart"
                                text={playQueue?.current?.album}
                              >
                                <LinkButton
                                  tabIndex={0}
                                  $subtitle="true"
                                  onClick={() => {
                                    if (playQueue?.current?.albumId) {
                                      navigate(`/library/album/${playQueue?.current?.albumId}`);
                                    }
                                  }}
                                >
                                  {playQueue?.current?.album}
                                </LinkButton>
                              </CustomTooltip>
                            )) || (
                              <SecondaryTextWrapper $subtitle="true">
                                {t('Unknown Album')}
                              </SecondaryTextWrapper>
                            )}
                          </Row>
                        </>
                      )}
                    </Col>
                  </Row>
                </Grid>
              </PlayerColumn>
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={12} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
              <PlayerColumn $center $height="45px">
                {/* Stop Button */}
                {!isRadio && (
                  <CustomTooltip text={t('Stop')}>
                    <PlayerControlIcon
                      data-testid="player-stop"
                      aria-label={t('Stop')}
                      role="button"
                      tabIndex={0}
                      icon="stop"
                      size="lg"
                      fixedWidth
                      disabled={playQueue.entry.length === 0}
                      onClick={effectiveHandleStop}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          effectiveHandleStop();
                        }
                      }}
                    />
                  </CustomTooltip>
                )}
                {/* Previous Song Button */}
                {!isRadio && (
                  <CustomTooltip text={t('Previous Track')}>
                    <PlayerControlIcon
                      data-testid="player-previous"
                      aria-label={t('Previous Track')}
                      role="button"
                      tabIndex={0}
                      icon="step-backward"
                      size="lg"
                      fixedWidth
                      disabled={playQueue.entry.length === 0}
                      onClick={effectiveHandlePrev}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          effectiveHandlePrev();
                        }
                      }}
                    />
                  </CustomTooltip>
                )}
                {/* Seek Backward Button */}
                {!isRadio && (
                  <CustomTooltip text={t('Seek backward')}>
                    <PlayerControlIcon
                      aria-label={t('Seek backward')}
                      role="button"
                      tabIndex={0}
                      icon="backward"
                      size="lg"
                      fixedWidth
                      disabled={playQueue.entry.length === 0}
                      onClick={effectiveHandleSeekBackward}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          effectiveHandleSeekBackward();
                        }
                      }}
                    />
                  </CustomTooltip>
                )}
                {/* Play/Pause Button */}
                <CustomTooltip text={t('Play/Pause')}>
                  <PlayerControlIcon
                    data-testid="player-play-pause"
                    data-playing={player.status === 'PLAYING' ? 'true' : 'false'}
                    aria-label={t('Play')}
                    aria-pressed={player.status === 'PLAYING'}
                    role="button"
                    tabIndex={0}
                    icon={player.status === 'PLAYING' ? 'pause-circle' : 'play-circle'}
                    size="3x"
                    disabled={playQueue.entry.length === 0}
                    onClick={effectiveHandlePlayPause}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        effectiveHandlePlayPause();
                      }
                    }}
                  />
                </CustomTooltip>

                {/* Seek Forward Button */}
                {!isRadio && (
                  <CustomTooltip text={t('Seek forward')}>
                    <PlayerControlIcon
                      aria-label={t('Seek forward')}
                      role="button"
                      tabIndex={0}
                      icon="forward"
                      size="lg"
                      fixedWidth
                      disabled={playQueue.entry.length === 0}
                      onClick={effectiveHandleSeekForward}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          effectiveHandleSeekForward();
                        }
                      }}
                    />
                  </CustomTooltip>
                )}
                {/* Next Song Button */}
                {!isRadio && (
                  <CustomTooltip text={t('Next Track')}>
                    <PlayerControlIcon
                      data-testid="player-next"
                      aria-label={t('Next Track')}
                      role="button"
                      tabIndex={0}
                      icon="step-forward"
                      size="lg"
                      fixedWidth
                      disabled={playQueue.entry.length === 0}
                      onClick={effectiveHandleNext}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          effectiveHandleNext();
                        }
                      }}
                    />
                  </CustomTooltip>
                )}
                {!isRadio && (
                  <CustomTooltip text={t('Play Random')}>
                    <PlayerControlIcon
                      aria-label={t('Play Random')}
                      role="button"
                      tabIndex={0}
                      icon={isLoadingRandom ? 'spinner' : 'plus-square'}
                      size="lg"
                      fixedWidth
                      onClick={handlePlayRandom}
                      disabled={isLoadingRandom}
                      spin={isLoadingRandom}
                    />
                  </CustomTooltip>
                )}
              </PlayerColumn>
              <PlayerColumn $center $height="35px">
                <FlexboxGrid
                  justify="center"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    height: '35px',
                  }}
                >
                  <FlexboxGrid.Item
                    colspan={4}
                    style={{
                      textAlign: 'right',
                      paddingRight: '10px',
                      userSelect: 'none',
                    }}
                  >
                    <DurationSpan data-testid="player-current-time">
                      {isRadio ? '' : songCurrentTime}
                    </DurationSpan>
                  </FlexboxGrid.Item>
                  <FlexboxGrid.Item colspan={16}>
                    {/* Seek Slider */}
                    <div data-testid="player-seek-bar">
                      <Slider
                        value={
                          isRadio
                            ? 0
                            : isJukebox
                              ? jukebox.status.position
                              : isMpv
                                ? currentTime
                                : playQueue.currentPlayer === 1
                                  ? playersRef.current?.player1?.audioEl.current?.currentTime || 0
                                  : playersRef.current?.player2?.audioEl.current?.currentTime || 0
                        }
                        min={0}
                        max={
                          isRadio
                            ? 1
                            : playQueue[currentEntryList][playQueue.currentIndex]?.duration || 0
                        }
                        onAfterChange={isRadio ? undefined : effectiveHandleSeek}
                        toolTipType="time"
                        disabled={isRadio}
                      />
                    </div>
                  </FlexboxGrid.Item>
                  <FlexboxGrid.Item
                    colspan={4}
                    style={{
                      textAlign: 'left',
                      paddingLeft: '10px',
                      userSelect: 'none',
                    }}
                  >
                    <DurationSpan data-testid="player-live-indicator">
                      {isRadio ? 'LIVE' : songDuration}
                    </DurationSpan>
                  </FlexboxGrid.Item>
                </FlexboxGrid>
              </PlayerColumn>
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={6} style={{ textAlign: 'right', paddingRight: '10px' }}>
              <PlayerColumn $right $height="80px" style={{ flexDirection: 'column' }}>
                <div
                  style={{
                    height: '30px',
                    display: 'flex',
                    alignSelf: 'flex-end',
                    alignItems: 'flex-start',
                    marginRight: '10px',
                  }}
                >
                  {config.serverType === Server.Subsonic && (
                    <StyledRate
                      aria-label="rating"
                      size="xs"
                      readOnly={false}
                      value={
                        playQueue[currentEntryList][playQueue.currentIndex]?.userRating
                          ? playQueue[currentEntryList][playQueue.currentIndex].userRating
                          : 0
                      }
                      defaultValue={
                        playQueue[currentEntryList][playQueue.currentIndex]?.userRating
                          ? playQueue[currentEntryList][playQueue.currentIndex].userRating
                          : 0
                      }
                      onChange={(rating: number) =>
                        handleRating(playQueue[currentEntryList][playQueue.currentIndex], {
                          rating,
                        })
                      }
                    />
                  )}
                </div>
                <div
                  style={{
                    height: '25px',
                    display: 'flex',
                    alignSelf: 'flex-end',
                    alignItems: 'baseline',
                  }}
                >
                  {/* Favorite Button */}
                  <CustomTooltip text={t('Favorite')}>
                    <PlayerControlIcon
                      aria-label={t('Favorite')}
                      aria-pressed={!!playQueue[currentEntryList][playQueue.currentIndex]?.starred}
                      role="button"
                      tabIndex={0}
                      icon={
                        playQueue[currentEntryList][playQueue.currentIndex]?.starred
                          ? 'heart'
                          : 'heart-o'
                      }
                      size="lg"
                      fixedWidth
                      active={
                        playQueue[currentEntryList][playQueue.currentIndex]?.starred
                          ? 'true'
                          : 'false'
                      }
                      onClick={() =>
                        handleFavorite(playQueue[currentEntryList][playQueue.currentIndex], {
                          custom: async () => {
                            await queryClient.refetchQueries({
                              queryKey: ['album'],
                              type: 'active',
                            });
                            await queryClient.refetchQueries({
                              queryKey: ['starred'],
                              type: 'active',
                            });
                            await queryClient.refetchQueries({
                              queryKey: ['playlist'],
                              type: 'active',
                            });
                          },
                        })
                      }
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ') {
                          handleFavorite(playQueue[currentEntryList][playQueue.currentIndex], {
                            custom: async () => {
                              await queryClient.refetchQueries({
                                queryKey: ['album'],
                                type: 'active',
                              });
                              await queryClient.refetchQueries({
                                queryKey: ['starred'],
                                type: 'active',
                              });
                              await queryClient.refetchQueries({
                                queryKey: ['playlist'],
                                type: 'active',
                              });
                            },
                          });
                        }
                      }}
                    />
                  </CustomTooltip>

                  {/* Repeat Button */}
                  <CustomTooltip
                    text={
                      playQueue.repeat === 'all'
                        ? t('Repeat all')
                        : playQueue.repeat === 'one'
                          ? t('Repeat one')
                          : t('Repeat')
                    }
                  >
                    <span
                      data-testid="player-repeat"
                      data-repeat-mode={playQueue.repeat}
                      role="button"
                      tabIndex={0}
                      style={{ position: 'relative', display: 'inline-block' }}
                      onClick={handleRepeat}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ') handleRepeat();
                      }}
                    >
                      <PlayerControlIcon
                        aria-label={
                          playQueue.repeat === 'all'
                            ? t('Repeat all')
                            : playQueue.repeat === 'one'
                              ? t('Repeat one')
                              : t('Repeat')
                        }
                        aria-pressed={
                          playQueue.repeat === 'all' || playQueue.repeat === 'one'
                            ? 'true'
                            : 'false'
                        }
                        icon="refresh"
                        size="lg"
                        fixedWidth
                        active={
                          playQueue.repeat === 'all' || playQueue.repeat === 'one'
                            ? 'true'
                            : 'false'
                        }
                      />
                      {playQueue.repeat === 'one' && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 1,
                            right: 1,
                            fontSize: '9px',
                            fontWeight: 'bold',
                            lineHeight: 1,
                            pointerEvents: 'none',
                          }}
                        >
                          1
                        </span>
                      )}
                    </span>
                  </CustomTooltip>
                  {/* Shuffle Button */}
                  <CustomTooltip text={t('Shuffle')}>
                    <PlayerControlIcon
                      aria-label={t('Shuffle')}
                      aria-pressed={playQueue.shuffle ? 'true' : 'false'}
                      role="button"
                      tabIndex={0}
                      icon="random"
                      size="lg"
                      fixedWidth
                      onClick={handleShuffle}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ') {
                          handleShuffle();
                        }
                      }}
                      active={playQueue.shuffle ? 'true' : 'false'}
                    />
                  </CustomTooltip>

                  {/* Jukebox Toggle (Subsonic only) */}
                  {config.serverType === Server.Subsonic && (
                    <CustomTooltip text={isJukebox ? t('Disable Jukebox') : t('Enable Jukebox')}>
                      <PlayerControlIcon
                        aria-label={t('Jukebox')}
                        aria-pressed={isJukebox ? 'true' : 'false'}
                        role="button"
                        tabIndex={0}
                        icon="music"
                        size="lg"
                        fixedWidth
                        active={isJukebox ? 'true' : 'false'}
                        onClick={() => (isJukebox ? jukebox.disable() : jukebox.enable())}
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === ' ') {
                            if (isJukebox) jukebox.disable();
                            else jukebox.enable();
                          }
                        }}
                      />
                    </CustomTooltip>
                  )}

                  {/* Sleep Timer Button */}
                  <Whisper
                    ref={sleepTimerWhisperRef}
                    trigger="click"
                    placement="topEnd"
                    preventOverflow
                    speaker={
                      <Popup title={t('Sleep Timer')}>
                        {!isJukebox && (
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ marginRight: 8 }}>{t('Stop after current song')}</span>
                            <input
                              data-testid="sleep-timer-stop-after-current-checkbox"
                              type="checkbox"
                              checked={playQueue.stopAfterCurrent}
                              onChange={(e) => dispatch(setStopAfterCurrent(e.target.checked))}
                            />
                          </div>
                        )}
                        <div>
                          <StyledButton
                            data-testid="sleep-timer-off-button"
                            size="xs"
                            appearance={sleepTimerSeconds === null ? 'primary' : 'default'}
                            onClick={() => {
                              setSleepTimerSeconds(null);
                              sleepTimerWhisperRef.current?.close();
                            }}
                            style={{ marginRight: 4, marginBottom: 4 }}
                          >
                            {t('Off')}
                          </StyledButton>
                          {SLEEP_PRESETS.map((mins) => (
                            <StyledButton
                              key={mins}
                              data-testid={`sleep-timer-preset-${mins}`}
                              size="xs"
                              appearance={sleepTimerSeconds === mins * 60 ? 'primary' : 'default'}
                              onClick={() => {
                                setSleepTimerSeconds(mins * 60);
                                sleepTimerWhisperRef.current?.close();
                              }}
                              style={{ marginRight: 4, marginBottom: 4 }}
                            >
                              {`${mins}m`}
                            </StyledButton>
                          ))}
                        </div>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}
                        >
                          <StyledInputNumber
                            data-testid="sleep-timer-custom-input"
                            size="xs"
                            min={1}
                            max={999}
                            width={70}
                            value={sleepTimerCustom}
                            onChange={(e: string | number) => setSleepTimerCustom(String(e))}
                            placeholder={t('min')}
                          />
                          <StyledButton
                            data-testid="sleep-timer-custom-apply-button"
                            size="xs"
                            onClick={() => {
                              const mins = parseInt(sleepTimerCustom, 10);
                              if (mins > 0) {
                                setSleepTimerSeconds(mins * 60);
                                setSleepTimerCustom('');
                                sleepTimerWhisperRef.current?.close();
                              }
                            }}
                          >
                            {t('Apply')}
                          </StyledButton>
                        </div>
                      </Popup>
                    }
                  >
                    <span
                      data-testid="sleep-timer-button"
                      role="button"
                      tabIndex={0}
                      style={{ display: 'inline-block', position: 'relative' }}
                    >
                      <PlayerControlIcon
                        aria-label="sleep timer"
                        icon="clock-o"
                        size="lg"
                        fixedWidth
                        active={
                          sleepTimerSeconds !== null || (!isJukebox && playQueue.stopAfterCurrent)
                            ? 'true'
                            : 'false'
                        }
                      />
                      {sleepTimerSeconds !== null && (
                        <span
                          data-testid="sleep-timer-remaining-label"
                          style={{
                            fontSize: '9px',
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            lineHeight: 1,
                            pointerEvents: 'none',
                          }}
                        >
                          {formatSleepTimer(sleepTimerSeconds)}
                        </span>
                      )}
                    </span>
                  </Whisper>

                  {/* Display Queue Button */}
                  <CustomTooltip text={t('Mini')}>
                    <PlayerControlIcon
                      data-testid="player-queue-button"
                      aria-label="show play queue"
                      aria-pressed={playQueue.displayQueue ? 'true' : 'false'}
                      role="button"
                      tabIndex={0}
                      icon="tasks"
                      size="lg"
                      fixedWidth
                      onClick={handleDisplayQueue}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ') {
                          handleDisplayQueue();
                        }
                      }}
                      active={playQueue.displayQueue ? 'true' : 'false'}
                    />
                  </CustomTooltip>
                </div>
                <div
                  style={{
                    height: '25px',
                    width: '100%',
                    maxWidth: '115px',
                    marginRight: '10px',
                    display: 'flex',
                    alignSelf: 'flex-end',
                    alignItems: 'center',
                  }}
                  onWheel={handleVolumeWheel}
                >
                  {/* Volume Slider */}
                  <div style={{ marginTop: 4 }}>
                    <Whisper
                      trigger="hover"
                      placement="top"
                      delay={200}
                      preventOverflow
                      speaker={<Popup>{muted ? t('Muted') : Math.floor(localVolume * 100)}</Popup>}
                    >
                      <VolumeIcon
                        icon={muted ? 'volume-off' : 'volume-down'}
                        onClick={() => setMuted(!muted)}
                        size="lg"
                      />
                    </Whisper>
                  </div>
                  <div style={{ position: 'relative', flex: 1, minWidth: 80 }}>
                    <input
                      data-testid="volume-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.floor(localVolume * 100)}
                      onChange={(e) => handleVolumeSlider(Number(e.target.value))}
                      style={{
                        position: 'absolute',
                        width: '1px',
                        height: '1px',
                        opacity: 0.01,
                        top: 0,
                        left: 0,
                      }}
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                    <Slider
                      value={Math.floor(localVolume * 100)}
                      min={0}
                      max={100}
                      onChange={handleVolumeSlider}
                      toolTipType="text"
                    />
                  </div>
                </div>
              </PlayerColumn>
            </FlexboxGrid.Item>
          </FlexboxGrid>
        </PlayerContainer>
        <InfoModal show={showCoverArtModal} handleHide={() => setShowCoverArtModal(false)}>
          <LazyLoadImage
            src={
              playQueue[currentEntryList][playQueue.currentIndex]?.image.replace(
                /&size=\d+|width=\d+&height=\d+&quality=\d+/,
                ''
              ) || placeholderImg
            }
            style={{
              width: 'auto',
              height: 'auto',
              minHeight: '50vh',
              maxHeight: '70vh',
              maxWidth: '95vw',
            }}
          />
        </InfoModal>
        <LyricsModal
          show={showLyricsModal}
          handleHide={() => setShowLyricsModal(false)}
          lyrics={lyrics}
          currentTime={isJukebox ? jukebox.status.position : currentTime}
          duration={playQueue[currentEntryList][playQueue.currentIndex]?.duration || 0}
          playerStatus={player.status}
          title={playQueue[currentEntryList][playQueue.currentIndex]?.title}
          artist={playQueue[currentEntryList][playQueue.currentIndex]?.artist
            ?.map((a: Artist) => a.title)
            .join(', ')}
          handlePlayPause={effectiveHandlePlayPause}
          handlePrevTrack={effectiveHandlePrev}
          handleNextTrack={effectiveHandleNext}
          handleSeekSlider={effectiveHandleSeek}
        />
      </Player>
    </>
  );
};

export default PlayerBar;
