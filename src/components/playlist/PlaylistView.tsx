import React, { useEffect, useState, useRef } from 'react';
import _ from 'lodash';
import { ButtonToolbar, Form, Whisper } from 'rsuite';
import { useHotkeys } from 'react-hotkeys-hook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CopyToClipboardButton,
  DeleteButton,
  DownloadButton,
  EditButton,
  PlayAppendButton,
  PlayAppendNextButton,
  PlayButton,
  RemoveFromOfflineButton,
  SaveButton,
  UndoButton,
} from '../shared/ToolbarButtons';
import useBulkDownload from '../../hooks/useBulkDownload';
import { selectDownloadProgress } from '../../redux/downloadProgressSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { fixPlayer2Index, setPlayQueueByRowClick } from '../../redux/playQueueSlice';
import { clearSelected } from '../../redux/multiSelectSlice';
import {
  createRecoveryFile,
  errorMessages,
  formatDate,
  formatDateTime,
  formatDuration,
  getAlbumSize,
  getCurrentEntryList,
  getRecoveryPath,
  getUniqueRandomNumberArr,
  isFailedResponse,
  joinPath,
} from '../../shared/utils';
import useIsCached from '../../hooks/useIsCached';
import useSearchQuery from '../../hooks/useSearchQuery';
import GenericPage from '../layout/GenericPage';
import ListViewType, { ListViewHandle } from '../viewtypes/ListViewType';
import GenericPageHeader from '../layout/GenericPageHeader';
import { setStatus } from '../../redux/playerSlice';
import { notifyToast } from '../shared/toast';
import { addProcessingPlaylist, removeProcessingPlaylist } from '../../redux/miscSlice';
import { StyledButton, StyledCheckbox, StyledInput, StyledLink } from '../shared/styled';
import { removeFromPlaylist, setPlaylistData } from '../../redux/playlistSlice';
import { PageHeaderSubtitleDataLine } from '../layout/styled';
import CustomTooltip from '../shared/CustomTooltip';
import { apiController } from '../../api/controller';
import { Play, Playlist, Server, Song } from '../../types';
import type { RowDataType } from 'rsuite-table';
import type { WhisperInstance } from 'rsuite/Whisper';

import Card from '../card/Card';
import CenterLoader from '../loader/CenterLoader';
import useListClickHandler from '../../hooks/useListClickHandler';
import Popup from '../shared/Popup';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';
import { useBrowserDownload } from '../../hooks/useBrowserDownload';
import { useCopyToClipboardConfirm } from '../../hooks/useCopyToClipboardConfirm';
import { settings, cache, recovery as recoveryBridge } from '../shared/bridge';
import { selectEffectiveOffline } from '../../redux/connectivitySlice';
import usePlaylistsCache from '../../hooks/usePlaylistsCache';
import useLibraryCache from '../../hooks/useLibraryCache';
import { playlistCacheEntryToPlaylistWithSongs } from '../../shared/offlineLibrary';
import useIsAvailableOffline from '../../hooks/useIsAvailableOffline';

