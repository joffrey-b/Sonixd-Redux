import { useNavigate } from 'react-router-dom';
import React, { useEffect, useRef, useState } from 'react';
import _ from 'lodash';
import { nanoid } from 'nanoid/non-secure';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTranslation } from 'react-i18next';
import { ButtonToolbar, Form, Whisper } from 'rsuite';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  addModalPage,
  addProcessingPlaylist,
  removeProcessingPlaylist,
  setContextMenu,
} from '../../redux/miscSlice';
import {
  appendPlayQueue,
  clearPlayQueue,
  fixPlayer2Index,
  removeFromPlayQueue,
  setPlayQueue,
  setRate,
  setStar,
} from '../../redux/playQueueSlice';
import { removeFromPlaylist, setPlaylistRate } from '../../redux/playlistSlice';
import {
  ContextMenuDivider,
  ContextMenuWindow,
  StyledContextMenuButton,
  StyledInputPicker,
  StyledButton,
  StyledInputGroup,
  StyledInputPickerContainer,
  ContextMenuPopover,
  StyledInput,
} from './styled';
import { notifyToast } from './toast';
import {
  errorMessages,
  filterPlayQueue,
  getPlayedSongsNotification,
  isFailedResponse,
} from '../../shared/utils';
import { setStatus } from '../../redux/playerSlice';
import { apiController } from '../../api/controller';
import { Playlist, Server, Song } from '../../types';
import SpectrogramModal from './SpectrogramModal';
import { updateStarredInCache, updateRatingInCache } from '../../hooks/useLibraryCache';

export const ContextMenuButton = ({
  text,
  hotkey,
  ...rest
}: {
  text: string;
  hotkey?: string;
  [key: string]: unknown;
}) => {
  return (
    <StyledContextMenuButton {...rest} appearance="subtle" size="sm" block>
      <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
        {text}
      </div>
    </StyledContextMenuButton>
  );
};

export const ContextMenu = ({
  yPos,
  xPos,
  minWidth,
  maxWidth,
  numOfButtons,
  numOfDividers,
  hasTitle,
  children,
}: {
  yPos?: number;
  xPos?: number;
  minWidth?: number;
  maxWidth?: number;
  numOfButtons: number;
  numOfDividers: number;
  hasTitle?: boolean;
  children?: React.ReactNode;
}) => {
  return (
    <ContextMenuWindow
      $yPos={yPos ?? 0}
      $xPos={xPos ?? 0}
      $minWidth={minWidth ?? 0}
      $maxWidth={maxWidth ?? 0}
      $numOfButtons={numOfButtons}
      $numOfDividers={numOfDividers}
      $hasTitle={hasTitle ?? false}
    >
      {children}
    </ContextMenuWindow>
  );
};

