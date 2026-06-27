import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useState,
  useCallback,
} from 'react';
import { cache, ipcRenderer, settings } from '../shared/bridge';
import { incrementPlayCountInCache } from '../../hooks/useLibraryCache';
import { shouldScrobble as checkShouldScrobble } from '../../shared/scrobbleLogic';
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
  incrementEntryPlayCount,
} from '../../redux/playQueueSlice';
import cacheSong from '../shared/cacheSong';
import { apiController } from '../../api/controller';
import { Artist, Server, Song } from '../../types';
import { setStatus } from '../../redux/playerSlice';
import { EqState } from '../../redux/eqSlice';
import { PeqBand, PeqState } from '../../redux/peqSlice';
import type { AppDispatch, RootState } from '../../redux/store';

// setSinkId is a non-standard Chromium extension not in lib.dom.d.ts
interface AudioElementWithSinkId extends HTMLAudioElement {
  setSinkId(deviceId: string): Promise<void>;
}

function preampGain(preampDb: number, enabled: boolean): number {
  return enabled ? Math.pow(10, preampDb / 20) : 1;
}

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const gaplessListenHandler = (
  currentPlayerRef: React.MutableRefObject<ReactAudioPlayer | null>,
  nextPlayerRef: React.MutableRefObject<ReactAudioPlayer | null>,
  playQueue: RootState['playQueue'],
  currentEntryList: 'entry' | 'sortedEntry' | 'shuffledEntry',
  pollingInterval: number,
  scrobbleEnabled: boolean,
  scrobbled: boolean,
  setScrobbled: React.Dispatch<React.SetStateAction<boolean>>,
  serverType: Server,
  duration: number,
  scrobbleThreshold: number,
  dispatch: AppDispatch
) => {
  const currentSeek = currentPlayerRef.current?.audioEl.current?.currentTime || 0;

  // Add a bit of leeway for the second track to start since the
  // seek value doesn't always reach the duration
  const durationPadding = pollingInterval <= 10 ? 0.12 : pollingInterval <= 20 ? 0.13 : 0.15;
  if (currentSeek + durationPadding >= duration) {
    if (
      playQueue.repeat === 'none' &&
      playQueue.currentIndex === playQueue[currentEntryList].length - 1
    ) {
      return;
    }

    if (nextPlayerRef.current?.audioEl.current) {
      nextPlayerRef.current.audioEl.current.volume = playQueue.volume ** 2;
      nextPlayerRef.current.audioEl.current.play();
    }
  }

  // Conditions for scrobbling gapless track
  // 1. Scrobble enabled in settings
  // 2. Not already scrobbled
  // 3. Track reached past 4 minutes or past the scrobble threshold percentage
  // 4. Not in the last 2 seconds of the track (gapless player starts second track before first ends)
  // 5. Not a radio stream (live streams have no meaningful scrobble point)
  // Step 4 sets the scrobbled value to false again which would trigger a second scrobble
  if (
    scrobbleEnabled &&
    !playQueue.current?.isRadio &&
    !playQueue.current?.isPodcast &&
    currentSeek <= duration - 2 &&
    checkShouldScrobble({
      currentTime: currentSeek,
      duration,
      threshold: scrobbleThreshold,
      hasScrobbled: scrobbled,
    })
  ) {
    setScrobbled(true);
    incrementPlayCountInCache(playQueue.currentSongId);
    dispatch(incrementEntryPlayCount(playQueue.currentSongId));
    apiController({
      serverType,
      endpoint: 'scrobble',
      args: {
        id: playQueue.currentSongId,
        albumId: playQueue.current?.albumId,
        submission: true,
        position: serverType === Server.Jellyfin ? currentSeek * 1e7 : undefined,
      },
    });
  }
};

