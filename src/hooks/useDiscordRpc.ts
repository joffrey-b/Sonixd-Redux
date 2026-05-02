/* eslint-disable consistent-return */
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import RPC, { Presence } from 'discord-rpc';
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

const useDiscordRpc = ({ playersRef, currentTimeRef, isMpv }: any) => {
  const player = useAppSelector((state) => state.player);
  const playQueue = useAppSelector((state) => state.playQueue);
  const config = useAppSelector((state) => state.config);
  const [discordRpc, setDiscordRpc] = useState<any>();
  const artCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (config.external.discord.enabled) {
      const client = new RPC.Client({ transport: 'ipc' });

      if (discordRpc?.client !== config.external.discord.clientId) {
        client.login({ clientId: config.external.discord.clientId }).catch((err: any) => {
          notifyToast('error', `${err}`);
        });

        client.once('connected', () => {
          notifyToast('success', 'Discord RPC is connected');
        });

        setDiscordRpc(client);
      }
    }
  }, [config.external.discord.clientId, config.external.discord.enabled, discordRpc?.client]);

  useEffect(() => {
    if (!config.external.discord.enabled) {
      try {
        discordRpc?.destroy();
      } catch (err) {
        notifyToast('error', `${err}`);
      }
    }
  }, [config.external.discord.enabled, discordRpc]);

  useEffect(() => {
    if (config.external.discord.enabled) {
      const setActivity = async () => {
        if (!discordRpc) {
          return;
        }

        const effectiveCurrentTime = isMpv
          ? currentTimeRef?.current ?? 0
          : (playQueue.currentPlayer === 1
              ? playersRef.current?.player1.audioEl.current?.currentTime
              : playersRef.current?.player2.audioEl.current?.currentTime) ?? 0;

        const now = Date.now();
        const start = Math.round(now - effectiveCurrentTime * 1000) || 0;
        const end = Math.round(start + playQueue?.current?.duration * 1000) || 0;

        const artists = playQueue.current?.artist.map((artist: Artist) => artist.title).join(', ');

        const activity: Presence = {
          details: playQueue.current?.title.padEnd(2, ' ') || 'Not playing',
          state: artists && `By ${artists}`,
          largeImageKey: undefined,
          largeImageText: playQueue.current?.album || 'Unknown album',
          smallImageKey: undefined,
          smallImageText: player.status,
          instance: false,
        };

        if (player.status === 'PLAYING') {
          activity.startTimestamp = start;
          activity.endTimestamp = end;
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

        discordRpc.setActivity(activity);
      };

      // Update immediately then keep refreshing every 15 seconds (Discord rate limit)
      setActivity();
      const interval = setInterval(setActivity, 15e3);

      return () => clearInterval(interval);
    }
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.external.discord.enabled,
    config.external.discord.showAlbumArt,
    discordRpc,
    isMpv,
    playQueue,
    playQueue.currentPlayer,
    player.status,
    playersRef,
  ]);
};

export default useDiscordRpc;
