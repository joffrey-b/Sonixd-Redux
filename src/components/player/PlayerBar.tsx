import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ipcRenderer } from 'electron';
import { useHotkeys } from 'react-hotkeys-hook';
import axios from 'axios';
import { useQueryClient } from 'react-query';
import { FlexboxGrid, Grid, Row, Col, Whisper, Icon } from 'rsuite';
import { WhisperInstance } from 'rsuite/lib/Whisper';
import { useHistory } from 'react-router-dom';
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
import { setVolume, setStopAfterCurrent } from '../../redux/playQueueSlice';
import { setStatus } from '../../redux/playerSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import Player from './Player';
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
import { settings } from '../shared/setDefaultSettings';
import { incrementPlayCountInCache } from '../../hooks/useLibraryCache';

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
  const [currentEntryList, setCurrentEntryList] = useState('entry');
  const [localVolume, setLocalVolume] = useState(Number(settings.get('volume')));
  const [muted, setMuted] = useState(false);
  const localVolumeRef = useRef(localVolume);
  const [showCoverArtModal, setShowCoverArtModal] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [sleepTimerSeconds, setSleepTimerSeconds] = useState<number | null>(null);
  const [sleepTimerCustom, setSleepTimerCustom] = useState('');
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);
  const { handlePlayQueueAdd } = usePlayQueueHandler();
  const songDuration = useMemo(
    () => format(playQueue[currentEntryList][playQueue.currentIndex]?.duration * 1000 || 0),
    [currentEntryList, playQueue]
  );
  const songCurrentTime = useMemo(() => format(currentTime * 1000 || 0), [currentTime]);

  const handlePlayRandom = async () => {
    setIsLoadingRandom(true);
    const res: Song[] = await apiController({
      serverType: config.serverType,
      endpoint: 'getRandomSongs',
      args: {
        size: 200,
        musicFolderId: folder.musicFolder,
      },
    });

    handlePlayQueueAdd({ byData: res, play: Play.Play });
    setIsLoadingRandom(false);
  };

  const playersRef = useRef<any>();
  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  const sleepTimerWhisperRef = useRef<WhisperInstance>(null);
  const history = useHistory();
  useDiscordRpc({ playersRef, currentTimeRef, isMpv });

  const { data: lyrics } = useGetLyrics(config, {
    id: playQueue.current?.id,
    artist: playQueue.current?.albumArtist,
    title: playQueue.current?.title,
  });

  useEffect(() => {
    if (isMpv) return undefined; // MPV mode: time comes from renderer-player-current-time IPC
    if (player.status === 'PLAYING') {
      const interval = setInterval(() => {
        if (playQueue.currentPlayer === 1) {
          setCurrentTime(playersRef.current?.player1.audioEl.current.currentTime || 0);
        } else {
          setCurrentTime(playersRef.current?.player2.audioEl.current.currentTime || 0);
        }
      }, 50);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [isMpv, playQueue.currentPlayer, player.status]);

  useEffect(() => {
    if (config.external.obs.enabled && config.external.obs.pollingInterval >= 100) {
      const interval = setInterval(() => {
        const currentPlayerRef =
          playQueue.currentPlayer === 1
            ? playersRef.current?.player1.audioEl.current
            : playersRef.current?.player2.audioEl.current;

        if (config.external.obs.type === 'web') {
          try {
            axios.post(
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
                  progress: Math.floor((currentPlayerRef.currentTime || 0) * 1000),
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
            );
          } catch (e) {
            console.log(e);
          }
        } else if (config.external.obs.path) {
          writeOBSFiles(config.external.obs.path, {
            album: playQueue.current?.album,
            album_url: null,
            artists: (playQueue.current?.artist || []).map((artist: Artist) => artist.title),
            cover_url: playQueue.current?.image.match('placeholder')
              ? undefined
              : playQueue.current?.image,
            duration: Math.floor((playQueue.current?.duration || 0) * 1000),
            progress: Math.floor((currentPlayerRef.currentTime || 0) * 1000),
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
    setCurrentTime
  );

  useEffect(() => {
    setLocalVolume(Number(playQueue.volume.toPrecision(2)));
  }, [playQueue.volume]);

  useEffect(() => {
    // Handle volume slider dragging
    const debounce = setTimeout(() => {
      if (isDraggingVolume) {
        dispatch(setVolume(localVolume));
        if (playQueue.currentPlayer === 1) {
          playersRef.current.player1.audioEl.current.volume = localVolume ** 2;
        } else {
          playersRef.current.player2.audioEl.current.volume = localVolume ** 2;
        }

        settings.set('volume', localVolume);
      }
      setIsDraggingVolume(false);
    }, 100);

    return () => clearTimeout(debounce);
  }, [dispatch, isDraggingVolume, localVolume, playQueue.currentPlayer, playQueue.fadeDuration]);

  useEffect(() => {
    // Set the seek back to 0 when the player is incremented/decremented, otherwise the
    // slider bar will temporarily stick to the current time of the previous track before resetting to 0
    playersRef.current.player1.audioEl.current.pause();
    playersRef.current.player2.audioEl.current.pause();
    playersRef.current.player1.audioEl.current.currentTime = 0;
    playersRef.current.player2.audioEl.current.currentTime = 0;
  }, [playQueue.playerUpdated]);

  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();

  const hk = config.hotkeys;
  useHotkeys(
    hk.playPause,
    (e) => {
      e.preventDefault();
      handlePlayPause();
    },
    [hk.playPause, handlePlayPause]
  );
  useHotkeys(
    hk.nextTrack,
    (e) => {
      e.preventDefault();
      handleNextTrack();
    },
    [hk.nextTrack, handleNextTrack]
  );
  useHotkeys(
    hk.prevTrack,
    (e) => {
      e.preventDefault();
      handlePrevTrack();
    },
    [hk.prevTrack, handlePrevTrack]
  );
  useHotkeys(
    hk.volumeUp,
    (e) => {
      e.preventDefault();
      const v = Math.min(1, Math.round((localVolume + 0.05) * 100) / 100);
      setLocalVolume(v);
      dispatch(setVolume(v));
    },
    [hk.volumeUp, localVolume]
  );
  useHotkeys(
    hk.volumeDown,
    (e) => {
      e.preventDefault();
      const v = Math.max(0, Math.round((localVolume - 0.05) * 100) / 100);
      setLocalVolume(v);
      dispatch(setVolume(v));
    },
    [hk.volumeDown, localVolume]
  );
  useHotkeys(
    hk.mute,
    (e) => {
      e.preventDefault();
      setMuted((m) => !m);
    },
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
    });
    ipcRenderer.on('player-volume-down', () => {
      const v = Math.max(0, Math.round((localVolumeRef.current - 0.05) * 100) / 100);
      setLocalVolume(v);
      dispatch(setVolume(v));
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

  useEffect(() => {
    if (sleepTimerSeconds === null) return undefined;
    if (sleepTimerSeconds <= 0) {
      if (player.status === 'PLAYING') handlePlayPause();
      setSleepTimerSeconds(null);
      return undefined;
    }
    const timeout = setTimeout(
      () => setSleepTimerSeconds((s) => (s !== null && s > 0 ? s - 1 : null)),
      1000
    );
    return () => clearTimeout(timeout);
  }, [sleepTimerSeconds, handlePlayPause, player.status]);

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
    const handler = (_: any, time: number) => setCurrentTime(time);
    ipcRenderer.on('renderer-player-current-time', handler);
    return () => {
      ipcRenderer.removeListener('renderer-player-current-time', handler);
    };
  }, [isMpv]);

  // In MPV mode: mute is local state only, so sync it to MPV directly
  useEffect(() => {
    if (!isMpv) return;
    ipcRenderer.send('player-mute', muted);
  }, [isMpv, muted]);

  // MPV scrobbling — reset submission flag on each new song
  const mpvSubmissionScrobbledRef = useRef(false);
  const mpvNowPlayingTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isMpv) return;
    mpvSubmissionScrobbledRef.current = false;
  }, [isMpv, playQueue.currentSongId]);

  // MPV scrobbling — "now playing" notification 5s after playback starts
  useEffect(() => {
    if (!isMpv || !playQueue.scrobble || player.status !== 'PLAYING') return undefined;
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
          position: 5 * 1e7,
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
  }, [isMpv, playQueue.scrobble, playQueue.currentSongId, player.status]);

  // MPV scrobbling — submission scrobble when playback position exceeds threshold
  useEffect(() => {
    if (!isMpv || !playQueue.scrobble || mpvSubmissionScrobbledRef.current) return;
    const duration = playQueue[currentEntryList][playQueue.currentIndex]?.duration || 0;
    if (!duration) return;
    if (currentTime >= 240 || currentTime >= duration * (playQueue.scrobbleThreshold / 100)) {
      mpvSubmissionScrobbledRef.current = true;
      incrementPlayCountInCache(playQueue.current?.id);
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

  // In MPV mode: seeking must go through IPC, not audioEl.currentTime
  const handleSeekSliderMpv = (e: number) => {
    setCurrentTime(e);
    ipcRenderer.send('player-seek-to', e);
  };

  // In MPV mode: pause and seek to 0 immediately — handleStop has a 250ms delay
  // before dispatching setStatus('PAUSED'), which would let MPV play from position 0
  // for ~250ms before pausing.
  const handleStopEffective = () => {
    handleStop();
    if (isMpv) {
      // Dispatch PAUSED immediately — handleStop has a 250ms delay which can
      // race with a subsequent double-click before the timer fires.
      dispatch(setStatus('PAUSED'));
      ipcRenderer.send('player-pause');
      ipcRenderer.send('player-seek-to', 0);
    }
  };

  const effectiveHandleSeekSlider = isMpv ? handleSeekSliderMpv : handleSeekSlider;

  return (
    <>
      {isMpv && <MpvPlayer />}
      <Player ref={playersRef} currentEntryList={currentEntryList} muted={isMpv ? true : muted}>
        {playQueue.showDebugWindow && <DebugWindow currentEntryList={currentEntryList} />}
        <PlayerContainer aria-label="playback controls" role="complementary">
          <FlexboxGrid align="middle" style={{ height: '100%' }}>
            <FlexboxGrid.Item colspan={6} style={{ textAlign: 'left', paddingLeft: '10px' }}>
              <PlayerColumn left height="80px">
                <Grid style={{ width: '100%' }}>
                  <Row
                    style={{
                      height: '70px',
                      display: 'flex',
                      alignItems: 'flex-start',
                    }}
                  >
                    {(!config.lookAndFeel.sidebar.coverArt ||
                      !config.lookAndFeel.sidebar.expand) && (
                      <Col xs={2} style={{ height: '100%', width: '80px', paddingRight: '10px' }}>
                        <CoverArtContainer expand={config.lookAndFeel.sidebar.expand}>
                          <LazyLoadImage
                            src={
                              playQueue[currentEntryList][playQueue.currentIndex]?.image ||
                              placeholderImg
                            }
                            tabIndex={0}
                            onClick={() => setShowCoverArtModal(true)}
                            onKeyDown={(e: any) => {
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
                            <Icon icon="up" />
                          </StyledButton>
                        </CoverArtContainer>
                      </Col>
                    )}

                    <Col xs={2} style={{ minWidth: '120px', maxWidth: '450px', width: '100%' }}>
                      {playQueue.entry?.length > 0 && (
                        <>
                          <Row
                            style={{
                              height: '23px',
                              display: 'flex',
                              alignItems: 'flex-end',
                            }}
                          >
                            <CustomTooltip
                              enterable
                              placement="top"
                              text={playQueue?.current?.title}
                            >
                              <LinkButton tabIndex={0} onClick={() => history.push(`/nowplaying`)}>
                                {playQueue?.current?.title || t('Unknown Title')}
                              </LinkButton>
                            </CustomTooltip>
                            {lyrics && (
                              <CustomTooltip
                                enterable
                                placement="top"
                                text={t('Lyrics')}
                                onClick={() => setShowLyricsModal(true)}
                              >
                                <StyledButton size="xs" appearance="subtle">
                                  <Icon icon="commenting-o" />
                                </StyledButton>
                              </CustomTooltip>
                            )}
                          </Row>
                          <Row
                            style={{
                              height: '23px',
                              display: 'flex',
                              alignItems: 'center',
                              color: '#888e94',
                            }}
                          >
                            <span
                              style={{
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                              }}
                            >
                              {playQueue.current?.artist.length > 0 ? (
                                playQueue.current?.artist?.map((artist: Artist, i: number) => (
                                  <React.Fragment key={`${artist.id}-link`}>
                                    <SecondaryTextWrapper subtitle="true">
                                      {i > 0 && <>{', '}</>}
                                    </SecondaryTextWrapper>
                                    <CustomTooltip
                                      enterable
                                      placement="topStart"
                                      text={artist?.title}
                                    >
                                      <LinkButton
                                        tabIndex={0}
                                        subtitle="true"
                                        onClick={() => {
                                          if (artist?.id) {
                                            history.push(`/library/artist/${artist?.id}`);
                                          }
                                        }}
                                      >
                                        {artist?.title}
                                      </LinkButton>
                                    </CustomTooltip>
                                  </React.Fragment>
                                ))
                              ) : (
                                <SecondaryTextWrapper subtitle="true">
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
                                  subtitle="true"
                                  onClick={() => {
                                    if (playQueue?.current?.albumId) {
                                      history.push(`/library/album/${playQueue?.current?.albumId}`);
                                    }
                                  }}
                                >
                                  {playQueue?.current?.album}
                                </LinkButton>
                              </CustomTooltip>
                            )) || (
                              <SecondaryTextWrapper subtitle="true">
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
              <PlayerColumn center height="45px">
                {/* Stop Button */}
                <CustomTooltip text={t('Stop')}>
                  <PlayerControlIcon
                    aria-label={t('Seek forward')}
                    role="button"
                    tabIndex={0}
                    icon="stop"
                    size="lg"
                    fixedWidth
                    disabled={playQueue.entry.length === 0}
                    onClick={handleStopEffective}
                    onKeyDown={(e: any) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        handleStopEffective();
                      }
                    }}
                  />
                </CustomTooltip>
                {/* Previous Song Button */}
                <CustomTooltip text={t('Previous Track')}>
                  <PlayerControlIcon
                    aria-label={t('Previous Track')}
                    role="button"
                    tabIndex={0}
                    icon="step-backward"
                    size="lg"
                    fixedWidth
                    disabled={playQueue.entry.length === 0}
                    onClick={handlePrevTrack}
                    onKeyDown={(e: any) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        handlePrevTrack();
                      }
                    }}
                  />
                </CustomTooltip>
                {/* Seek Backward Button */}
                <CustomTooltip text={t('Seek backward')}>
                  <PlayerControlIcon
                    aria-label={t('Seek backward')}
                    role="button"
                    tabIndex={0}
                    icon="backward"
                    size="lg"
                    fixedWidth
                    disabled={playQueue.entry.length === 0}
                    onClick={handleSeekBackward}
                    onKeyDown={(e: any) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        handleSeekBackward();
                      }
                    }}
                  />
                </CustomTooltip>
                {/* Play/Pause Button */}
                <CustomTooltip text={t('Play/Pause')}>
                  <PlayerControlIcon
                    aria-label={t('Play')}
                    aria-pressed={player.status === 'PLAYING'}
                    role="button"
                    tabIndex={0}
                    icon={player.status === 'PLAYING' ? 'pause-circle' : 'play-circle'}
                    size="3x"
                    disabled={playQueue.entry.length === 0}
                    onClick={handlePlayPause}
                    onKeyDown={(e: any) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        handlePlayPause();
                      }
                    }}
                  />
                </CustomTooltip>

                {/* Seek Forward Button */}
                <CustomTooltip text={t('Seek forward')}>
                  <PlayerControlIcon
                    aria-label={t('Seek forward')}
                    role="button"
                    tabIndex={0}
                    icon="forward"
                    size="lg"
                    fixedWidth
                    disabled={playQueue.entry.length === 0}
                    onClick={handleSeekForward}
                    onKeyDown={(e: any) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        handleSeekForward();
                      }
                    }}
                  />
                </CustomTooltip>
                {/* Next Song Button */}
                <CustomTooltip text={t('Next Track')}>
                  <PlayerControlIcon
                    aria-label={t('Next Track')}
                    role="button"
                    tabIndex={0}
                    icon="step-forward"
                    size="lg"
                    fixedWidth
                    disabled={playQueue.entry.length === 0}
                    onClick={handleNextTrack}
                    onKeyDown={(e: any) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        handleNextTrack();
                      }
                    }}
                  />
                </CustomTooltip>
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
              </PlayerColumn>
              <PlayerColumn center height="35px">
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
                    <DurationSpan>{songCurrentTime}</DurationSpan>
                  </FlexboxGrid.Item>
                  <FlexboxGrid.Item colspan={16}>
                    {/* Seek Slider */}
                    <Slider
                      value={
                        isMpv
                          ? currentTime
                          : playQueue.currentPlayer === 1
                          ? playersRef.current?.player1.audioEl.current.currentTime || 0
                          : playersRef.current?.player2.audioEl.current.currentTime || 0
                      }
                      min={0}
                      max={playQueue[currentEntryList][playQueue.currentIndex]?.duration || 0}
                      onAfterChange={effectiveHandleSeekSlider}
                      toolTipType="time"
                    />
                  </FlexboxGrid.Item>
                  <FlexboxGrid.Item
                    colspan={4}
                    style={{
                      textAlign: 'left',
                      paddingLeft: '10px',
                      userSelect: 'none',
                    }}
                  >
                    <DurationSpan>{songDuration}</DurationSpan>
                  </FlexboxGrid.Item>
                </FlexboxGrid>
              </PlayerColumn>
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={6} style={{ textAlign: 'right', paddingRight: '10px' }}>
              <PlayerColumn right height="80px" style={{ flexDirection: 'column' }}>
                <div
                  style={{
                    height: '30px',
                    display: 'flex',
                    alignSelf: 'flex-end',
                    alignItems: 'flex-start',
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
                            await queryClient.refetchQueries(['album'], {
                              active: true,
                            });
                            await queryClient.refetchQueries(['starred'], {
                              active: true,
                            });
                            await queryClient.refetchQueries(['playlist'], {
                              active: true,
                            });
                          },
                        })
                      }
                      onKeyDown={(e: any) => {
                        if (e.key === ' ') {
                          handleFavorite(playQueue[currentEntryList][playQueue.currentIndex].id, {
                            custom: async () => {
                              await queryClient.refetchQueries(['album'], {
                                active: true,
                              });
                              await queryClient.refetchQueries(['starred'], {
                                active: true,
                              });
                              await queryClient.refetchQueries(['playlist'], {
                                active: true,
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
                      role="button"
                      tabIndex={0}
                      style={{ position: 'relative', display: 'inline-block' }}
                      onClick={handleRepeat}
                      onKeyDown={(e: any) => {
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
                      onKeyDown={(e: any) => {
                        if (e.key === ' ') {
                          handleShuffle();
                        }
                      }}
                      active={playQueue.shuffle ? 'true' : 'false'}
                    />
                  </CustomTooltip>

                  {/* Sleep Timer Button */}
                  <Whisper
                    ref={sleepTimerWhisperRef}
                    trigger="click"
                    placement="topEnd"
                    preventOverflow
                    speaker={
                      <Popup title={t('Sleep Timer')}>
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ marginRight: 8 }}>{t('Stop after current song')}</span>
                          <input
                            type="checkbox"
                            checked={playQueue.stopAfterCurrent}
                            onChange={(e) => dispatch(setStopAfterCurrent(e.target.checked))}
                          />
                        </div>
                        <div>
                          <StyledButton
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
                            size="xs"
                            min={1}
                            max={999}
                            width={70}
                            value={sleepTimerCustom}
                            onChange={(e: any) => setSleepTimerCustom(e)}
                            placeholder={t('min')}
                          />
                          <StyledButton
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
                          sleepTimerSeconds !== null || playQueue.stopAfterCurrent
                            ? 'true'
                            : 'false'
                        }
                      />
                      {sleepTimerSeconds !== null && (
                        <span
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
                      aria-label="show play queue"
                      aria-pressed={playQueue.displayQueue ? 'true' : 'false'}
                      role="button"
                      tabIndex={0}
                      icon="tasks"
                      size="lg"
                      fixedWidth
                      onClick={handleDisplayQueue}
                      onKeyDown={(e: any) => {
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

                  <Slider
                    value={Math.floor(localVolume * 100)}
                    min={0}
                    max={100}
                    onChange={handleVolumeSlider}
                    toolTipType="text"
                  />
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
          currentTime={currentTime}
          duration={playQueue[currentEntryList][playQueue.currentIndex]?.duration || 0}
          playerStatus={player.status}
          title={playQueue[currentEntryList][playQueue.currentIndex]?.title}
          artist={playQueue[currentEntryList][playQueue.currentIndex]?.artist
            ?.map((a: any) => a.title)
            .join(', ')}
          handlePlayPause={handlePlayPause}
          handlePrevTrack={handlePrevTrack}
          handleNextTrack={handleNextTrack}
          handleSeekSlider={effectiveHandleSeekSlider}
        />
      </Player>
    </>
  );
};

export default PlayerBar;
