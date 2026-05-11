import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useState,
  useCallback,
} from 'react';
import { ipcRenderer } from 'electron';
import { incrementPlayCountInCache } from '../../hooks/useLibraryCache';
import ReactAudioPlayer from 'react-audio-player';
import { Helmet } from 'react-helmet-async';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  incrementCurrentIndex,
  incrementPlayerIndex,
  setCurrentPlayer,
  setIsFading,
  setAutoIncremented,
  fixPlayer2Index,
  setCurrentIndex,
  setFadeData,
  setPlayerSrc,
  setStopAfterCurrent,
  getNextPlayerIndex,
} from '../../redux/playQueueSlice';
import cacheSong from '../shared/cacheSong';
import { isCached } from '../../shared/utils';
import { apiController } from '../../api/controller';
import { Artist, Server } from '../../types';
import { setStatus } from '../../redux/playerSlice';
import { settings } from '../shared/setDefaultSettings';
import { EqState } from '../../redux/eqSlice';
import { PeqBand, PeqState } from '../../redux/peqSlice';

function preampGain(preampDb: number, enabled: boolean): number {
  return enabled ? Math.pow(10, preampDb / 20) : 1;
}

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const gaplessListenHandler = (
  currentPlayerRef: any,
  nextPlayerRef: any,
  playQueue: any,
  pollingInterval: number,
  shouldScrobble: boolean,
  scrobbled: boolean,
  setScrobbled: any,
  serverType: Server,
  duration: number,
  scrobbleThreshold: number
) => {
  const currentSeek = currentPlayerRef.current?.audioEl.current?.currentTime || 0;

  // Add a bit of leeway for the second track to start since the
  // seek value doesn't always reach the duration
  const durationPadding = pollingInterval <= 10 ? 0.12 : pollingInterval <= 20 ? 0.13 : 0.15;
  if (currentSeek + durationPadding >= duration) {
    if (playQueue.repeat === 'none' && playQueue.currentIndex === playQueue.entry.length - 1) {
      return;
    }

    nextPlayerRef.current.audioEl.current.volume = playQueue.volume ** 2;
    nextPlayerRef.current.audioEl.current.play();
  }

  // Conditions for scrobbling gapless track
  // 1. Scrobble enabled in settings
  // 2. Not already scrobbled
  // 3. Track reached past 4 minutes or past the scrobble threshold percentage
  // 4. Not in the last 2 seconds of the track (gapless player starts second track before first ends)
  // 5. Not a radio stream (live streams have no meaningful scrobble point)
  // Step 4 sets the scrobbled value to false again which would trigger a second scrobble
  if (
    shouldScrobble &&
    !scrobbled &&
    !playQueue.current?.isRadio &&
    (currentSeek >= 240 || currentSeek >= duration * (scrobbleThreshold / 100)) &&
    currentSeek <= duration - 2
  ) {
    setScrobbled(true);
    incrementPlayCountInCache(playQueue.currentSongId);
    apiController({
      serverType,
      endpoint: 'scrobble',
      args: {
        id: playQueue.currentSongId,
        albumId: playQueue.current.albumId,
        submission: true,
        position: serverType === Server.Jellyfin ? currentSeek * 1e7 : undefined,
      },
    });
  }
};

