import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { getPlayedSongsNotification, filterPlayQueue } from '../shared/utils';
import { notifyToast } from '../components/shared/toast';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { setStatus } from '../redux/playerSlice';
import {
  appendPlayQueue,
  clearPlayQueue,
  fixPlayer2Index,
  setPlayQueue,
} from '../redux/playQueueSlice';
import { APIEndpoints, Item, Play, Song } from '../types';
import { apiController } from '../api/controller';
import { selectEffectiveOffline } from '../redux/connectivitySlice';
import { selectCachedSongIdSet } from '../redux/cachedSongsSlice';
import { selectDownloadedSongIdSet } from '../redux/downloadedSongsSlice';
import { isAvailableOffline } from '../shared/isAvailableOffline';
import { getOfflineSongsForItemType, libraryCacheSongToSong } from '../shared/offlineLibrary';
import useLibraryCache from './useLibraryCache';
import usePlaylistsCache from './usePlaylistsCache';

const usePlayQueueHandler = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);
  const queryClient = useQueryClient();
  const effectiveOffline = useAppSelector(selectEffectiveOffline);
  const cachedSongIds = useAppSelector(selectCachedSongIdSet);
  const downloadedSongIds = useAppSelector(selectDownloadedSongIdSet);
  const { getCachedSongs } = useLibraryCache();
  const { getCachedPlaylists } = usePlaylistsCache();

  const dispatchSongsToQueue = useCallback(
    (entries: Song[], play: Play) => {
      // Skip-unavailable-songs (ADR Section 5.3/FIX 7) -- filtered before
      // filterPlayQueue runs, at queue-construction time, so unavailable
      // songs are never added to the queue in the first place. This filter
      // does not run at all when online -- behavior there is unchanged.
      let workingEntries = entries;
      if (effectiveOffline && entries.length > 0) {
        const availableEntries = entries.filter((song) =>
          isAvailableOffline(song.id, cachedSongIds, downloadedSongIds)
        );

        if (availableEntries.length === 0) {
          notifyToast('warning', t('None of these tracks are available offline.'));
          return;
        }

        if (availableEntries.length < entries.length) {
          notifyToast(
            'warning',
            t('{{skipped}} of {{total}} tracks unavailable offline — playing the rest.', {
              skipped: entries.length - availableEntries.length,
              total: entries.length,
            })
          );
        }

        workingEntries = availableEntries;
      }

      const filteredSongs = filterPlayQueue(config.playback.filters, workingEntries);

      if (play === Play.Play) {
        if (filteredSongs.entries.length > 0) {
          dispatch(setPlayQueue({ entries: filteredSongs.entries }));
          dispatch(setStatus('PLAYING'));
          dispatch(fixPlayer2Index());
        } else {
          dispatch(clearPlayQueue());
          dispatch(setStatus('PAUSED'));
        }
      }

      if (play === Play.Next || play === Play.Later) {
        if (filteredSongs.entries.length > 0) {
          dispatch(appendPlayQueue({ entries: filteredSongs.entries, type: play }));
          dispatch(fixPlayer2Index());
        }
      }

      notifyToast(
        'info',
        getPlayedSongsNotification({
          ...filteredSongs.count,
          type: play === Play.Play ? 'play' : 'add',
        })
      );
    },
    [config.playback.filters, dispatch, effectiveOffline, cachedSongIds, downloadedSongIds, t]
  );

  const handlePlayQueueAdd = async (options: {
    byData?: Song[];
    byItemType?: { item: Item; id: string; endpoint?: APIEndpoints };
    play: Play;
    musicFolder?: string;
    onEmpty?: () => void;
  }) => {
    if (options.byData) {
      dispatchSongsToQueue(options.byData, options.play);
    }

    if (options.byItemType) {
      // Offline (FIX 7): resolve the same "play this whole list" request
      // against the local snapshots instead of the network -- this is the
      // integration point for AlbumView/ArtistView's header Play buttons and
      // ArtistView's "Artist Mix"/"Latest Albums"/"Appears On" buttons, all
      // of which route through this one function.
      if (effectiveOffline) {
        const offlineSongs = getOfflineSongsForItemType(
          options.byItemType,
          getCachedSongs(),
          getCachedPlaylists()
        );

        // Fix G: previously, callers that didn't pass onEmpty fell through to
        // dispatchSongsToQueue with an empty array, surfacing a generic
        // "Playing 0 tracks" toast instead of an explanation. A caller-supplied
        // onEmpty (e.g. Artist Mix's "No similar songs found for this artist.")
        // still takes priority; everything else gets the same "none available
        // offline" message dispatchSongsToQueue's own all-unavailable case uses.
        if (offlineSongs.length === 0) {
          if (options.onEmpty) {
            options.onEmpty();
          } else {
            notifyToast('warning', t('None of these tracks are available offline.'));
          }
          return;
        }

        dispatchSongsToQueue(offlineSongs.map(libraryCacheSongToSong), options.play);
        return;
      }

      const getEndpoint = (item: Item) => {
        switch (item) {
          case Item.Album:
            return 'getAlbum';
          case Item.Artist:
            return 'getArtistSongs';
          case Item.Playlist:
            return 'getPlaylist';
          default:
            return 'getAlbum';
        }
      };

      try {
        const data = await apiController({
          serverType: config.serverType,
          endpoint: options.byItemType.endpoint || getEndpoint(options.byItemType.item),
          args: { id: options.byItemType.id, musicFolderId: options.musicFolder },
        });

        const songs = data?.song ?? data;
        if (options.onEmpty && Array.isArray(songs) && songs.length === 0) {
          options.onEmpty();
          return;
        }

        if (options.byItemType.item === Item.Album) {
          queryClient.setQueryData(['album', options.byItemType.id], data);
        } else if (options.byItemType.item === Item.Artist) {
          queryClient.setQueryData(['artistSongs', options.byItemType.id], data);
        } else if (options.byItemType.item === Item.Playlist) {
          queryClient.setQueryData(['playlist', options.byItemType.id], data);
        }

        if (data?.song) {
          dispatchSongsToQueue(data.song, options.play);
        } else {
          dispatchSongsToQueue(data, options.play);
        }
      } catch (err) {
        notifyToast('error', err);
      }
    }
  };

  return { handlePlayQueueAdd };
};

export default usePlayQueueHandler;
