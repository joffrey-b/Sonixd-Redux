import { useEffect, useRef, MutableRefObject } from 'react';
import axios from 'axios';
import type { Presence } from 'discord-rpc';
import { ipcRenderer } from '../components/shared/bridge';
import { notifyToast } from '../components/shared/toast';
import { useAppSelector } from '../redux/hooks';
import { Artist } from '../types';

const sanitize = (s: string) =>
  s
    .replace(/[.\-_:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const fetchItunesArt = async (artist: string, album: string): Promise<string | null> => {
  try {
    const { data } = await axios.get('https://itunes.apple.com/search', {
      params: {
        term: `${sanitize(artist)} ${sanitize(album)}`,
        media: 'music',
        entity: 'album',
        limit: 1,
      },
      timeout: 4000,
    });
    const raw = data.results?.[0]?.artworkUrl100;
    return raw || null;
  } catch {
    return null;
  }
};

// `discord-rpc` requires raw `net`/`timers` named-pipe/socket access to the local
// Discord desktop client (`new RPC.Client({ transport: 'ipc' })`) — fundamentally
// Node-only, with no browser-safe equivalent, so it cannot run in a renderer with
// `nodeIntegration: false`. The RPC.Client lifecycle (login/connected/setActivity/
// destroy) now lives entirely in the main process (see main.dev.mjs's "Discord Rich
// Presence" section); this hook only computes Presence payloads from Redux state
// (which the main process doesn't have) and dispatches them over bridge:discord:* IPC.
interface DiscordRpcProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- playersRef holds a heterogeneous player object whose type varies by backend (web vs. mpv)
  playersRef: MutableRefObject<any>;
  currentTimeRef: MutableRefObject<number>;
  isMpv: boolean;
}

const useDiscordRpc = ({ playersRef, currentTimeRef, isMpv }: DiscordRpcProps) => {
  const player = useAppSelector((state) => state.player);
  const playQueue = useAppSelector((state) => state.playQueue);
  const config = useAppSelector((state) => state.config);
  const artCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (config.external.discord.enabled) {
      const clientId = config.external.discord.clientId;
      if (!clientId || !/^\d+$/.test(clientId)) return;
      ipcRenderer.send('bridge:discord:connect', clientId);
    } else {
      ipcRenderer.send('bridge:discord:disconnect');
    }
  }, [config.external.discord.clientId, config.external.discord.enabled]);

  useEffect(() => {
    const handleConnected = () => notifyToast('success', 'Discord RPC is connected');
    const handleError = (_event: unknown, message: string) => notifyToast('error', message);

    ipcRenderer.on('bridge:discord:connected', handleConnected);
    ipcRenderer.on('bridge:discord:error', handleError);

    return () => {
      ipcRenderer.removeAllListeners('bridge:discord:connected');
      ipcRenderer.removeAllListeners('bridge:discord:error');
    };
  }, []);

  useEffect(() => {
    if (config.external.discord.enabled) {
      const setActivity = async () => {
        const effectiveCurrentTime = isMpv
          ? (currentTimeRef?.current ?? 0)
          : ((playQueue.currentPlayer === 1
              ? playersRef.current?.player1.audioEl.current?.currentTime
              : playersRef.current?.player2.audioEl.current?.currentTime) ?? 0);

        const now = Date.now();
        const isRadio = playQueue.current?.isRadio;
        const start = isRadio ? now : Math.round(now - effectiveCurrentTime * 1000) || 0;
        const duration = playQueue?.current?.duration;
        const end = duration ? Math.round(start + duration * 1000) : 0;

        const artists = playQueue.current?.artist?.map((artist: Artist) => artist.title).join(', ');

        const activity: Presence = {
          details: playQueue.current?.title.padEnd(2, ' ') || 'Not playing',
          state: artists ? `By ${artists}` : undefined,
          largeImageKey: undefined,
          largeImageText: playQueue.current?.album || 'Unknown album',
          smallImageKey: undefined,
          smallImageText: player.status,
          instance: false,
        };

        if (player.status === 'PLAYING') {
          activity.startTimestamp = start;
          if (end > 0) activity.endTimestamp = end;
          activity.smallImageKey = 'playing';
        } else {
          activity.smallImageKey = 'paused';
        }

        if (config.external.discord.showAlbumArt && playQueue.current) {
          const artist = artists || '';
          const album = playQueue.current.album || '';
          const cacheKey = `${artist}|${album}`;

          if (!artCacheRef.current[cacheKey]) {
            const url = await fetchItunesArt(artist, album);
            artCacheRef.current[cacheKey] = url || '';
          }

          activity.largeImageKey = artCacheRef.current[cacheKey] || 'icon';
        } else {
          activity.largeImageKey = 'icon';
        }

        ipcRenderer.send('bridge:discord:set-activity', activity);
      };

      // Update immediately then keep refreshing every 15 seconds (Discord rate limit)
      setActivity();
      const interval = setInterval(setActivity, 15e3);

      return () => clearInterval(interval);
    }
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playersRef and currentTimeRef are stable refs; adding them would cause unnecessary re-registration of the interval
  }, [
    config.external.discord.enabled,
    config.external.discord.showAlbumArt,
    isMpv,
    playQueue,
    playQueue.currentPlayer,
    player.status,
    playersRef,
  ]);
};

export default useDiscordRpc;