const listenHandler = (
  currentPlayerRef: any,
  nextPlayerRef: any,
  playQueue: any,
  currentEntryList: any,
  dispatch: any,
  player: number,
  fadeDuration: number,
  fadeType: string,
  volumeFade: boolean,
  debug: boolean,
  shouldScrobble: boolean,
  scrobbled: boolean,
  setScrobbled: any,
  serverType: Server,
  duration: number,
  scrobbleThreshold: number
) => {
  // Jellyfin only returns the duration in the last ~2 seconds of the song so we need to pass the
  // duration into the handler instead of fetching it here
  const currentSeek = currentPlayerRef.current?.audioEl.current?.currentTime || 0;
  const fadeAtTime = duration - fadeDuration;

  // Fade only if repeat is 'all' or if not on the last track
  if (
    playQueue[`player${player}`].index + 1 < playQueue[currentEntryList].length ||
    playQueue.repeat === 'all' ||
    playQueue.repeat === 'one'
  ) {
    // Detect to start fading when seek is greater than the fade time
    if (currentSeek >= fadeAtTime) {
      nextPlayerRef.current.audioEl.current.play();
      dispatch(setIsFading(true));

      if (volumeFade) {
        const timeLeft = duration - currentSeek;
        let currentPlayerVolumeCalculation;
        let nextPlayerVolumeCalculation;
        let percentageOfFadeLeft;
        let n;
        switch (fadeType) {
          case 'equalPower':
            // https://dsp.stackexchange.com/a/14755
            percentageOfFadeLeft = (timeLeft / fadeDuration) * 2;
            currentPlayerVolumeCalculation =
              Math.sqrt(0.5 * percentageOfFadeLeft) * playQueue.volume;
            nextPlayerVolumeCalculation =
              Math.sqrt(0.5 * (2 - percentageOfFadeLeft)) * playQueue.volume;
            break;
          case 'linear':
            currentPlayerVolumeCalculation = (timeLeft / fadeDuration) * playQueue.volume;
            nextPlayerVolumeCalculation =
              ((fadeDuration - timeLeft) / fadeDuration) * playQueue.volume;
            break;
          case 'dipped':
            // https://math.stackexchange.com/a/4622
            percentageOfFadeLeft = timeLeft / fadeDuration;
            currentPlayerVolumeCalculation = percentageOfFadeLeft ** 2 * playQueue.volume;
            nextPlayerVolumeCalculation = (percentageOfFadeLeft - 1) ** 2 * playQueue.volume;
            break;
          case fadeType.match(/constantPower.*/)?.input:
            // https://math.stackexchange.com/a/26159
            n =
              fadeType === 'constantPower'
                ? 0
                : fadeType === 'constantPowerSlowFade'
                ? 1
                : fadeType === 'constantPowerSlowCut'
                ? 3
                : 10;

            percentageOfFadeLeft = timeLeft / fadeDuration;
            currentPlayerVolumeCalculation =
              Math.cos((Math.PI / 4) * ((2 * percentageOfFadeLeft - 1) ** (2 * n + 1) - 1)) *
              playQueue.volume;
            nextPlayerVolumeCalculation =
              Math.cos((Math.PI / 4) * ((2 * percentageOfFadeLeft - 1) ** (2 * n + 1) + 1)) *
              playQueue.volume;
            break;

          default:
            currentPlayerVolumeCalculation = (timeLeft / fadeDuration) * playQueue.volume;
            nextPlayerVolumeCalculation =
              ((fadeDuration - timeLeft) / fadeDuration) * playQueue.volume;
            break;
        }

        const currentPlayerVolume =
          currentPlayerVolumeCalculation >= 0 ? currentPlayerVolumeCalculation : 0;

        const nextPlayerVolume =
          nextPlayerVolumeCalculation <= playQueue.volume
            ? nextPlayerVolumeCalculation
            : playQueue.volume;

        if (player === 1) {
          currentPlayerRef.current.audioEl.current.volume = currentPlayerVolume ** 2;
          nextPlayerRef.current.audioEl.current.volume = nextPlayerVolume ** 2;
          if (debug) {
            dispatch(
              setFadeData({
                player: 1,
                time: timeLeft,
                volume: currentPlayerVolume,
              })
            );
            dispatch(
              setFadeData({
                player: 2,
                time: timeLeft,
                volume: nextPlayerVolume,
              })
            );
          }
        } else {
          currentPlayerRef.current.audioEl.current.volume = currentPlayerVolume ** 2;
          nextPlayerRef.current.audioEl.current.volume = nextPlayerVolume ** 2;
          if (debug) {
            dispatch(
              setFadeData({
                player: 2,
                time: timeLeft,
                volume: currentPlayerVolume,
              })
            );
            dispatch(
              setFadeData({
                player: 1,
                time: timeLeft,
                volume: nextPlayerVolume,
              })
            );
          }
        }
      } else {
        nextPlayerRef.current.audioEl.current.volume = playQueue.volume ** 2;
      }
    }
  }

  // Conditions for scrobbling fading track
  // 1. Scrobble enabled in settings
  // 2. Not already scrobbled
  // 3. Track reached past 4 minutes or past the scrobble threshold percentage
  // 4. The track is not fading
  // 5. Not a radio stream
  if (
    shouldScrobble &&
    !scrobbled &&
    !playQueue.current?.isRadio &&
    (currentSeek >= 240 || currentSeek >= duration * (scrobbleThreshold / 100)) &&
    currentSeek <= fadeAtTime
  ) {
    setScrobbled(true);
    incrementPlayCountInCache(playQueue.currentSongId);
    apiController({
      serverType,
      endpoint: 'scrobble',
      args: {
        id: playQueue.currentSongId,
        albumId: playQueue.current.albumId,
        submission: true,
        position: serverType === Server.Jellyfin ? currentSeek * 1e7 : undefined,
      },
    });
  }
};