const listenHandler = (
  currentPlayerRef: React.MutableRefObject<ReactAudioPlayer | null>,
  nextPlayerRef: React.MutableRefObject<ReactAudioPlayer | null>,
  playQueue: RootState['playQueue'],
  currentEntryList: 'entry' | 'sortedEntry' | 'shuffledEntry',
  dispatch: AppDispatch,
  player: number,
  fadeDuration: number,
  fadeType: string,
  volumeFade: boolean,
  debug: boolean,
  scrobbleEnabled: boolean,
  scrobbled: boolean,
  setScrobbled: React.Dispatch<React.SetStateAction<boolean>>,
  serverType: Server,
  duration: number,
  scrobbleThreshold: number
) => {
  // Jellyfin only returns the duration in the last ~2 seconds of the song so we need to pass the
  // duration into the handler instead of fetching it here
  const currentSeek = currentPlayerRef.current?.audioEl.current?.currentTime || 0;
  const fadeAtTime = duration - fadeDuration;

  const playerKey = `player${player}` as 'player1' | 'player2';
  // Fade only if repeat is 'all' or if not on the last track
  if (
    playQueue[playerKey].index + 1 < playQueue[currentEntryList].length ||
    playQueue.repeat === 'all' ||
    playQueue.repeat === 'one'
  ) {
    // Detect to start fading when seek is greater than the fade time
    if (currentSeek >= fadeAtTime) {
      nextPlayerRef.current?.audioEl.current?.play();
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
          if (currentPlayerRef.current?.audioEl.current)
            currentPlayerRef.current.audioEl.current.volume = currentPlayerVolume ** 2;
          if (nextPlayerRef.current?.audioEl.current)
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
          if (currentPlayerRef.current?.audioEl.current)
            currentPlayerRef.current.audioEl.current.volume = currentPlayerVolume ** 2;
          if (nextPlayerRef.current?.audioEl.current)
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
        if (nextPlayerRef.current?.audioEl.current)
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
    scrobbleEnabled &&
    !playQueue.current?.isRadio &&
    !playQueue.current?.isPodcast &&
    currentSeek <= fadeAtTime &&
    checkShouldScrobble({
      currentTime: currentSeek,
      duration,
      threshold: scrobbleThreshold,
      hasScrobbled: scrobbled,
    })
  ) {
    setScrobbled(true);
    incrementPlayCountInCache(playQueue.currentSongId);
    dispatch(incrementEntryPlayCount(playQueue.currentSongId));
    apiController({
      serverType,
      endpoint: 'scrobble',
      args: {
        id: playQueue.currentSongId,
        albumId: playQueue.current?.albumId,
        submission: true,
        position: serverType === Server.Jellyfin ? currentSeek * 1e7 : undefined,
      },
    });
  }
};

export interface PlayerRef {
  player1: ReactAudioPlayer | null;
  player2: ReactAudioPlayer | null;
}

const Player = (
  {
    currentEntryList,
    muted,
    children,
  }: {
    currentEntryList: 'sortedEntry' | 'shuffledEntry' | 'entry';
    muted: boolean;
    children: React.ReactNode;
  },
  ref: React.ForwardedRef<PlayerRef>
) => {
  const dispatch = useAppDispatch();
  const player1Ref = useRef<ReactAudioPlayer | null>(null);
  const player2Ref = useRef<ReactAudioPlayer | null>(null);
  const playQueue = useAppSelector((state) => state.playQueue);
  const player = useAppSelector((state) => state.player);
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const isMpv = config.playback.playerBackend === 'mpv';
  const isJukebox = useAppSelector((state) => state.jukebox?.enabled ?? false);
  const cacheSongs = settings.get('cacheSongs');
  const [title] = useState('');
  const [scrobbled, setScrobbled] = useState(false);
  // Shared across both audio elements (not per-player): the gapless dual-player
  // setup hands the "active" role to the other element on every track-end, even
  // when looping a single-song queue back to itself. A per-player ref only sees
  // its own element restart from 0 every *other* loop, delaying the scrobble
  // reset by a full extra playthrough. Tracking one continuous position — whichever
  // element most recently reported it — catches every loop instead of every other one.
  const prevSeekRef = useRef(0);
  const eq = useAppSelector((state) => state.eq as EqState);
  const peq = useAppSelector((state) => state.peq as PeqState);

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
  // Track which HTMLAudioElements have been passed to createMediaElementSource.
  // React StrictMode double-invokes effects (mount → cleanup → remount) with the
  // same DOM elements — calling createMediaElementSource twice on the same element
  // throws InvalidStateError. These refs let us detect same-element remounts and
  // skip the rebuild, just restarting the paused hidden outputs instead.
  const connectedEl1Ref = useRef<HTMLAudioElement | null>(null);
  const connectedEl2Ref = useRef<HTMLAudioElement | null>(null);
  const quicksaveTimerRef = useRef<number | null>(null);

  // Cache existence is checked through the bridge now (async, see cache.exists) --
  // these can no longer return synchronously, so callers await/then the result.
  const getSrc1 = useCallback(async () => {
    const song = playQueue[currentEntryList][playQueue.player1.index];
    const ext = song?.suffix || 'mp3';
    const cachedSongPath = `${misc.songCachePath}/${song?.id}.${ext}`;
    return (await cache.exists(cachedSongPath)) ? cachedSongPath : song?.streamUrl;
  }, [misc.songCachePath, currentEntryList, playQueue]);

  const getSrc2 = useCallback(async () => {
    const song = playQueue[currentEntryList][playQueue.player2.index];
    const ext = song?.suffix || 'mp3';
    const cachedSongPath = `${misc.songCachePath}/${song?.id}.${ext}`;
    return (await cache.exists(cachedSongPath)) ? cachedSongPath : song?.streamUrl;
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
    const audioEl1 = player1Ref.current?.audioEl?.current as HTMLAudioElement | null;
    const audioEl2 = player2Ref.current?.audioEl?.current as HTMLAudioElement | null;

    if (!audioEl1 || !audioEl2) return;

    // React StrictMode remount / HMR guard: createMediaElementSource permanently
    // binds an HTMLAudioElement to a source node — calling it again on the same
    // element throws InvalidStateError. If the same elements are re-presented,
    // just restart the outputs the cleanup paused; don't rebuild the chain.
    if (audioEl1 === connectedEl1Ref.current && audioEl2 === connectedEl2Ref.current) {
      hiddenAudio1Ref.current?.play().catch(() => {});
      hiddenAudio2Ref.current?.play().catch(() => {});
      audioContextRef.current?.resume().catch(() => {});
      return;
    }

    // New elements: close any stale context from a previous (genuine) remount.
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }

    const ctx = new AudioContext();
    ctx.resume().catch(() => {});
    audioContextRef.current = ctx;
    connectedEl1Ref.current = audioEl1;
    connectedEl2Ref.current = audioEl2;

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

    const h1 = buildChain(audioEl1, filtersRef1, eqGainRef1, peqFiltersRef1, peqGainRef1);
    const h2 = buildChain(audioEl2, filtersRef2, eqGainRef2, peqFiltersRef2, peqGainRef2);
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
        (h1 as AudioElementWithSinkId)
          .setSinkId(deviceId)
          .catch(() => (h1 as AudioElementWithSinkId).setSinkId(''))
          .catch(() => {});

        (h2 as AudioElementWithSinkId)
          .setSinkId(deviceId)
          .catch(() => (h2 as AudioElementWithSinkId).setSinkId(''))
          .catch(() => {});
      }
    }

    return () => {
      h1.pause();
      h2.pause();
      // Not clearing srcObject or closing ctx: StrictMode remounts with the same
      // audio elements, and the srcObject/chain must survive so the same-element
      // guard above can restart playback without rebuilding the chain.
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
    if (isMpv) return;
    if (isJukebox) {
      setTimeout(() => {
        player1Ref.current?.audioEl.current?.pause();
      }, 100);
      setTimeout(() => {
        player2Ref.current?.audioEl.current?.pause();
      }, 100);
      return;
    }
    if (player.status === 'PLAYING') {
      setTimeout(() => {
        if (playQueue.currentPlayer === 1) {
          try {
            player1Ref.current?.audioEl.current?.play();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
          }
        } else {
          try {
            player2Ref.current?.audioEl.current?.play();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
          }
        }
      }, 100);
    } else {
      setTimeout(() => {
        player1Ref.current?.audioEl.current?.pause();
      }, 100);

      setTimeout(() => {
        player2Ref.current?.audioEl.current?.pause();
      }, 100);
    }
  }, [isMpv, isJukebox, playQueue.currentPlayer, player.status]);

  // Web scrobbling — reset submission flag on each new song.
  // currentPlayer is intentionally excluded: a player switch during crossfade
  // does NOT mean a new song started, and resetting here would allow a second
  // scrobble to fire for the same track if the threshold was already passed.
  useEffect(() => {
    if (isMpv || isJukebox) return;
    setScrobbled(false);
  }, [isMpv, isJukebox, playQueue.currentSongId]);

  useEffect(() => {
    if (isMpv || isJukebox) return undefined; // MPV/jukebox scrobbling handled elsewhere
    if (playQueue.scrobble && player.status === 'PLAYING' && !playQueue.current?.isPodcast) {
      const currentSeek =
        (playQueue.currentPlayer === 1
          ? player1Ref.current?.audioEl.current?.currentTime
          : player2Ref.current?.audioEl.current?.currentTime) ?? 0;

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
              position: config.serverType === Server.Jellyfin ? 5 * 1e7 : 5000,
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
              position: config.serverType === Server.Jellyfin ? 5 * 1e7 : 5000,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally use specific fields to avoid cancelling the 5s timer on volume/index updates; playQueue.currentSongId re-triggers when song changes
  }, [
    isMpv,
    isJukebox,
    config.serverType,
    currentEntryList,
    playQueue.currentSongId,
    playQueue.fadeDuration,
    playQueue.scrobble,
    playQueue.volume,
    playQueue.currentPlayer,
    player.status,
  ]);

  useEffect(() => {
    // getSrc1/getSrc2 now resolve asynchronously (the cache-existence check goes
    // through the bridge, see cache.exists) -- guard against dispatching a resolved
    // src after this effect has been superseded by a track switch/unmount.
    let cancelled = false;
    let timer1: ReturnType<typeof setTimeout> | undefined;
    let timer2: ReturnType<typeof setTimeout> | undefined;

    const dispatchSrcWhenResolved = (player: 1 | 2, srcPromise: Promise<string | undefined>) => {
      srcPromise
        .then((src) => {
          if (!cancelled) dispatch(setPlayerSrc({ player, src: src ?? '' }));
          return null;
        })
        .catch(() => {});
    };

    if (playQueue[currentEntryList].length > 0 && !playQueue.isFading) {
      // Adding a small delay when setting the track src helps to not break the player when we're modifying
      // the currentSongIndex such as when sorting the table, shuffling, or drag and dropping rows.
      // It can also prevent loading unneeded tracks when rapidly incrementing/decrementing the player.
      timer1 = setTimeout(() => dispatchSrcWhenResolved(1, getSrc1()), 100);
      timer2 = setTimeout(() => dispatchSrcWhenResolved(2, getSrc2()), 100);
    } else if (playQueue[currentEntryList].length > 0) {
      // If fading, just instantly switch the track, otherwise the player breaks
      // from the timeout due to the listen handlers that run during the fade
      // If switching to the NowPlayingView while on player1 and fading, dispatching
      // the src for player1 will cause the player to break
      dispatchSrcWhenResolved(1, getSrc1());
      dispatchSrcWhenResolved(2, getSrc2());
    }

    return () => {
      cancelled = true;
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
    };
  }, [currentEntryList, dispatch, getSrc1, getSrc2, playQueue]);

  const handleListenPlayer1 = useCallback(() => {
    const currentSeek = player1Ref.current?.audioEl.current?.currentTime || 0;
    if (prevSeekRef.current > 5 && currentSeek < 2) setScrobbled(false);
    prevSeekRef.current = currentSeek;
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
      playQueue.scrobble, // scrobbleEnabled
      scrobbled,
      setScrobbled,
      config.serverType,
      playQueue[currentEntryList][playQueue.player1.index]?.duration || 0,
      playQueue.scrobbleThreshold
    );
  }, [config.serverType, currentEntryList, dispatch, playQueue, scrobbled]);

  const handleListenPlayer2 = useCallback(() => {
    const currentSeek = player2Ref.current?.audioEl.current?.currentTime || 0;
    if (prevSeekRef.current > 5 && currentSeek < 2) setScrobbled(false);
    prevSeekRef.current = currentSeek;
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
      playQueue.scrobble, // scrobbleEnabled
      scrobbled,
      setScrobbled,
      config.serverType,
      playQueue[currentEntryList][playQueue.player2.index]?.duration || 0,
      playQueue.scrobbleThreshold
    );
  }, [config.serverType, currentEntryList, dispatch, playQueue, scrobbled]);

  function setMetadata(arg: Song | null | undefined) {
    if (!('mediaSession' in navigator) || !arg) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: arg.title || 'Unknown Title',
      artist:
        arg.artist?.length !== 0
          ? arg.artist?.map((artist: Artist) => artist.title).join(', ')
          : 'Unknown Artist',
      album: arg.album || 'Unknown Album',
      artwork: arg.image && !arg.image.includes('placeholder') ? [{ src: arg.image }] : [],
    });
    navigator.mediaSession.playbackState = 'playing';
  }

  const handleOnEndedPlayer1 = useCallback(() => {
    const endedSong1 = playQueue[currentEntryList][playQueue.player1.index];
    if (endedSong1?.isPodcast && config.serverType === Server.Subsonic) {
      apiController({
        serverType: config.serverType,
        endpoint: 'deleteBookmark',
        args: { id: endedSong1.id },
      }).catch(() => {});
    }
    if (player1Ref.current?.audioEl.current) player1Ref.current.audioEl.current.currentTime = 0;
    if (cacheSongs) {
      cacheSong(
        `${playQueue[currentEntryList][playQueue.player1.index].id}.${
          playQueue[currentEntryList][playQueue.player1.index].suffix || 'mp3'
        }`,
        playQueue[currentEntryList][playQueue.player1.index].streamUrl.replace(/stream/, 'download')
      ).catch(() => {});
    }

    if (
      (playQueue.repeat === 'none' &&
        playQueue.currentIndex === playQueue[currentEntryList].length - 1) ||
      playQueue.stopAfterCurrent
    ) {
      if (playQueue.stopAfterCurrent) dispatch(setStopAfterCurrent(false));
      dispatch(fixPlayer2Index());
      player1Ref.current?.audioEl.current?.pause();
      if (player1Ref.current?.audioEl.current) player1Ref.current.audioEl.current.currentTime = 0;
      player2Ref.current?.audioEl.current?.pause();
      if (player2Ref.current?.audioEl.current) player2Ref.current.audioEl.current.currentTime = 0;

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
            ) ?? 0
          ];
        setMetadata(nextSong);

        dispatch(setAutoIncremented(false));
      }
    }
  }, [cacheSongs, config.serverType, currentEntryList, dispatch, playQueue]);

  const handleOnEndedPlayer2 = useCallback(() => {
    const endedSong2 = playQueue[currentEntryList][playQueue.player2.index];
    if (endedSong2?.isPodcast && config.serverType === Server.Subsonic) {
      apiController({
        serverType: config.serverType,
        endpoint: 'deleteBookmark',
        args: { id: endedSong2.id },
      }).catch(() => {});
    }
    if (player2Ref.current?.audioEl.current) player2Ref.current.audioEl.current.currentTime = 0;
    if (cacheSongs) {
      cacheSong(
        `${playQueue[currentEntryList][playQueue.player2.index].id}.${
          playQueue[currentEntryList][playQueue.player2.index].suffix || 'mp3'
        }`,
        playQueue[currentEntryList][playQueue.player2.index].streamUrl.replace(/stream/, 'download')
      ).catch(() => {});
    }
    if (
      (playQueue.repeat === 'none' &&
        playQueue.currentIndex === playQueue[currentEntryList].length - 1) ||
      playQueue.stopAfterCurrent
    ) {
      if (playQueue.stopAfterCurrent) dispatch(setStopAfterCurrent(false));
      dispatch(fixPlayer2Index());
      player1Ref.current?.audioEl.current?.pause();
      if (player1Ref.current?.audioEl.current) player1Ref.current.audioEl.current.currentTime = 0;
      player2Ref.current?.audioEl.current?.pause();
      if (player2Ref.current?.audioEl.current) player2Ref.current.audioEl.current.currentTime = 0;

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
            ) ?? 0
          ];
        setMetadata(nextSong);

        dispatch(setAutoIncremented(false));
      }
    }
  }, [cacheSongs, config.serverType, currentEntryList, dispatch, playQueue]);

  const handleGaplessPlayer1 = useCallback(() => {
    const currentSeek = player1Ref.current?.audioEl.current?.currentTime || 0;
    if (prevSeekRef.current > 5 && currentSeek < 2) setScrobbled(false);
    prevSeekRef.current = currentSeek;
    gaplessListenHandler(
      player1Ref,
      player2Ref,
      playQueue,
      currentEntryList,
      playQueue.pollingInterval,
      playQueue.scrobble, // scrobbleEnabled
      scrobbled,
      setScrobbled,
      config.serverType,
      config.serverType === Server.Subsonic
        ? (player1Ref.current?.audioEl.current?.duration ?? 0)
        : (playQueue[currentEntryList][playQueue.player1.index]?.duration ?? 0),
      playQueue.scrobbleThreshold,
      dispatch
    );
  }, [config.serverType, currentEntryList, dispatch, playQueue, scrobbled]);

  const handleGaplessPlayer2 = useCallback(() => {
    const currentSeek = player2Ref.current?.audioEl.current?.currentTime || 0;
    if (prevSeekRef.current > 5 && currentSeek < 2) setScrobbled(false);
    prevSeekRef.current = currentSeek;
    gaplessListenHandler(
      player2Ref,
      player1Ref,
      playQueue,
      currentEntryList,
      playQueue.pollingInterval,
      playQueue.scrobble, // scrobbleEnabled
      scrobbled,
      setScrobbled,
      config.serverType,
      config.serverType === Server.Subsonic
        ? (player2Ref.current?.audioEl.current?.duration ?? 0)
        : (playQueue[currentEntryList][playQueue.player2.index]?.duration ?? 0),
      playQueue.scrobbleThreshold,
      dispatch
    );
  }, [config.serverType, currentEntryList, dispatch, playQueue, scrobbled]);

  const handleOnPlay = useCallback(
    (playerNumber: 1 | 2) => {
      const currentSong =
        playerNumber === 1
          ? playQueue[currentEntryList][playQueue.player1.index]
          : playQueue[currentEntryList][playQueue.player2.index];

      setMetadata(playQueue.current);

      // Save the queue 2.5 seconds after fade length
      if (settings.get('resume')) {
        if (quicksaveTimerRef.current !== null) {
          window.clearTimeout(quicksaveTimerRef.current);
        }
        quicksaveTimerRef.current = window.setTimeout(
          () => {
            quicksaveTimerRef.current = null;
            ipcRenderer.send('quicksave');
          },
          playQueue.fadeDuration * 1000 + 2500
        );
      }

      if (config.player.systemNotifications && currentSong) {
        new Notification(currentSong.title, {
          body: `${currentSong.artist.map((artist: Artist) => artist.title).join(', ')}\n${
            currentSong.album
          }`,
          icon: currentSong.image,
        });
      }

      if (config.serverType === Server.Jellyfin && playQueue.scrobble) {
        const currentSeek =
          (playerNumber === 1
            ? player1Ref.current?.audioEl.current?.currentTime
            : player2Ref.current?.audioEl.current?.currentTime) ?? 0;

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
      const pausedSong =
        playerNumber === 1
          ? playQueue[currentEntryList][playQueue.player1.index]
          : playQueue[currentEntryList][playQueue.player2.index];
      const pauseSeek =
        (playerNumber === 1
          ? player1Ref.current?.audioEl.current?.currentTime
          : player2Ref.current?.audioEl.current?.currentTime) ?? 0;
      const episodeDuration = pausedSong?.duration || 0;
      const nearEnd = episodeDuration > 0 && pauseSeek >= episodeDuration - 10;
      if (
        pausedSong?.isPodcast &&
        config.serverType === Server.Subsonic &&
        pauseSeek > 5 &&
        !nearEnd
      ) {
        apiController({
          serverType: config.serverType,
          endpoint: 'createBookmark',
          args: { id: pausedSong.id, position: Math.floor(pauseSeek * 1000) },
        }).catch(() => {});
      }

      if (config.serverType === Server.Jellyfin && playQueue.scrobble) {
        // Handle gapless pause
        const currentSeek =
          (playerNumber === 1
            ? player1Ref.current?.audioEl.current?.currentTime
            : player2Ref.current?.audioEl.current?.currentTime) ?? 0;

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
        await (h1 as AudioElementWithSinkId).setSinkId(deviceId);
        await (h2 as AudioElementWithSinkId).setSinkId(deviceId);
      } catch {
        try {
          await (h1 as AudioElementWithSinkId).setSinkId('');
          await (h2 as AudioElementWithSinkId).setSinkId('');
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
        if (player1Ref.current?.audioEl.current)
          player1Ref.current.audioEl.current.volume = playQueue.volume ** 2;
        if (player2Ref.current?.audioEl.current) player2Ref.current.audioEl.current.volume = 0;
      } else {
        if (player2Ref.current?.audioEl.current)
          player2Ref.current.audioEl.current.volume = playQueue.volume ** 2;
        if (player1Ref.current?.audioEl.current) player1Ref.current.audioEl.current.volume = 0;
      }
    }
  }, [playQueue.currentPlayer, playQueue.fadeDuration, playQueue.isFading, playQueue.volume]);

  useEffect(() => {
    return () => {
      if (quicksaveTimerRef.current !== null) {
        window.clearTimeout(quicksaveTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <Helmet>
        <title>{title}</title>
      </Helmet>

      <ReactAudioPlayer
        ref={player1Ref}
        src={playQueue.player1.src || undefined}
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
          !isJukebox &&
          playQueue.player1.index === playQueue.currentIndex &&
          playQueue.currentPlayer === 1 &&
          player.status === 'PLAYING'
        }
        muted={muted}
        crossOrigin="anonymous"
      />
      <ReactAudioPlayer
        ref={player2Ref}
        src={playQueue.player2.src || undefined}
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
          !isJukebox &&
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