export const GlobalContextMenu = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const playQueue = useAppSelector((state) => state.playQueue);
  const misc = useAppSelector((state) => state.misc);
  const multiSelect = useAppSelector((state) => state.multiSelect);
  const config = useAppSelector((state) => state.config);
  const folder = useAppSelector((state) => state.folder);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WhisperInstance lacks getState() in RSuite 6 types; runtime call uses internal RSuite component API
  const addToPlaylistTriggerRef = useRef<any>(null);
  const playlistPickerContainerRef = useRef(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [shouldCreatePlaylist, setShouldCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showSpectrogram, setShowSpectrogram] = useState(false);

  useEffect(() => {
    if (!misc.contextMenu.show) setShowDeleteConfirm(false);
  }, [misc.contextMenu.show]);

  const { data: playlists } = useQuery<Playlist[]>({
    queryKey: ['playlists'],
    queryFn: () => apiController({ serverType: config.serverType, endpoint: 'getPlaylists' }),
  });

  const handlePlay = async () => {
    dispatch(setContextMenu({ show: false }));
    const promises = [];
    try {
      if (misc.contextMenu.type?.match('music|nowPlaying|folder')) {
        const folders = multiSelect.selected.filter((entry) => entry.type === 'folder');
        const music = multiSelect.selected
          .filter((entry) => entry.type === 'music')
          .map((entry) => {
            return { ...entry, uniqueId: nanoid() };
          });

        for (let i = 0; i < folders.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getMusicDirectorySongs',
              args: { id: folders[i].id },
            })
          );
        }

        const res = await Promise.all(promises);
        res.push(_.orderBy(music, 'rowIndex', 'asc'));
        const songs = filterPlayQueue(config.playback.filters, _.flatten(res));

        if (songs.entries.length > 0) {
          dispatch(setPlayQueue({ entries: songs.entries }));
          dispatch(setStatus('PLAYING'));
          dispatch(fixPlayer2Index());
        } else {
          dispatch(clearPlayQueue());
          dispatch(setStatus('PAUSED'));
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'play' }));
      } else if (misc.contextMenu.type === 'playlist') {
        for (let i = 0; i < multiSelect.selected.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getPlaylist',
              args: { id: multiSelect.selected[i].id },
            })
          );
        }

        const res = await Promise.all(promises);
        const songs = filterPlayQueue(config.playback.filters, _.flatten(_.map(res, 'song')));

        if (songs.entries.length > 0) {
          dispatch(setPlayQueue({ entries: songs.entries }));
          dispatch(setStatus('PLAYING'));
          dispatch(fixPlayer2Index());
        } else {
          dispatch(clearPlayQueue());
          dispatch(setStatus('PAUSED'));
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'play' }));
      } else if (misc.contextMenu.type === 'album') {
        for (let i = 0; i < multiSelect.selected.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getAlbum',
              args: { id: multiSelect.selected[i].id },
            })
          );
        }

        const res = await Promise.all(promises);
        const songs = filterPlayQueue(config.playback.filters, _.flatten(_.map(res, 'song')));

        if (songs.entries.length > 0) {
          dispatch(setPlayQueue({ entries: songs.entries }));
          dispatch(setStatus('PLAYING'));
          dispatch(fixPlayer2Index());
        } else {
          dispatch(clearPlayQueue());
          dispatch(setStatus('PAUSED'));
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'play' }));
      } else if (misc.contextMenu.type === 'artist') {
        for (let i = 0; i < multiSelect.selected.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getArtistSongs',
              args: {
                id: multiSelect.selected[i].id,
                musicFolderId: folder.applied.music && folder.musicFolder,
              },
            })
          );
        }

        const res = await Promise.all(promises);
        const songs = filterPlayQueue(config.playback.filters, _.flatten(res));

        if (songs.entries.length > 0) {
          dispatch(setPlayQueue({ entries: songs.entries }));
          dispatch(setStatus('PLAYING'));
          dispatch(fixPlayer2Index());
        } else {
          dispatch(clearPlayQueue());
          dispatch(setStatus('PAUSED'));
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'play' }));
      } else if (misc.contextMenu.type === 'genre') {
        for (let i = 0; i < multiSelect.selected.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getSongsByGenre',
              args: {
                type: 'byGenre',
                genre: multiSelect.selected[i].title,
                musicFolderId:
                  (folder.applied.music || folder.applied.albums) && folder.musicFolder,
                size: 500,
                offset: 0,
                recursive: true,
                totalSongs: multiSelect.selected[i]?.songCount,
              },
            })
          );
        }

        const res = await Promise.all(promises);
        const songs = filterPlayQueue(config.playback.filters, _.flatten(_.map(res, 'data')));
        if (songs.entries.length > 0) {
          dispatch(setPlayQueue({ entries: songs.entries }));
          dispatch(setStatus('PLAYING'));
          dispatch(fixPlayer2Index());
        } else {
          dispatch(clearPlayQueue());
          dispatch(setStatus('PAUSED'));
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'play' }));
      }
    } catch (err) {
      notifyToast('error', err);
    }
  };

  const handleAddToQueue = async (type: 'next' | 'later') => {
    dispatch(setContextMenu({ show: false }));
    const promises = [];
    try {
      if (misc.contextMenu.type?.match('music|nowPlaying|folder')) {
        const folders = multiSelect.selected.filter((entry) => entry.type === 'folder');
        const music = multiSelect.selected
          .filter((entry) => entry.type === 'music')
          .map((entry) => {
            return { ...entry, uniqueId: nanoid() };
          });

        for (let i = 0; i < folders.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getMusicDirectorySongs',
              args: { id: folders[i].id },
            })
          );
        }

        const res = await Promise.all(promises);
        res.push(_.orderBy(music, 'rowIndex', 'asc'));
        const songs = filterPlayQueue(config.playback.filters, _.flatten(res));

        if (songs.entries.length > 0) {
          dispatch(appendPlayQueue({ entries: songs.entries, type }));
          dispatch(fixPlayer2Index());
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'add' }));
      } else if (misc.contextMenu.type === 'playlist') {
        for (let i = 0; i < multiSelect.selected.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getPlaylist',
              args: { id: multiSelect.selected[i].id },
            })
          );
        }

        const res = await Promise.all(promises);
        const songs = filterPlayQueue(config.playback.filters, _.flatten(_.map(res, 'song')));

        if (songs.entries.length > 0) {
          dispatch(appendPlayQueue({ entries: songs.entries, type }));
          dispatch(fixPlayer2Index());
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'add' }));
      } else if (misc.contextMenu.type === 'album') {
        for (let i = 0; i < multiSelect.selected.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getAlbum',
              args: { id: multiSelect.selected[i].id },
            })
          );
        }

        const res = await Promise.all(promises);
        const songs = filterPlayQueue(config.playback.filters, _.flatten(_.map(res, 'song')));

        if (songs.entries.length > 0) {
          dispatch(appendPlayQueue({ entries: songs.entries, type }));
          dispatch(fixPlayer2Index());
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'add' }));
      } else if (misc.contextMenu.type === 'artist') {
        for (let i = 0; i < multiSelect.selected.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getArtistSongs',
              args: {
                id: multiSelect.selected[i].id,
                musicFolderId: folder.applied.artists && folder.musicFolder,
              },
            })
          );
        }

        const res = await Promise.all(promises);
        const songs = filterPlayQueue(config.playback.filters, _.flatten(res));

        if (songs.entries.length > 0) {
          dispatch(appendPlayQueue({ entries: songs.entries, type }));
          dispatch(fixPlayer2Index());
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'add' }));
      } else if (misc.contextMenu.type === 'genre') {
        for (let i = 0; i < multiSelect.selected.length; i += 1) {
          promises.push(
            apiController({
              serverType: config.serverType,
              endpoint: 'getSongsByGenre',
              args: {
                type: 'byGenre',
                genre: multiSelect.selected[i].title,
                musicFolderId:
                  (folder.applied.albums || folder.applied.artists) && folder.musicFolder,
                size: 500,
                offset: 0,
                recursive: true,
                totalSongs: multiSelect.selected[i]?.songCount,
              },
            })
          );
        }

        const res = await Promise.all(promises);
        const songs = filterPlayQueue(config.playback.filters, _.flatten(_.map(res, 'data')));

        if (songs.entries.length > 0) {
          dispatch(appendPlayQueue({ entries: songs.entries, type }));
          dispatch(fixPlayer2Index());
        }

        notifyToast('info', getPlayedSongsNotification({ ...songs.count, type: 'add' }));
      }
    } catch (err) {
      notifyToast('error', err);
    }
  };

  const handleRemoveSelected = async () => {
    const songEntries = multiSelect.selected.filter((e) => e.type === 'music') as unknown as Song[];
    if (misc.contextMenu.type === 'nowPlaying') {
      if (multiSelect.selected.length === playQueue.entry.length) {
        dispatch(clearPlayQueue());
        dispatch(setStatus('PAUSED'));
      } else {
        dispatch(removeFromPlayQueue({ entries: songEntries }));
        if (playQueue.currentPlayer === 1) {
          dispatch(fixPlayer2Index());
        }
      }
    } else {
      dispatch(removeFromPlaylist({ selectedEntries: songEntries }));
    }

    dispatch(setContextMenu({ show: false }));
  };

  const playlistSuccessToast = (songCount: number, playlistId: string) => {
    notifyToast(
      'success',
      t('Added {{songCount}} item(s) to playlist {{playlist}}', {
        songCount,
        playlist: playlists?.find((pl: Playlist) => pl.id === playlistId)?.title,
      }),
      <>
        <StyledButton
          appearance="link"
          onClick={() => {
            navigate(`/playlist/${playlistId}`);
            dispatch(setContextMenu({ show: false }));
          }}
        >
          {t('Go to playlist')}
        </StyledButton>
      </>
    );
  };

  const handleAddToPlaylist = async () => {
    // If the window is closed, the selectedPlaylistId will be deleted
    const promises = [];
    let res;
    let songs;
    const localSelectedPlaylistId = selectedPlaylistId;
    dispatch(addProcessingPlaylist(selectedPlaylistId));

    try {
      if (misc.contextMenu.type?.match('music|nowPlaying|folder')) {
        if (config.serverType === Server.Subsonic) {
          const folders = multiSelect.selected.filter((entry) => entry.type === 'folder');
          const music = multiSelect.selected
            .filter((entry) => entry.type === 'music')
            .map((entry) => {
              return { ...entry, uniqueId: nanoid() };
            });

          for (let i = 0; i < folders.length; i += 1) {
            promises.push(
              apiController({
                serverType: config.serverType,
                endpoint: 'getMusicDirectorySongs',
                args: { id: folders[i].id },
              })
            );
          }

          const folderSongs = await Promise.all(promises);

          folderSongs.push(_.orderBy(music, 'rowIndex', 'asc'));
          songs = _.flatten(folderSongs);

          res = await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylistSongsLg',
            args: { id: localSelectedPlaylistId, entry: songs },
          });

          if (isFailedResponse(res)) {
            notifyToast('error', errorMessages(res)[0]);
          } else {
            playlistSuccessToast(songs.length, localSelectedPlaylistId);
          }
        }

        if (config.serverType === Server.Jellyfin) {
          res = await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylistSongsLg',
            args: { id: localSelectedPlaylistId, entry: multiSelect.selected },
          });

          playlistSuccessToast(multiSelect.selected.length, localSelectedPlaylistId);
        }
      } else if (misc.contextMenu.type === 'playlist') {
        if (config.serverType === Server.Subsonic) {
          for (let i = 0; i < multiSelect.selected.length; i += 1) {
            promises.push(
              apiController({
                serverType: config.serverType,
                endpoint: 'getPlaylist',
                args: { id: multiSelect.selected[i].id },
              })
            );
          }

          res = await Promise.all(promises);
          songs = _.flatten(_.map(res, 'song'));
          res = await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylistSongsLg',
            args: { id: localSelectedPlaylistId, entry: songs },
          });

          if (isFailedResponse(res)) {
            notifyToast('error', errorMessages(res)[0]);
          } else {
            playlistSuccessToast(songs.length, localSelectedPlaylistId);
          }
        }

        if (config.serverType === Server.Jellyfin) {
          res = await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylistSongsLg',
            args: { id: localSelectedPlaylistId, entry: multiSelect.selected },
          });

          playlistSuccessToast(multiSelect.selected.length, localSelectedPlaylistId);
        }
      } else if (misc.contextMenu.type === 'album') {
        if (config.serverType === Server.Subsonic) {
          for (let i = 0; i < multiSelect.selected.length; i += 1) {
            promises.push(
              apiController({
                serverType: config.serverType,
                endpoint: 'getAlbum',
                args: { id: multiSelect.selected[i].id },
              })
            );
          }

          res = await Promise.all(promises);
          songs = _.flatten(_.map(res, 'song'));
          res = await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylistSongsLg',
            args: { id: localSelectedPlaylistId, entry: songs },
          });

          if (isFailedResponse(res)) {
            notifyToast('error', errorMessages(res)[0]);
          } else {
            playlistSuccessToast(songs.length, localSelectedPlaylistId);
          }
        }

        if (config.serverType === Server.Jellyfin) {
          res = await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylistSongsLg',
            args: { id: localSelectedPlaylistId, entry: multiSelect.selected },
          });
          playlistSuccessToast(multiSelect.selected.length, localSelectedPlaylistId);
        }
      }
    } catch {
      notifyToast('error', t('Error adding to playlist'));
    } finally {
      dispatch(removeProcessingPlaylist(localSelectedPlaylistId));
      queryClient.removeQueries({ queryKey: ['playlist', localSelectedPlaylistId] });
    }

    await queryClient.refetchQueries({ queryKey: ['playlists'], type: 'active' });
  };

  const handleDeletePlaylist = async () => {
    dispatch(setContextMenu({ show: false }));
    const promises = [];

    for (let i = 0; i < multiSelect.selected.length; i += 1) {
      promises.push(
        apiController({
          serverType: config.serverType,
          endpoint: 'deletePlaylist',
          args: { id: multiSelect.selected[i].id },
        })
      );
    }

    try {
      const res = await Promise.all(promises);

      if (isFailedResponse(res)) {
        notifyToast('error', errorMessages(res)[0]);
      } else {
        notifyToast(
          'info',
          t('Deleted {{n}} playlists', {
            n: multiSelect.selected.length,
          })
        );
      }

      await queryClient.refetchQueries({ queryKey: ['playlists'], type: 'active' });
    } catch (err) {
      notifyToast('error', err);
    }
  };

  const handleCreatePlaylist = async () => {
    try {
      const res = await apiController({
        serverType: config.serverType,
        endpoint: 'createPlaylist',
        args: { name: newPlaylistName },
      });

      if (isFailedResponse(res)) {
        notifyToast('error', errorMessages(res)[0]);
      } else {
        await queryClient.refetchQueries({ queryKey: ['playlists'], type: 'active' });
        notifyToast('success', t('Playlist "{{newPlaylistName}}" created!', { newPlaylistName }));
      }
    } catch (err) {
      notifyToast('error', err);
    }
  };

  const refetchActive = async () => {
    await queryClient.refetchQueries({ queryKey: ['starred'], type: 'active' });
    await queryClient.refetchQueries({ queryKey: ['album'], type: 'active' });
    await queryClient.refetchQueries({ queryKey: ['albumList'], type: 'active' });
    await queryClient.refetchQueries({ queryKey: ['playlist'], type: 'active' });
    await queryClient.refetchQueries({ queryKey: ['artist'], type: 'active' });
    await queryClient.refetchQueries({ queryKey: ['artistList'], type: 'active' });
    await queryClient.refetchQueries({ queryKey: ['folder'], type: 'active' });
  };

  const handleFavorite = async () => {
    dispatch(setContextMenu({ show: false }));

    const sortedEntries = [...multiSelect.selected].sort(
      (a, b) => (a.rowIndex as number) - (b.rowIndex as number)
    );

    const ids = _.map(sortedEntries, 'id') as string[];

    try {
      const res = await apiController({
        serverType: config.serverType,
        endpoint: 'batchStar',
        args: { ids, type: sortedEntries[0].type },
      });

      if (isFailedResponse(res)) {
        notifyToast('error', errorMessages(res)[0]);
      } else {
        dispatch(setStar({ id: ids, type: 'star' }));
        ids.forEach((id) => updateStarredInCache(id, true));
      }

      await refetchActive();
    } catch (err) {
      notifyToast('error', err);
    }
  };

  const handleUnfavorite = async () => {
    dispatch(setContextMenu({ show: false }));

    // Run the unstar on all entries regardless of their starred status, since Airsonic
    // does not output the 'starred' property for starred artists
    const ids = _.map(multiSelect.selected, 'id') as string[];

    try {
      // Infer the type from the first selected entry
      const res = await apiController({
        serverType: config.serverType,
        endpoint: 'batchUnstar',
        args: { ids, type: multiSelect.selected[0].type },
      });

      if (isFailedResponse(res)) {
        notifyToast('error', errorMessages(res)[0]);
      } else {
        dispatch(setStar({ id: ids, type: 'unstar' }));
        ids.forEach((id) => updateStarredInCache(id, false));
      }

      await refetchActive();
    } catch (err) {
      notifyToast('error', err);
    }
  };

  const handleViewInModal = () => {
    dispatch(setContextMenu({ show: false }));
    if (
      misc.contextMenu.type &&
      misc.contextMenu.type !== 'music' &&
      multiSelect.selected.length === 1
    ) {
      dispatch(
        addModalPage({
          pageType: misc.contextMenu.type,
          id: (misc.contextMenu.details as { id?: string } | undefined)?.id ?? '',
        })
      );
    } else {
      notifyToast('error', t('Select only one row'));
    }
  };

  const handleViewInFolder = () => {
    dispatch(setContextMenu({ show: false }));
    if (misc.contextMenu.type?.match('music|nowPlaying') && multiSelect.selected.length === 1) {
      navigate(`/library/folder?folderId=${multiSelect.selected[0].parent}`);
    } else {
      notifyToast('error', t('Select only one row'));
    }
  };

  const handleShowSpectrogram = () => {
    dispatch(setContextMenu({ show: false }));
    if (multiSelect.selected.length !== 1) {
      notifyToast('error', t('Select only one row'));
      return;
    }
    setShowSpectrogram(true);
  };

  const handleRating = async (rating: number) => {
    dispatch(setContextMenu({ show: false }));
    const ids = _.map(multiSelect.selected, 'id') as string[];
    await apiController({
      serverType: config.serverType,
      endpoint: 'setRating',
      args: { ids, rating },
    });
    dispatch(setRate({ id: ids, rating }));
    dispatch(setPlaylistRate({ id: ids, rating }));
    ids.forEach((id) => updateRatingInCache(id, rating));
    await refetchActive();
  };

  return (
    <>
      {misc.contextMenu.show && (
        <ContextMenu
          xPos={misc.contextMenu.xPos}
          yPos={misc.contextMenu.yPos}
          minWidth={200}
          maxWidth={350}
          numOfButtons={12}
          numOfDividers={3}
        >
          <ContextMenuButton
            text={t('Play')}
            onClick={handlePlay}
            disabled={misc.contextMenu.disabledOptions?.includes('play')}
          />
          <ContextMenuButton
            data-testid="context-menu-play-next"
            text={t('Add to queue (next)')}
            onClick={() => handleAddToQueue('next')}
            disabled={misc.contextMenu.disabledOptions?.includes('addToQueueNext')}
          />
          <ContextMenuButton
            data-testid="context-menu-play-later"
            text={t('Add to queue (later)')}
            onClick={() => handleAddToQueue('later')}
            disabled={misc.contextMenu.disabledOptions?.includes('addToQueueLast')}
          />
          <ContextMenuButton
            data-testid="context-menu-remove-selected"
            text={t('Remove selected')}
            onClick={handleRemoveSelected}
            disabled={misc.contextMenu.disabledOptions?.includes('removeSelected')}
          />
          <ContextMenuDivider />

          <Whisper
            ref={addToPlaylistTriggerRef}
            enterable
            placement="autoHorizontal"
            trigger="none"
            speaker={
              <ContextMenuPopover>
                <StyledInputPickerContainer ref={playlistPickerContainerRef}>
                  <StyledInputGroup>
                    <StyledInputPicker
                      data-testid="add-to-playlist-select"
                      container={() => playlistPickerContainerRef.current}
                      data={playlists}
                      placement="autoVerticalStart"
                      virtualized
                      labelKey="title"
                      valueKey="id"
                      width={200}
                      placeholder={t('Select')}
                      onChange={(e: string) => setSelectedPlaylistId(e)}
                    />
                    <StyledButton
                      data-testid="add-to-playlist-confirm-button"
                      disabled={
                        !selectedPlaylistId ||
                        misc.isProcessingPlaylist.includes(selectedPlaylistId)
                      }
                      loading={misc.isProcessingPlaylist.includes(selectedPlaylistId)}
                      onClick={handleAddToPlaylist}
                    >
                      {t('Add')}
                    </StyledButton>
                  </StyledInputGroup>
                </StyledInputPickerContainer>
                <div>
                  <StyledButton
                    data-testid="context-menu-create-new-playlist-toggle"
                    size="sm"
                    appearance="subtle"
                    onClick={() => setShouldCreatePlaylist(!shouldCreatePlaylist)}
                  >
                    {t('Create new playlist')}
                  </StyledButton>
                </div>
                {shouldCreatePlaylist && (
                  <Form>
                    <br />
                    <StyledInputGroup>
                      <StyledInput
                        data-testid="context-menu-new-playlist-name-input"
                        placeholder={t('Enter name...')}
                        value={newPlaylistName}
                        onChange={(e: string) => setNewPlaylistName(e)}
                      />
                      <StyledButton
                        data-testid="context-menu-new-playlist-ok-button"
                        size="sm"
                        type="submit"
                        loading={false}
                        disabled={!newPlaylistName}
                        appearance="primary"
                        onClick={() => {
                          handleCreatePlaylist();
                          setShouldCreatePlaylist(false);
                        }}
                      >
                        {t('Ok')}
                      </StyledButton>
                    </StyledInputGroup>
                  </Form>
                )}
              </ContextMenuPopover>
            }
          >
            <ContextMenuButton
              data-testid="context-menu-add-to-playlist"
              text={t('Add to playlist')}
              onClick={() =>
                addToPlaylistTriggerRef.current.getState().open
                  ? addToPlaylistTriggerRef.current.close()
                  : addToPlaylistTriggerRef.current.open()
              }
              disabled={misc.contextMenu.disabledOptions?.includes('addToPlaylist')}
            />
          </Whisper>
          {showDeleteConfirm ? (
            <div style={{ padding: '8px 10px' }}>
              <p style={{ marginBottom: 8 }}>
                {t('Are you sure you want to delete {{n}} playlist(s)?', {
                  n: String(multiSelect?.selected?.length),
                })}
              </p>
              <ButtonToolbar>
                <StyledButton size="sm" appearance="primary" onClick={handleDeletePlaylist}>
                  {t('Yes')}
                </StyledButton>
                <StyledButton
                  size="sm"
                  appearance="subtle"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  {t('No')}
                </StyledButton>
              </ButtonToolbar>
            </div>
          ) : (
            <ContextMenuButton
              text={t('Delete playlist(s)')}
              onClick={() => setShowDeleteConfirm(true)}
              disabled={misc.contextMenu.disabledOptions?.includes('deletePlaylist')}
            />
          )}
          <ContextMenuDivider />
          <ContextMenuButton
            text={t('Add to favorites')}
            onClick={handleFavorite}
            disabled={misc.contextMenu.disabledOptions?.includes('addToFavorites')}
          />
          <ContextMenuButton
            text={t('Remove from favorites')}
            onClick={handleUnfavorite}
            disabled={misc.contextMenu.disabledOptions?.includes('removeFromFavorites')}
          />
          <Whisper
            enterable
            placement="autoHorizontal"
            trigger={
              misc.contextMenu.disabledOptions?.includes('setRating') ||
              config.serverType === Server.Jellyfin
                ? 'none'
                : 'hover'
            }
            delayOpen={300}
            speaker={
              <ContextMenuPopover>
                <ButtonToolbar>
                  <StyledButton onClick={() => handleRating(0)}>0</StyledButton>
                  <StyledButton onClick={() => handleRating(1)}>1</StyledButton>
                  <StyledButton onClick={() => handleRating(2)}>2</StyledButton>
                  <StyledButton onClick={() => handleRating(3)}>3</StyledButton>
                  <StyledButton onClick={() => handleRating(4)}>4</StyledButton>
                  <StyledButton onClick={() => handleRating(5)}>5</StyledButton>
                </ButtonToolbar>
              </ContextMenuPopover>
            }
          >
            <ContextMenuButton
              text={t('Set rating')}
              disabled={
                misc.contextMenu.disabledOptions?.includes('setRating') ||
                config.serverType === Server.Jellyfin
              }
            />
          </Whisper>
          <ContextMenuDivider />
          <ContextMenuButton
            text={t('View in modal')}
            onClick={handleViewInModal}
            disabled={misc.contextMenu.disabledOptions?.includes('viewInModal')}
          />
          <ContextMenuButton
            text={t('View in folder')}
            onClick={handleViewInFolder}
            disabled={misc.contextMenu.disabledOptions?.includes('viewInFolder')}
          />
          <ContextMenuButton
            data-testid="spectrogram-button"
            text={t('Show spectrogram')}
            onClick={handleShowSpectrogram}
            disabled={
              !misc.contextMenu.type?.match('music|nowPlaying') || multiSelect.selected.length !== 1
            }
          />
        </ContextMenu>
      )}
      <SpectrogramModal
        show={showSpectrogram}
        handleHide={() => setShowSpectrogram(false)}
        streamUrl={(multiSelect.selected[0] as unknown as Song)?.streamUrl}
        title={(multiSelect.selected[0] as unknown as Song)?.title}
        artist={(multiSelect.selected[0] as unknown as Song)?.artist
          ?.map((a: { title: string }) => a.title)
          .join(', ')}
      />
    </>
  );
};