const Player = ({ currentEntryList, muted, children }: any, ref: any) => {
  const dispatch = useAppDispatch();
  const player1Ref = useRef<any>();
  const player2Ref = useRef<any>();
  const playQueue = useAppSelector((state) => state.playQueue);
  const player = useAppSelector((state) => state.player);
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const isMpv = config.playback.playerBackend === 'mpv';
  const cacheSongs = settings.get('cacheSongs');
  const [title] = useState('');
  const [scrobbled, setScrobbled] = useState(false);
  const eq = useAppSelector((state: any) => state.eq as EqState);
  const peq = useAppSelector((state: any) => state.peq as PeqState);

  const audioContextRef = useRef<AudioContext | null>(null);
  const filtersRef1 = useRef<BiquadFilterNode[]>([]);
  const filtersRef2 = useRef<BiquadFilterNode[]>([]);
  const peqFiltersRef1 = useRef<BiquadFilterNode[]>([]);
  const peqFiltersRef2 = useRef<BiquadFilterNode[]>([]);
  const eqGainRef1 = useRef<GainNode | null>(null);
  const eqGainRef2 = useRef<GainNode | null>(null);
  const peqGainRef1 = useRef<GainNode | null>(null);
  const peqGainRef2 = useRef<GainNode | null>(null);
  const hiddenAudio1Ref = useRef<HTMLAudioElement | null>(null);
  const hiddenAudio2Ref = useRef<HTMLAudioElement | null>(null);

  const getSrc1 = useCallback(() => {
    const song = playQueue[currentEntryList][playQueue.player1.index];
    const ext = song?.suffix || 'mp3';
    const cachedSongPath = `${misc.songCachePath}/${song?.id}.${ext}`;
    return isCached(cachedSongPath) ? cachedSongPath : song?.streamUrl;
  }, [misc.songCachePath, currentEntryList, playQueue]);

  const getSrc2 = useCallback(() => {
    const song = playQueue[currentEntryList][playQueue.player2.index];
    const ext = song?.suffix || 'mp3';
    const cachedSongPath = `${misc.songCachePath}/${song?.id}.${ext}`;
    return isCached(cachedSongPath) ? cachedSongPath : song?.streamUrl;
  }, [misc.songCachePath, currentEntryList, playQueue]);

  useImperativeHandle(ref, () => ({
    get player1() {
      return player1Ref.current;
    },
    get player2() {
      return player2Ref.current;
    },
  }));

  const applyPeqBand = (filter: BiquadFilterNode, band: PeqBand, peqEnabled: boolean) => {
    if (!peqEnabled || !band.enabled) {
      // Transparent: peaking at 0 dB has no effect and no phase shift
      filter.type = 'peaking';
      filter.frequency.value = 1000;
      filter.gain.value = 0;
      filter.Q.value = 1;
      return;
    }
    filter.type = band.type;
    filter.frequency.value = band.freq;
    filter.Q.value = band.q;
    filter.gain.value = band.gain;
  };

  // Build the Web Audio EQ chain once on mount.
  // audio element → MediaElementSource → 10 graphic EQ BiquadFilters → GainNode (EQ preamp) → 10 PEQ BiquadFilters → GainNode (PEQ preamp) → MediaStreamDestination → hidden <audio>
  // The hidden <audio> element is where setSinkId is applied (AudioContext.setSinkId not available
  // in Chromium 108, so we route through a MediaStream to a regular audio element instead).
  useEffect(() => {
    const ctx = new AudioContext();
    ctx.resume().catch(() => {});
    audioContextRef.current = ctx;

    const buildChain = (
      audioEl: HTMLAudioElement,
      filtersRef: React.MutableRefObject<BiquadFilterNode[]>,
      eqGainRef: React.MutableRefObject<GainNode | null>,
      peqFiltersRef: React.MutableRefObject<BiquadFilterNode[]>,
      peqGainRef: React.MutableRefObject<GainNode | null>
    ): HTMLAudioElement => {
      const source = ctx.createMediaElementSource(audioEl);
      const filters: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq) => {
        const f = ctx.createBiquadFilter();
        f.type = 'peaking';
        f.frequency.value = freq;
        f.Q.value = 1.4;
        f.gain.value = 0;
        return f;
      });
      let prev: AudioNode = source;
      filters.forEach((f) => {
        prev.connect(f);
        prev = f;
      });
      // Graphic EQ preamp GainNode
      const eqGainNode = ctx.createGain();
      eqGainNode.gain.value = preampGain(eq.preampDb, eq.enabled);
      prev.connect(eqGainNode);
      prev = eqGainNode;
      // Chain 10 parametric EQ filters after the graphic EQ
      const peqFilters: BiquadFilterNode[] = peq.bands.map((band) => {
        const f = ctx.createBiquadFilter();
        applyPeqBand(f, band, peq.enabled);
        return f;
      });
      peqFilters.forEach((f) => {
        prev.connect(f);
        prev = f;
      });
      // PEQ preamp GainNode after PEQ filters
      const peqGainNode = ctx.createGain();
      peqGainNode.gain.value = preampGain(peq.preampDb, peq.enabled);
      prev.connect(peqGainNode);
      const dest = ctx.createMediaStreamDestination();
      peqGainNode.connect(dest);
      const hidden = new Audio();
      hidden.srcObject = dest.stream;
      hidden.play().catch(() => {});
      filtersRef.current = filters;
      eqGainRef.current = eqGainNode;
      peqFiltersRef.current = peqFilters;
      peqGainRef.current = peqGainNode;
      return hidden;
    };

    const h1 = buildChain(
      player1Ref.current.audioEl.current,
      filtersRef1,
      eqGainRef1,
      peqFiltersRef1,
      peqGainRef1
    );
    const h2 = buildChain(
      player2Ref.current.audioEl.current,
      filtersRef2,
      eqGainRef2,
      peqFiltersRef2,
      peqGainRef2
    );
    hiddenAudio1Ref.current = h1;
    hiddenAudio2Ref.current = h2;

    // Apply initial muted state — the muted useEffect runs after this one, so without this
    // there is a brief window where hidden elements play unmuted even if muted=true on mount
    h1.muted = muted;
    h2.muted = muted;

    // Apply initial gains
    const initGains = eq.enabled ? eq.gains : Array(10).fill(0);
    filtersRef1.current.forEach((f, i) => {
      f.gain.value = initGains[i] ?? 0;
    });
    filtersRef2.current.forEach((f, i) => {
      f.gain.value = initGains[i] ?? 0;
    });

    // Apply initial audio device (web backend only — MPV handles its own routing)
    if (!isMpv) {
      const deviceId = config.playback.audioDeviceId || '';
      if (deviceId) {
        (h1 as any).setSinkId(deviceId).catch(() => (h1 as any).setSinkId('').catch(() => {}));
        (h2 as any).setSinkId(deviceId).catch(() => (h2 as any).setSinkId('').catch(() => {}));
      }
    }

    return () => {
      h1.pause();
      h1.srcObject = null;
      h2.pause();
      h2.srcObject = null;
      ctx.close();
    };
    // Intentionally runs only on mount — sinkId and gains have dedicated effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update BiquadFilter gains when EQ state changes
  useEffect(() => {
    if (filtersRef1.current.length === 0) return;
    const gains = eq.enabled ? eq.gains : Array(10).fill(0);
    filtersRef1.current.forEach((f, i) => {
      f.gain.value = gains[i] ?? 0;
    });
    filtersRef2.current.forEach((f, i) => {
      f.gain.value = gains[i] ?? 0;
    });
  }, [eq.enabled, eq.gains]);

  // Update PEQ BiquadFilters when PEQ state changes
  useEffect(() => {
    if (peqFiltersRef1.current.length === 0) return;
    peqFiltersRef1.current.forEach((f, i) => {
      if (peq.bands[i]) applyPeqBand(f, peq.bands[i], peq.enabled);
    });
    peqFiltersRef2.current.forEach((f, i) => {
      if (peq.bands[i]) applyPeqBand(f, peq.bands[i], peq.enabled);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peq.enabled, peq.bands]);

  // Update EQ preamp GainNode when EQ preamp or enabled changes
  useEffect(() => {
    const gain = preampGain(eq.preampDb, eq.enabled);
    if (eqGainRef1.current) eqGainRef1.current.gain.value = gain;
    if (eqGainRef2.current) eqGainRef2.current.gain.value = gain;
  }, [eq.preampDb, eq.enabled]);

  // Update PEQ preamp GainNode when PEQ preamp or enabled changes
  useEffect(() => {
    const gain = preampGain(peq.preampDb, peq.enabled);
    if (peqGainRef1.current) peqGainRef1.current.gain.value = gain;
    if (peqGainRef2.current) peqGainRef2.current.gain.value = gain;
  }, [peq.preampDb, peq.enabled]);

  // Propagate muted state to the hidden output elements
  useEffect(() => {
    if (hiddenAudio1Ref.current) hiddenAudio1Ref.current.muted = muted;
    if (hiddenAudio2Ref.current) hiddenAudio2Ref.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (isMpv) return; // MPV handles its own playback; don't drive the web audio elements
    if (player.status === 'PLAYING') {
      setTimeout(() => {
        if (playQueue.currentPlayer === 1) {
          try {
            player1Ref.current.audioEl.current.play();
          } catch (err) {
            console.log(err);
          }
        } else {
          try {
            player2Ref.current.audioEl.current.play();
          } catch (err) {
            console.log(err);
          }
        }
      }, 100);
    } else {
      // Hacky way to stop the player on quick polling intervals due to the fader continuously calling the play function
      setTimeout(() => {
        for (let i = 0; i <= 100; i += 1) {
          player1Ref.current.audioEl.current.pause();
        }
      }, 100);

      setTimeout(() => {
        for (let i = 0; i <= 100; i += 1) {
          player2Ref.current.audioEl.current.pause();
        }
      }, 100);
    }
  }, [isMpv, playQueue.currentPlayer, player.status]);

  useEffect(() => {
    if (isMpv) return undefined; // MPV scrobbling is handled in PlayerBar.tsx
    if (playQueue.scrobble && player.status === 'PLAYING') {
      setScrobbled(false); // Only scrobble a single time per song change

      const currentSeek =
        playQueue.currentPlayer === 1
          ? player1Ref.current.audioEl.current?.currentTime
          : player2Ref.current.audioEl.current?.currentTime;

      // Handle gapless players
      if (playQueue.fadeDuration === 0 && currentSeek < 1) {
        const timer = setTimeout(() => {
          apiController({
            serverType: config.serverType,
            endpoint: 'scrobble',
            args: {
              id:
                playQueue.currentPlayer === 1
                  ? playQueue[currentEntryList][playQueue.player1.index]?.id
                  : playQueue[currentEntryList][playQueue.player2.index]?.id,
              submission: false,
              position: 5 * 1e7,
              event: 'start',
            },
          });
        }, 5000);

        return () => {
          clearTimeout(timer);
        };
      }

      // Handle crossfade players
      if (playQueue.fadeDuration !== 0 && currentSeek < playQueue.fadeDuration + 1) {
        const timer = setTimeout(() => {
          apiController({
            serverType: config.serverType,
            endpoint: 'scrobble',
            args: {
              id:
                playQueue.currentPlayer === 1
                  ? playQueue[currentEntryList][playQueue.player1.index]?.id
                  : playQueue[currentEntryList][playQueue.player2.index]?.id,
              submission: false,
              position: 5 * 1e7,
              event: 'start',
            },
          });
        }, 5000);

        return () => {
          clearTimeout(timer);
        };
      }
    }

    return undefined;
  }, [
    isMpv,
    config.serverType,
    currentEntryList,
    playQueue,
    playQueue.currentPlayer,
    player.status,
  ]);

  useEffect(() => {
    // Adding a small delay when setting the track src helps to not break the player when we're modifying
    // the currentSongIndex such as when sorting the table, shuffling, or drag and dropping rows.
    // It can also prevent loading unneeded tracks when rapidly incrementing/decrementing the player.
    if (playQueue[currentEntryList].length > 0 && !playQueue.isFading) {
      const timer1 = setTimeout(() => {
        dispatch(setPlayerSrc({ player: 1, src: getSrc1() }));
      }, 100);

      const timer2 = setTimeout(() => {
        dispatch(setPlayerSrc({ player: 2, src: getSrc2() }));
      }, 100);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }

    if (playQueue[currentEntryList].length > 0) {
      // If fading, just instantly switch the track, otherwise the player breaks
      // from the timeout due to the listen handlers that run during the fade
      // If switching to the NowPlayingView while on player1 and fading, dispatching
      // the src for player1 will cause the player to break

      dispatch(setPlayerSrc({ player: 1, src: getSrc1() }));
      dispatch(setPlayerSrc({ player: 2, src: getSrc2() }));
    }

    return undefined;
  }, [currentEntryList, dispatch, getSrc1, getSrc2, playQueue]);

  const handleListenPlayer1 = useCallback(() => {
    listenHandler(
      player1Ref,
      player2Ref,
      playQueue,
      currentEntryList,
      dispatch,
      1,
      playQueue.fadeDuration,
      playQueue.fadeType,
      playQueue.volumeFade,
      playQueue.showDebugWindow,
      playQueue.scrobble,
      scrobbled,
      setScrobbled,
      config.serverType,
      playQueue[currentEntryList][playQueue.player1.index]?.duration,
      playQueue.scrobbleThreshold
    );
  }, [config.serverType, currentEntryList, dispatch, playQueue, scrobbled]);

  const handleListenPlayer2 = useCallback(() => {
    listenHandler(
      player2Ref,
      player1Ref,
      playQueue,
      currentEntryList,
      dispatch,
      2,
      playQueue.fadeDuration,
      playQueue.fadeType,
      playQueue.volumeFade,
      playQueue.showDebugWindow,
      playQueue.scrobble,
      scrobbled,
      setScrobbled,
      config.serverType,
      playQueue[currentEntryList][playQueue.player2.index]?.duration,
      playQueue.scrobbleThreshold
    );
  }, [config.serverType, currentEntryList, dispatch, playQueue, scrobbled]);

  function setMetadata(arg: any) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: arg.title || 'Unknown Title',
      artist:
        arg.artist?.length !== 0
          ? arg.artist?.map((artist: any) => artist.title).join(', ')
          : 'Unknown Artist',
      album: arg.album || 'Unknown Album',
      artwork: [
        {
          src: arg.image?.includes('placeholder')
            ? 'https://raw.githubusercontent.com/joffrey-b/Sonixd-Redux/main/src/img/placeholder.png'
            : arg.image || '',
        },
      ],
    });
    navigator.mediaSession.playbackState = 'playing';
  }

  const handleOnEndedPlayer1 = useCallback(() => {
    player1Ref.current.audioEl.current.currentTime = 0;
    if (cacheSongs) {
      cacheSong(
        `${playQueue[currentEntryList][playQueue.player1.index].id}.${
          playQueue[currentEntryList][playQueue.player1.index].suffix || 'mp3'
        }`,
        playQueue[currentEntryList][playQueue.player1.index].streamUrl.replace(/stream/, 'download')
      );
    }

    if (
      (playQueue.repeat === 'none' && playQueue.currentIndex === playQueue.entry.length - 1) ||
      playQueue.stopAfterCurrent
    ) {
      if (playQueue.stopAfterCurrent) dispatch(setStopAfterCurrent(false));
      dispatch(fixPlayer2Index());
      player1Ref.current.audioEl.current.pause();
      player1Ref.current.audioEl.current.currentTime = 0;
      player2Ref.current.audioEl.current.pause();
      player2Ref.current.audioEl.current.currentTime = 0;

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }

      setTimeout(() => {
        dispatch(setStatus('PAUSED'));
      }, 250);
    } else {
      if (!playQueue.autoIncremented) {
        dispatch(incrementCurrentIndex('none'));
        dispatch(setCurrentIndex(playQueue[currentEntryList][playQueue.player2.index]));
        dispatch(setAutoIncremented(true));
      }
      if (playQueue[currentEntryList].length > 0 || playQueue.repeat === 'all') {
        dispatch(setCurrentPlayer(2));
        dispatch(incrementPlayerIndex(1));
        if (playQueue.fadeDuration !== 0) {
          dispatch(setIsFading(false));
        }

        const nextSong =
          playQueue[currentEntryList][
            getNextPlayerIndex(
              playQueue[currentEntryList].length,
              playQueue.repeat,
              playQueue.player1.index
            )
          ];
        setMetadata(nextSong);

        dispatch(setAutoIncremented(false));
      }
    }
  }, [cacheSongs, currentEntryList, dispatch, playQueue]);

  const handleOnEndedPlayer2 = useCallback(() => {
    player2Ref.current.audioEl.current.currentTime = 0;
    if (cacheSongs) {
      cacheSong(
        `${playQueue[currentEntryList][playQueue.player2.index].id}.${
          playQueue[currentEntryList][playQueue.player2.index].suffix || 'mp3'
        }`,
        playQueue[currentEntryList][playQueue.player2.index].streamUrl.replace(/stream/, 'download')
      );
    }
    if (
      (playQueue.repeat === 'none' && playQueue.currentIndex === playQueue.entry.length - 1) ||
      playQueue.stopAfterCurrent
    ) {
      if (playQueue.stopAfterCurrent) dispatch(setStopAfterCurrent(false));
      dispatch(fixPlayer2Index());
      player1Ref.current.audioEl.current.pause();
      player1Ref.current.audioEl.current.currentTime = 0;
      player2Ref.current.audioEl.current.pause();
      player2Ref.current.audioEl.current.currentTime = 0;

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }

      setTimeout(() => {
        dispatch(setStatus('PAUSED'));
      }, 250);
    } else {
      if (!playQueue.autoIncremented) {
        dispatch(incrementCurrentIndex('none'));
        dispatch(setCurrentIndex(playQueue[currentEntryList][playQueue.player1.index]));
        dispatch(setAutoIncremented(true));
      }
      if (playQueue[currentEntryList].length > 0 || playQueue.repeat === 'all') {
        dispatch(setCurrentPlayer(1));
        dispatch(incrementPlayerIndex(2));
        if (playQueue.fadeDuration !== 0) {
          dispatch(setIsFading(false));
        }

        const nextSong =
          playQueue[currentEntryList][
            getNextPlayerIndex(
              playQueue[currentEntryList].length,
              playQueue.repeat,
              playQueue.player2.index
            )
          ];
        setMetadata(nextSong);

        dispatch(setAutoIncremented(false));
      }
    }
  }, [cacheSongs, currentEntryList, dispatch, playQueue]);

  const handleGaplessPlayer1 = useCallback(() => {
    gaplessListenHandler(
      player1Ref,
      player2Ref,
      playQueue,
      playQueue.pollingInterval,
      playQueue.scrobble,
      scrobbled,
      setScrobbled,
      config.serverType,
      config.serverType === Server.Subsonic
        ? player1Ref.current?.audioEl.current.duration
        : playQueue[currentEntryList][playQueue.player1.index]?.duration,
      playQueue.scrobbleThreshold
    );
  }, [config.serverType, currentEntryList, playQueue, scrobbled]);

  const handleGaplessPlayer2 = useCallback(() => {
    gaplessListenHandler(
      player2Ref,
      player1Ref,
      playQueue,
      playQueue.pollingInterval,
      playQueue.scrobble,
      scrobbled,
      setScrobbled,
      config.serverType,
      config.serverType === Server.Subsonic
        ? player2Ref.current?.audioEl.current.duration
        : playQueue[currentEntryList][playQueue.player2.index]?.duration,
      playQueue.scrobbleThreshold
    );
  }, [config.serverType, currentEntryList, playQueue, scrobbled]);

  const handleOnPlay = useCallback(
    (playerNumber: 1 | 2) => {
      const currentSong =
        playerNumber === 1
          ? playQueue[currentEntryList][playQueue.player1.index]
          : playQueue[currentEntryList][playQueue.player2.index];

      setMetadata(playQueue.current);

      // Save the queue 2.5 seconds after fade length
      if (settings.get('resume')) {
        setTimeout(() => {
          ipcRenderer.send('quicksave');
        }, playQueue.fadeDuration * 1000 + 2500);
      }

      if (config.player.systemNotifications && currentSong) {
        // eslint-disable-next-line no-new
        new Notification(currentSong.title, {
          body: `${currentSong.artist.map((artist: Artist) => artist.title).join(', ')}\n${
            currentSong.album
          }`,
          icon: currentSong.image,
        });
      }

      if (config.serverType === Server.Jellyfin && playQueue.scrobble) {
        const currentSeek =
          playerNumber === 1
            ? player1Ref.current.audioEl.current.currentTime
            : player2Ref.current.audioEl.current.currentTime;

        apiController({
          serverType: config.serverType,
          endpoint: 'scrobble',
          args: {
            id: currentSong?.id,
            submission: false,
            position: currentSeek * 1e7,
            event: 'unpause',
          },
        });
      }
    },
    [config.serverType, config.player.systemNotifications, currentEntryList, playQueue]
  );

  const handleOnPause = useCallback(
    async (playerNumber: 1 | 2) => {
      if (config.serverType === Server.Jellyfin && playQueue.scrobble) {
        // Handle gapless pause
        const currentSeek =
          playerNumber === 1
            ? player1Ref.current.audioEl.current.currentTime
            : player2Ref.current.audioEl.current.currentTime;

        if (currentSeek > 3 && playQueue.fadeDuration === 0) {
          apiController({
            serverType: config.serverType,
            endpoint: 'scrobble',
            args: {
              id:
                playerNumber === 1
                  ? playQueue[currentEntryList][playQueue.player1.index]?.id
                  : playQueue[currentEntryList][playQueue.player2.index]?.id,
              submission: false,
              position: currentSeek * 1e7,
              event: 'pause',
            },
          });

          // Handle crossfade pause
        } else if (playQueue.fadeDuration !== 0 && !playQueue.isFading) {
          apiController({
            serverType: config.serverType,
            endpoint: 'scrobble',
            args: {
              id:
                playerNumber === 1
                  ? playQueue[currentEntryList][playQueue.player1.index]?.id
                  : playQueue[currentEntryList][playQueue.player2.index]?.id,
              submission: false,
              position: currentSeek * 1e7,
              event: 'pause',
            },
          });
        }
      }
    },
    [config.serverType, currentEntryList, playQueue]
  );

  // Route audio output to the selected device via the hidden audio elements (Option C).
  // Audio travels: player audio element → Web Audio chain → MediaStream → hidden element → device.
  // setSinkId on the original player elements would be ignored since audio exits via the chain.
  useEffect(() => {
    if (isMpv) return undefined; // MPV handles its own audio routing; don't touch setSinkId
    const deviceId = config.playback.audioDeviceId || '';
    const applySinkId = async () => {
      const h1 = hiddenAudio1Ref.current;
      const h2 = hiddenAudio2Ref.current;
      if (!h1 || !h2) return; // chain not yet set up; initial sinkId applied in setup effect
      try {
        await (h1 as any).setSinkId(deviceId);
        await (h2 as any).setSinkId(deviceId);
      } catch {
        try {
          await (h1 as any).setSinkId('');
          await (h2 as any).setSinkId('');
        } catch {
          /* ignore */
        }
      }
    };

    applySinkId();
    navigator.mediaDevices.addEventListener('devicechange', applySinkId);
    return () => navigator.mediaDevices.removeEventListener('devicechange', applySinkId);
  }, [config.playback.audioDeviceId, isMpv]);

  // Reset the player volumes when the track changes
  useEffect(() => {
    if (!playQueue.isFading || !(playQueue.fadeDuration === 0)) {
      if (playQueue.currentPlayer === 1) {
        player1Ref.current.audioEl.current.volume = playQueue.volume ** 2;
        player2Ref.current.audioEl.current.volume = 0;
      } else {
        player2Ref.current.audioEl.current.volume = playQueue.volume ** 2;
        player1Ref.current.audioEl.current.volume = 0;
      }
    }
  }, [playQueue.currentPlayer, playQueue.fadeDuration, playQueue.isFading, playQueue.volume]);

  return (
    <>
      <Helmet>
        <title>{title}</title>
      </Helmet>

      <ReactAudioPlayer
        ref={player1Ref}
        src={playQueue.player1.src}
        onPlay={() => handleOnPlay(1)}
        onPause={() => handleOnPause(1)}
        listenInterval={playQueue.pollingInterval}
        preload={isMpv ? 'none' : 'auto'}
        onListen={
          isMpv
            ? undefined
            : playQueue.fadeDuration === 0
            ? handleGaplessPlayer1
            : handleListenPlayer1
        }
        onEnded={isMpv ? undefined : handleOnEndedPlayer1}
        volume={player1Ref.current?.audioEl?.current?.volume || 0}
        autoPlay={
          !isMpv &&
          playQueue.player1.index === playQueue.currentIndex &&
          playQueue.currentPlayer === 1 &&
          player.status === 'PLAYING'
        }
        muted={muted}
        crossOrigin="anonymous"
      />
      <ReactAudioPlayer
        ref={player2Ref}
        src={playQueue.player2.src}
        onPlay={() => handleOnPlay(2)}
        onPause={() => handleOnPause(2)}
        listenInterval={playQueue.pollingInterval}
        preload={isMpv ? 'none' : 'auto'}
        onListen={
          isMpv
            ? undefined
            : playQueue.fadeDuration === 0
            ? handleGaplessPlayer2
            : handleListenPlayer2
        }
        onEnded={isMpv ? undefined : handleOnEndedPlayer2}
        volume={player2Ref.current?.audioEl?.current?.volume || 0}
        autoPlay={
          !isMpv &&
          playQueue.player2.index === playQueue.currentIndex &&
          playQueue.currentPlayer === 2 &&
          player.status === 'PLAYING'
        }
        muted={muted}
        crossOrigin="anonymous"
      />
      {children}
    </>
  );
};

export default forwardRef(Player);