const PlaylistView = ({ ...rest }) => {
  const { t } = useTranslation();
  const [isModified, setIsModified] = useState(false);
  const dispatch = useAppDispatch();
  const playlist = useAppSelector((state) => state.playlist);
  const multiSelect = useAppSelector((state) => state.multiSelect);
  const config = useAppSelector((state) => state.config);
  const misc = useAppSelector((state) => state.misc);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editTriggerRef = useRef<WhisperInstance | null>(null);
  const tableRef = useRef<ListViewHandle | null>(null);
  const { id } = useParams();
  const playlistId = rest.id ? rest.id : id;
  const playlistImagePath = `${misc.imageCachePath}playlist_${playlistId}.jpg`;
  const isPlaylistImageCached = useIsCached(playlistImagePath);

  const effectiveOffline = useAppSelector(selectEffectiveOffline);
  const { getCachedPlaylists } = usePlaylistsCache();
  const { getCachedSongs } = useLibraryCache();

  const {
    isLoading: onlineIsLoading,
    isError: onlineIsError,
    data: onlineData,
    error,
  } = useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getPlaylist',
        args: { id: playlistId },
      }),
    enabled: !effectiveOffline,
  });

  // Offline browsing (ADR Section 5.2/5.3) -- resolves the cached playlist's
  // song id references against the existing song snapshot; online path
  // above is unchanged.
  const offlineData = React.useMemo(() => {
    if (!effectiveOffline || !playlistId) return undefined;
    const entry = getCachedPlaylists().find((p) => p.id === playlistId);
    if (!entry) return undefined;
    const songsById = new Map(getCachedSongs().map((song) => [song.id, song]));
    return playlistCacheEntryToPlaylistWithSongs(entry, songsById);
  }, [effectiveOffline, playlistId, getCachedPlaylists, getCachedSongs]);

  const data = effectiveOffline ? offlineData : onlineData;
  const isLoading = effectiveOffline ? false : onlineIsLoading;
  const isError = effectiveOffline ? false : onlineIsError;

  const [customPlaylistImage, setCustomPlaylistImage] = useState<string | string[]>(
    'img/placeholder.png'
  );
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [recoveryPath, setRecoveryPath] = useState('');
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const filteredData = useSearchQuery(misc.searchQuery, playlist.entry, [
    'title',
    'artist',
    'album',
    'year',
    'genre',
    'path',
  ]);

  useHotkeys(
    config.hotkeys.removeSelected,
    () => {
      if (multiSelect.selected.length === 0) return;
      const selectedType = multiSelect.selected[0].type;
      if (selectedType === 'music') {
        dispatch(
          removeFromPlaylist({ selectedEntries: multiSelect.selected as unknown as Song[] })
        );
      }
    },
    [multiSelect.selected, config.hotkeys.removeSelected]
  );

  useEffect(() => {
    let cancelled = false;
    const recoveryFilePath = joinPath(getRecoveryPath(), `playlist_${data?.id}.json`);

    setRecoveryPath(recoveryFilePath);
    cache
      .exists(recoveryFilePath)
      .then((exists) => {
        if (!cancelled) setNeedsRecovery(exists);
        return undefined;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [data?.id]);

  useEffect(() => {
    // Set the local playlist data on any changes
    dispatch(setPlaylistData(data?.song || []));
    setEditName(data?.title || '');
    setEditDescription(data?.comment || '');
    setEditPublic(data?.public || false);
  }, [data, dispatch]);

  useEffect(() => {
    if (!_.isEqual(data?.song, playlist[getCurrentEntryList(playlist)])) {
      setIsModified(true);
    } else {
      setIsModified(false);
    }
  }, [data?.song, playlist]);

  const isAvailableOfflineCheck = useIsAvailableOffline();

  const { handleRowClick, handleRowDoubleClick, handleDragEnd } = useListClickHandler({
    doubleClick: (rowData: RowDataType) => {
      // Fix C: see AlbumView.tsx for the full rationale.
      if (effectiveOffline && !isAvailableOfflineCheck(rowData.id as string)) {
        notifyToast('warning', t("This track isn't available offline."));
        return;
      }

      dispatch(
        setPlayQueueByRowClick({
          entries: rowData.tableData,
          currentIndex: rowData.rowIndex,
          currentSongId: rowData.id,
          uniqueSongId: rowData.uniqueId,
          filters: config.playback.filters,
        })
      );
      dispatch(setStatus('PLAYING'));
      dispatch(fixPlayer2Index());
    },
    dnd: 'playlist',
  });

  const { handlePlayQueueAdd } = usePlayQueueHandler();
  const { handleDownload } = useBrowserDownload();
  const { requestCopyConfirmation, confirmCopyModal } = useCopyToClipboardConfirm();
  const { downloadSongs, removeDownloadedSongs } = useBulkDownload();
  const downloadProgress = useAppSelector(selectDownloadProgress);

  const handleOfflineDownload = () => {
    downloadSongs(data.song || []);
  };

  const handleOfflineDelete = () => {
    removeDownloadedSongs((data.song || []).map((song: { id: string }) => song.id));
  };

  const handleSave = async (recovery: boolean) => {
    dispatch(clearSelected());
    dispatch(addProcessingPlaylist(data.id));
    if (config.serverType === Server.Subsonic) {
      try {
        let res;
        // `recovery.read` returns null on ENOENT (the bridge can't synchronously throw
        // like `fs.readFileSync` did) -- throwing here preserves the original's
        // "missing recovery file falls into the catch block" behavior exactly.
        const recoveryRaw = recovery ? await recoveryBridge.read(recoveryPath) : null;
        if (recovery && recoveryRaw === null) throw new Error('Recovery file not found');
        const playlistData = recovery
          ? JSON.parse(recoveryRaw as string)
          : playlist[getCurrentEntryList(playlist)];

        // Smaller playlists can use the safe /createPlaylist method of saving
        if (playlistData.length <= 400 && !recovery) {
          res = await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylistSongs',
            args: { id: data.id, entry: playlistData },
          });

          if (isFailedResponse(res)) {
            notifyToast('error', errorMessages(res)[0]);
          } else {
            notifyToast('success', t('Saved playlist'));
            await queryClient.refetchQueries({ queryKey: ['playlist'], type: 'active' });
          }
        } else {
          // For larger playlists, we'll need to first clear out the playlist and then re-populate it
          // Tested on Airsonic instances, /createPlaylist fails with around ~350+ songId params
          res = await apiController({
            serverType: config.serverType,
            endpoint: 'clearPlaylist',
            args: { id: data.id },
          });

          if (isFailedResponse(res)) {
            notifyToast('error', errorMessages(res)[0]);
            return dispatch(removeProcessingPlaylist(data.id));
          }

          res = await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylistSongsLg',
            args: { id: data.id, entry: playlistData },
          });

          if (isFailedResponse(res)) {
            (res as unknown[]).forEach((response: unknown) => {
              if (isFailedResponse(response)) {
                notifyToast('error', errorMessages(response)[0]);
              }
            });

            // If there are any failures (network, etc.), then we'll need a way to recover the playlist.
            // Write the localPlaylistData to a file so we can re-run the save command.
            createRecoveryFile(data.id, 'playlist', playlistData);
            setNeedsRecovery(true);
            return dispatch(removeProcessingPlaylist(data.id));
          }

          if (recovery) {
            // If the recovery succeeds, we can remove the recovery file
            await recoveryBridge.remove(recoveryPath);
            setNeedsRecovery(false);
            notifyToast('success', t('Recovered playlist from backup'));
          } else {
            notifyToast('success', t('Saved playlist'));
          }

          await queryClient.refetchQueries({ queryKey: ['playlist'], type: 'active' });
        }
      } catch {
        notifyToast('error', t('Errored while saving playlist'));
        // The original's `fs.readFileSync` would throw uncaught here if the recovery
        // file were missing (a latent crash this catch block had no handler for) --
        // falling back to the live playlist data on a null read closes that path as
        // a natural consequence of `recovery.read`'s null-on-ENOENT contract, without
        // changing the happy-path (file present) behavior at all.
        try {
          const recoveryRaw = recovery ? await recoveryBridge.read(recoveryPath) : null;
          const playlistData =
            recovery && recoveryRaw !== null
              ? JSON.parse(recoveryRaw)
              : playlist[getCurrentEntryList(playlist)];

          createRecoveryFile(data.id, 'playlist', playlistData);
          setNeedsRecovery(true);
        } catch (recoveryErr) {
          // eslint-disable-next-line no-console
          console.error(recoveryErr);
        } finally {
          dispatch(removeProcessingPlaylist(data.id));
        }
      }
    }

    if (config.serverType === Server.Jellyfin) {
      try {
        const result = await apiController({
          serverType: config.serverType,
          endpoint: 'updatePlaylistSongs',
          args: { name: data.title, entry: playlist[getCurrentEntryList(playlist)] },
        });
        const newPlaylistId = result?.id;

        if (newPlaylistId) {
          await apiController({
            serverType: config.serverType,
            endpoint: 'deletePlaylist',
            args: { id: data.id },
          });

          await apiController({
            serverType: config.serverType,
            endpoint: 'updatePlaylist',
            args: {
              id: newPlaylistId,
              name: data.title,
              dateCreated: data.created,
              comment: data.comment,
              genres: data.genres,
            },
          });

          navigate(`/playlist/${newPlaylistId}`);
          notifyToast('success', t('Saved playlist'));
        } else {
          notifyToast('error', t('Error saving playlist'));
        }
      } catch {
        notifyToast('error', t('Error saving playlist'));
      }
    }

    dispatch(setPlaylistData(playlist[getCurrentEntryList(playlist)]));
    return dispatch(removeProcessingPlaylist(data.id));
  };

  const handleEdit = async () => {
    setIsSubmittingEdit(true);

    if (config.serverType === Server.Subsonic) {
      try {
        const res = await apiController({
          serverType: config.serverType,
          endpoint: 'updatePlaylist',
          args:
            config.serverType === Server.Subsonic
              ? {
                  id: data.id,
                  name: editName,
                  comment: editDescription,
                  genres: data.genres,
                  isPublic: editPublic,
                }
              : null,
        });

        if (isFailedResponse(res)) {
          notifyToast('error', errorMessages(res)[0]);
        } else {
          queryClient.setQueryData(['playlist', playlistId], (oldData: Playlist | undefined) => {
            return { ...oldData, title: editName, comment: editDescription, public: editPublic };
          });
        }
      } catch {
        notifyToast('error', t('Error saving playlist'));
      } finally {
        setIsSubmittingEdit(false);
      }
    }

    if (config.serverType === Server.Jellyfin) {
      try {
        await apiController({
          serverType: config.serverType,
          endpoint: 'updatePlaylist',
          args: {
            id: data.id,
            name: editName,
            comment: editDescription,
            genres: data.genres,
            isPublic: editPublic,
          },
        });
        notifyToast('success', t('Saved playlist'));
        queryClient.setQueryData(['playlist', playlistId], (oldData: Playlist | undefined) => {
          return { ...oldData, title: editName, comment: editDescription, public: editPublic };
        });
      } catch {
        notifyToast('error', t('Error saving playlist'));
      } finally {
        setIsSubmittingEdit(false);
      }
    }

    editTriggerRef.current?.close();
  };

  const handleDelete = async () => {
    try {
      const res = await apiController({
        serverType: config.serverType,
        endpoint: 'deletePlaylist',
        args: { id: data.id },
      });

      if (isFailedResponse(res)) {
        notifyToast('error', res.error.message);
      } else {
        navigate('/playlist');
      }
    } catch (err) {
      notifyToast('error', err);
    }
  };

  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();

  useEffect(() => {
    if (data?.image?.match('placeholder')) {
      const uniqueAlbums = _.uniqBy(data?.song ?? [], 'albumId') as unknown as Song[];

      if (uniqueAlbums.length === 0) {
        setCustomPlaylistImage('img/placeholder.png');
      } // If less than 4 images, we'll just set a single random image
      else if (uniqueAlbums.length > 0 && uniqueAlbums.length < 4) {
        setCustomPlaylistImage(uniqueAlbums[_.random(0, uniqueAlbums.length - 1)]?.image);
      } else if (uniqueAlbums.length >= 4) {
        const randomUniqueNumbers = getUniqueRandomNumberArr(4, uniqueAlbums.length);
        const randomAlbumImages = randomUniqueNumbers.map((num) => uniqueAlbums[num].image);

        setCustomPlaylistImage(randomAlbumImages);
      }
    }
  }, [data?.image, data?.song]);

  if (isLoading) {
    return <CenterLoader />;
  }

  if (isError) {
    return (
      <span>
        {t('Error')}: {error?.message}
      </span>
    );
  }

  // Offline (FIX A): see AlbumView.tsx for the full rationale -- effectiveOffline
  // forces isLoading/isError to false above regardless of whether the playlist
  // was actually found in the local playlistsSnapshot. Without this guard the
  // JSX below dereferences `data.xxx` unconditionally and crashes.
  if (!data) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
        {t('Playlist not found.')}
      </div>
    );
  }

  return (
    <>
      <GenericPage
        hideDivider
        header={
          <GenericPageHeader
            image={
              <Card
                title={t('None')}
                subtitle=""
                coverArt={
                  data?.image?.match('placeholder')
                    ? customPlaylistImage
                    : isPlaylistImageCached
                      ? playlistImagePath
                      : data?.image
                }
                size={185}
                hasHoverButtons
                noInfoPanel
                noModalButton
                details={data}
                playClick={{ type: 'playlist', id: data.id }}
                url={`/playlist/${data.id}`}
              />
            }
            cacheImages={{
              enabled: settings.get('cacheImages') ?? false,
              cacheType: 'playlist',
              id: data.id,
            }}
            imageHeight={185}
            title={data.title}
            subtitle={
              <div>
                <PageHeaderSubtitleDataLine $top>
                  <StyledLink onClick={() => navigate('/playlist')}>
                    <strong>{t('Playlist')}</strong>
                  </StyledLink>{' '}
                  • {data.songCount} songs, {formatDuration(data.duration)} •{' '}
                  {data.public ? t('Public') : t('Private')}
                </PageHeaderSubtitleDataLine>
                <PageHeaderSubtitleDataLine>
                  {data.owner && t('By {{dataOwner}} • ', { dataOwner: data.owner })}
                  {data.created &&
                    t('Created {{val, datetime}}', { val: formatDate(data.created) })}
                  {data.changed &&
                    t(' • Modified {{val, datetime}}', { val: formatDateTime(data.changed) })}
                </PageHeaderSubtitleDataLine>
                {data.comment && (
                  <CustomTooltip
                    text={data.comment}
                    placement="bottomStart"
                    disabled={!data.comment}
                  >
                    <PageHeaderSubtitleDataLine
                      style={{
                        minHeight: '1.2rem',
                        maxHeight: '1.2rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <span>{data.comment ? data.comment : ''}</span>
                    </PageHeaderSubtitleDataLine>
                  </CustomTooltip>
                )}
                <div style={{ marginTop: '10px' }}>
                  <ButtonToolbar>
                    <PlayButton
                      appearance="primary"
                      size="lg"
                      $circle
                      onClick={() =>
                        handlePlayQueueAdd({
                          byData: playlist[getCurrentEntryList(playlist)],
                          play: Play.Play,
                        })
                      }
                      disabled={playlist.entry?.length < 1}
                    />
                    <PlayAppendNextButton
                      appearance="subtle"
                      size="md"
                      onClick={() =>
                        handlePlayQueueAdd({
                          byData: playlist[getCurrentEntryList(playlist)],
                          play: Play.Next,
                        })
                      }
                      disabled={playlist.entry?.length < 1}
                    />
                    <PlayAppendButton
                      appearance="subtle"
                      size="md"
                      onClick={() =>
                        handlePlayQueueAdd({
                          byData: playlist[getCurrentEntryList(playlist)],
                          play: Play.Later,
                        })
                      }
                      disabled={playlist.entry?.length < 1}
                    />
                    <SaveButton
                      data-testid="playlist-save-button"
                      size="md"
                      appearance="subtle"
                      text={
                        needsRecovery
                          ? t('Recover playlist')
                          : t(
                              'Save (WARNING: Closing the application while saving may result in data loss)'
                            )
                      }
                      color={needsRecovery ? 'red' : undefined}
                      disabled={
                        (!needsRecovery && !isModified) ||
                        misc.isProcessingPlaylist.includes(data?.id)
                      }
                      loading={misc.isProcessingPlaylist.includes(data?.id)}
                      onClick={() => handleSave(needsRecovery)}
                    />
                    <UndoButton
                      size="md"
                      appearance="subtle"
                      color={needsRecovery ? 'red' : undefined}
                      disabled={
                        needsRecovery || !isModified || misc.isProcessingPlaylist.includes(data?.id)
                      }
                      onClick={() => dispatch(setPlaylistData(data?.song))}
                    />
                    <Whisper
                      ref={editTriggerRef}
                      enterable
                      placement="auto"
                      trigger="click"
                      speaker={
                        <Popup>
                          <Form>
                            <Form.ControlLabel>{t('Name')}</Form.ControlLabel>
                            <StyledInput
                              data-testid="edit-playlist-name-input"
                              placeholder={t('Name')}
                              value={editName}
                              onChange={(e: string) => setEditName(e)}
                            />
                            <Form.ControlLabel>{t('Description')}</Form.ControlLabel>
                            <StyledInput
                              data-testid="edit-playlist-description-input"
                              placeholder={t('Description')}
                              value={editDescription}
                              onChange={(e: string) => setEditDescription(e)}
                            />
                            <StyledCheckbox
                              data-testid="edit-playlist-public-checkbox"
                              checked={editPublic}
                              onChange={(_v: unknown, e: boolean) => setEditPublic(e)}
                              disabled={config.serverType === Server.Jellyfin}
                            >
                              {t('Public')}
                            </StyledCheckbox>
                            <StyledButton
                              data-testid="edit-playlist-save-button"
                              size="md"
                              type="submit"
                              block
                              loading={isSubmittingEdit}
                              disabled={isSubmittingEdit}
                              onClick={handleEdit}
                              appearance="primary"
                            >
                              {t('Save')}
                            </StyledButton>
                          </Form>
                        </Popup>
                      }
                    >
                      <EditButton
                        data-testid="edit-playlist-button"
                        size="md"
                        appearance="subtle"
                        disabled={misc.isProcessingPlaylist.includes(data?.id)}
                      />
                    </Whisper>
                    <DownloadButton
                      data-testid="download-action-download"
                      size="lg"
                      appearance="subtle"
                      downloadSize={getAlbumSize(data.song)}
                      loading={downloadProgress.inProgress}
                      disabled={effectiveOffline || downloadProgress.inProgress}
                      onClick={handleOfflineDownload}
                    />
                    <RemoveFromOfflineButton
                      data-testid="download-action-remove-offline"
                      size="lg"
                      appearance="subtle"
                      disabled={downloadProgress.inProgress}
                      onClick={handleOfflineDelete}
                    />
                    <CopyToClipboardButton
                      data-testid="download-action-copy"
                      size="lg"
                      appearance="subtle"
                      onClick={() => requestCopyConfirmation(() => handleDownload(data, true))}
                    />
                    {showDeleteConfirm ? (
                      <>
                        <StyledButton
                          data-testid="delete-playlist-confirm-yes"
                          size="sm"
                          appearance="primary"
                          onClick={handleDelete}
                        >
                          {t('Yes')}
                        </StyledButton>
                        <StyledButton
                          size="sm"
                          appearance="subtle"
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          {t('No')}
                        </StyledButton>
                      </>
                    ) : (
                      <DeleteButton
                        data-testid="delete-playlist-button"
                        size="md"
                        appearance="subtle"
                        disabled={misc.isProcessingPlaylist.includes(data?.id)}
                        onClick={() => setShowDeleteConfirm(true)}
                      />
                    )}
                  </ButtonToolbar>
                </div>
              </div>
            }
          />
        }
      >
        <ListViewType
          ref={tableRef}
          data={misc.searchQuery !== '' ? filteredData : playlist[getCurrentEntryList(playlist)]}
          tableColumns={config.lookAndFeel.listView.music.columns}
          handleRowClick={handleRowClick}
          handleRowDoubleClick={handleRowDoubleClick}
          handleDragEnd={handleDragEnd}
          virtualized
          rowHeight={config.lookAndFeel.listView.music.rowHeight}
          fontSize={config.lookAndFeel.listView.music.fontSize}
          cacheImages={{
            enabled: settings.get('cacheImages'),
            cacheType: 'album',
            cacheIdProperty: 'albumId',
          }}
          listType="music"
          playlist
          dnd
          isModal={rest.isModal}
          disabledContextMenuOptions={['deletePlaylist', 'viewInModal']}
          handleFavorite={(rowData: RowDataType) =>
            handleFavorite(rowData, { queryKey: ['playlist', playlistId] })
          }
          handleRating={(rowData: RowDataType, rating: number) => handleRating(rowData, { rating })}
          loading={isLoading}
        />
      </GenericPage>
      {confirmCopyModal}
    </>
  );
};

export default PlaylistView;
