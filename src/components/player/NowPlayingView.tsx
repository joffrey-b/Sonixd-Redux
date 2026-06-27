import React, { useEffect, useRef, useState } from 'react';
import _ from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { ButtonToolbar, ButtonGroup, FlexboxGrid, Form, Whisper } from 'rsuite';
import PlayIcon from '@rsuite/icons/legacy/Play';
import PlusIcon from '@rsuite/icons/legacy/Plus';
import PlusCircleIcon from '@rsuite/icons/legacy/PlusCircle';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import useSearchQuery from '../../hooks/useSearchQuery';

const FILTER_PROPERTIES = ['title', 'artist', 'album', 'year', 'genre', 'path'];
import {
  fixPlayer2Index,
  clearPlayQueue,
  shuffleInPlace,
  toggleShuffle,
  removeFromPlayQueue,
  setPlayQueue,
  appendPlayQueue,
  moveUp,
  moveDown,
  setPlayerIndex,
} from '../../redux/playQueueSlice';
import { clearSelected } from '../../redux/multiSelectSlice';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import ListViewType, { ListViewHandle } from '../viewtypes/ListViewType';
import { setStatus } from '../../redux/playerSlice';
import {
  AutoPlaylistButton,
  ClearQueueButton,
  MoveBottomButton,
  MoveTopButton,
  RemoveSelectedButton,
  ShuffleButton,
} from '../shared/ToolbarButtons';
import {
  StyledButton,
  StyledInputNumber,
  StyledInputPicker,
  StyledInputPickerContainer,
  StyledTag,
} from '../shared/styled';
import {
  errorMessages,
  filterPlayQueue,
  getCurrentEntryList,
  getPlayedSongsNotification,
  isFailedResponse,
} from '../../shared/utils';
import { notifyToast } from '../shared/toast';
import { apiController } from '../../api/controller';
import { Genre, Server, Song } from '../../types';
import type { RowDataType } from 'rsuite-table';
import type { WhisperInstance } from 'rsuite/Whisper';
import CenterLoader from '../loader/CenterLoader';
import useListClickHandler from '../../hooks/useListClickHandler';
import Popup from '../shared/Popup';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';
import { settings } from '../shared/bridge';

interface GenreItem {
  title: string;
  id: string;
  role: string;
}

const NowPlayingView = () => {
  const { t } = useTranslation();
  const tableRef = useRef<ListViewHandle | null>(null);
  const genrePickerContainerRef = useRef(null);
  const musicFolderPickerContainerRef = useRef(null);
  const autoPlaylistTriggerRef = useRef<WhisperInstance | null>(null);
  const dispatch = useAppDispatch();
  const isJukebox = useAppSelector((state) => state.jukebox?.enabled ?? false);
  const jukeboxPlaying = useAppSelector((state) => state.jukebox?.status?.playing ?? false);
  const playQueue = useAppSelector((state) => state.playQueue);
  const multiSelect = useAppSelector((state) => state.multiSelect);
  const config = useAppSelector((state) => state.config);
  const folder = useAppSelector((state) => state.folder);
  const misc = useAppSelector((state) => state.misc);
  const [autoPlaylistTrackCount, setRandomPlaylistTrackCount] = useState(
    Number(settings.get('randomPlaylistTrackCount'))
  );
  const [autoPlaylistFromYear, setRandomPlaylistFromYear] = useState(0);
  const [autoPlaylistToYear, setRandomPlaylistToYear] = useState(0);
  const [randomPlaylistGenre, setRandomPlaylistGenre] = useState<string | undefined>(undefined);
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);
  const [musicFolder, setMusicFolder] = useState(folder.musicFolder);

  const { data: musicFolders } = useQuery({
    queryKey: ['musicFolders'],
    queryFn: () => apiController({ serverType: config.serverType, endpoint: 'getMusicFolders' }),
  });

  const filteredData = useSearchQuery(misc.searchQuery, playQueue.entry, FILTER_PROPERTIES);

  const { data: genres } = useQuery<GenreItem[]>({
    queryKey: ['genreList'],
    queryFn: async () => {
      const res = await apiController({
        serverType: config.serverType,
        endpoint: 'getGenres',
        args: { musicFolderId: folder.musicFolder },
      });
      const genresOrderedBySongCount = _.orderBy(res as Genre[], 'songCount', 'desc');
      return genresOrderedBySongCount.map((genre: Genre) => {
        return {
          title: `${genre.title} ${genre.albumCount ? `(${genre.albumCount})` : ''}`,
          id: genre.title,
          role: 'Genre',
        };
      });
    },
  });

  useHotkeys(
    config.hotkeys.removeSelected,
    () => {
      if (multiSelect.selected.length === playQueue.entry.length) {
        // Clear the queue instead of removing individually
        dispatch(clearPlayQueue());
        dispatch(clearSelected());
        dispatch(setStatus('PAUSED'));
      } else {
        dispatch(removeFromPlayQueue({ entries: multiSelect.selected as unknown as Song[] }));
        dispatch(clearSelected());
        if (playQueue.currentPlayer === 1) {
          dispatch(fixPlayer2Index());
        }
      }
    },
    { preventDefault: true },
    [multiSelect.selected, config.hotkeys.removeSelected]
  );

  useEffect(() => {
    setTimeout(() => {
      const rowHeight = Number(settings.get('musicListRowHeight'));
      tableRef?.current?.table.current?.scrollTop(
        rowHeight * playQueue.currentIndex - rowHeight > 0
          ? rowHeight * playQueue.currentIndex - rowHeight
          : 0
      );
    }, 100);
  }, [playQueue.currentIndex, tableRef]);

  const { handleRowClick, handleRowDoubleClick, handleDragEnd } = useListClickHandler({
    dnd: 'playQueue',
    doubleClick: isJukebox
      ? async (rowData: { uniqueId: string }) => {
          dispatch(setPlayerIndex(rowData as unknown as Song));
          dispatch(fixPlayer2Index());
          dispatch(setStatus('PLAYING'));
          const entryList = getCurrentEntryList(playQueue);
          const songs = playQueue[entryList] as Song[];
          const index = songs.findIndex((s: Song) => s.uniqueId === rowData.uniqueId);
          if (index < 0) return;
          if (jukeboxPlaying) {
            await apiController({
              serverType: config.serverType,
              endpoint: 'jukeboxControl',
              args: { action: 'skip', index, offset: 0 },
            });
          } else {
            const ids = songs.map((s: Song) => s.id);
            await apiController({
              serverType: config.serverType,
              endpoint: 'jukeboxControl',
              args: { action: 'set', id: ids },
            });
            await apiController({
              serverType: config.serverType,
              endpoint: 'jukeboxControl',
              args: { action: 'start' },
            });
            if (index > 0) {
              await apiController({
                serverType: config.serverType,
                endpoint: 'jukeboxControl',
                args: { action: 'skip', index, offset: 0 },
              });
            }
          }
        }
      : undefined,
  });

  const handlePlayRandom = async (action: 'play' | 'addNext' | 'addLater') => {
    setIsLoadingRandom(true);
    const res: Song[] = await apiController({
      serverType: config.serverType,
      endpoint: 'getRandomSongs',
      args: {
        size: autoPlaylistTrackCount,
        fromYear: autoPlaylistFromYear !== 0 ? autoPlaylistFromYear : undefined,
        toYear: autoPlaylistToYear !== 0 ? autoPlaylistToYear : undefined,
        genre: randomPlaylistGenre,
        musicFolderId: musicFolder,
      },
    });

    if (isFailedResponse(res)) {
      autoPlaylistTriggerRef.current?.close();
      return notifyToast('error', errorMessages(res)[0]);
    }

    const cleanedSongs = filterPlayQueue(
      config.playback.filters,
      res.filter((song: Song) => {
        // Remove invalid songs that may break the player
        return song.bitRate && song.duration;
      })
    );

    if (cleanedSongs.entries.length > 0) {
      if (action === 'play') {
        if (cleanedSongs.entries.length > 0) {
          dispatch(setPlayQueue({ entries: cleanedSongs.entries }));
          dispatch(setStatus('PLAYING'));
          dispatch(fixPlayer2Index());
        } else {
          dispatch(clearPlayQueue());
          dispatch(setStatus('PAUSED'));
        }

        notifyToast(
          'info',
          getPlayedSongsNotification({
            original: res.length,
            filtered: cleanedSongs.count.filtered,
            type: 'play',
          })
        );
      } else if (action === 'addLater') {
        if (cleanedSongs.entries.length > 0) {
          dispatch(appendPlayQueue({ entries: cleanedSongs.entries, type: 'later' }));
          dispatch(fixPlayer2Index());
        }

        notifyToast(
          'info',
          getPlayedSongsNotification({
            original: res.length,
            filtered: cleanedSongs.count.filtered,
            type: 'add',
          })
        );
      } else {
        if (cleanedSongs.entries.length > 0) {
          dispatch(appendPlayQueue({ entries: cleanedSongs.entries, type: 'next' }));
          dispatch(fixPlayer2Index());
        }

        notifyToast(
          'info',
          getPlayedSongsNotification({
            original: res.length,
            filtered: cleanedSongs.count.filtered,
            type: 'add',
          })
        );
      }
      dispatch(fixPlayer2Index());
      setIsLoadingRandom(false);
      return autoPlaylistTriggerRef.current?.close();
    }
    setIsLoadingRandom(false);
    return notifyToast('warning', t('No songs found, adjust your filters'));
  };

  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();

  return (
    <>
      <GenericPage
        hideDivider
        header={
          <GenericPageHeader
            title={
              <>
                {t('Now Playing')}{' '}
                <StyledTag style={{ verticalAlign: 'middle', cursor: 'default' }}>
                  {playQueue.entry?.length || '...'}
                </StyledTag>
              </>
            }
            subtitle={
              <>
                <ButtonToolbar>
                  <ClearQueueButton
                    size="sm"
                    onClick={() => {
                      dispatch(clearPlayQueue());
                      dispatch(setStatus('PAUSED'));
                      // Needs a timeout otherwise the seek may still update after the pause due to
                      // the delay timeout
                    }}
                  />
                  <ShuffleButton
                    size="sm"
                    onClick={() => {
                      if (playQueue.shuffle) {
                        dispatch(shuffleInPlace());
                      } else {
                        dispatch(toggleShuffle());
                      }
                    }}
                  />
                  <Whisper
                    ref={autoPlaylistTriggerRef}
                    placement="autoVertical"
                    trigger="click"
                    enterable
                    speaker={
                      <Popup>
                        <Form.ControlLabel>{`${t('How many tracks?')} ${
                          config.serverType === Server.Subsonic ? '(1 - 500)*' : '(1 - ∞)'
                        }`}</Form.ControlLabel>
                        <StyledInputNumber
                          min={1}
                          max={config.serverType === Server.Subsonic ? 500 : undefined}
                          step={10}
                          defaultValue={autoPlaylistTrackCount}
                          value={autoPlaylistTrackCount}
                          onChange={(e: number) => {
                            settings.set('randomPlaylistTrackCount', Number(e));
                            setRandomPlaylistTrackCount(Number(e));
                          }}
                        />
                        <br />
                        <FlexboxGrid justify="space-between">
                          <FlexboxGrid.Item>
                            <Form.ControlLabel>{t('From year')}</Form.ControlLabel>
                            <div>
                              <StyledInputNumber
                                $width={100}
                                min={0}
                                max={3000}
                                step={1}
                                defaultValue={autoPlaylistFromYear}
                                value={autoPlaylistFromYear}
                                onChange={(e: number) => {
                                  setRandomPlaylistFromYear(Number(e));
                                }}
                              />
                            </div>
                          </FlexboxGrid.Item>
                          <FlexboxGrid.Item>
                            <Form.ControlLabel>{t('To year')}</Form.ControlLabel>
                            <div>
                              <StyledInputNumber
                                $width={100}
                                min={0}
                                max={3000}
                                step={1}
                                defaultValue={autoPlaylistToYear}
                                value={autoPlaylistToYear}
                                onChange={(e: number) => setRandomPlaylistToYear(Number(e))}
                              />
                            </div>
                          </FlexboxGrid.Item>
                        </FlexboxGrid>
                        <br />
                        <StyledInputPickerContainer ref={genrePickerContainerRef}>
                          <Form.ControlLabel>{t('Genre')}</Form.ControlLabel>
                          <br />
                          <StyledInputPicker
                            style={{ width: '100%' }}
                            container={() => genrePickerContainerRef.current}
                            data={genres}
                            value={randomPlaylistGenre}
                            valueKey="id"
                            labelKey="title"
                            virtualized
                            placeholder={t('Select')}
                            onChange={(e: string) => setRandomPlaylistGenre(e)}
                          />
                        </StyledInputPickerContainer>
                        <br />
                        <StyledInputPickerContainer ref={musicFolderPickerContainerRef}>
                          <Form.ControlLabel>{t('Music folder')}</Form.ControlLabel>
                          <br />
                          <StyledInputPicker
                            style={{ width: '100%' }}
                            container={() => musicFolderPickerContainerRef.current}
                            data={musicFolders}
                            defaultValue={musicFolder}
                            valueKey="id"
                            labelKey="title"
                            placeholder={t('Select')}
                            onChange={(e: string) => {
                              setMusicFolder(e);
                            }}
                          />
                        </StyledInputPickerContainer>
                        <br />
                        <StyledButton
                          appearance="subtle"
                          onClick={() => handlePlayRandom('addNext')}
                          loading={isLoadingRandom}
                          disabled={!(typeof autoPlaylistTrackCount === 'number')}
                          style={{ width: '50%' }}
                        >
                          <PlusCircleIcon style={{ marginRight: '10px' }} />
                          {t('Add (next)')}
                        </StyledButton>
                        <StyledButton
                          appearance="subtle"
                          onClick={() => handlePlayRandom('addLater')}
                          loading={isLoadingRandom}
                          disabled={!(typeof autoPlaylistTrackCount === 'number')}
                          style={{ width: '50%' }}
                        >
                          <PlusIcon style={{ marginRight: '10px' }} />
                          {t('Add (later)')}
                        </StyledButton>
                        <StyledButton
                          block
                          appearance="primary"
                          onClick={() => handlePlayRandom('play')}
                          loading={isLoadingRandom}
                          disabled={!(typeof autoPlaylistTrackCount === 'number')}
                        >
                          <PlayIcon style={{ marginRight: '10px' }} />
                          {t('Play')}
                        </StyledButton>
                      </Popup>
                    }
                  >
                    <AutoPlaylistButton size="sm" />
                  </Whisper>
                  <ButtonGroup>
                    <MoveTopButton
                      size="sm"
                      appearance="subtle"
                      onClick={() => {
                        dispatch(
                          moveUp({ selectedEntries: multiSelect.selected as unknown as Song[] })
                        );
                        if (playQueue.currentPlayer === 1) {
                          dispatch(fixPlayer2Index());
                        }
                      }}
                    />
                    <MoveBottomButton
                      size="sm"
                      appearance="subtle"
                      onClick={() => {
                        dispatch(
                          moveDown({ selectedEntries: multiSelect.selected as unknown as Song[] })
                        );
                        if (playQueue.currentPlayer === 1) {
                          dispatch(fixPlayer2Index());
                        }
                      }}
                    />
                    <RemoveSelectedButton
                      size="sm"
                      appearance="subtle"
                      onClick={() => {
                        if (multiSelect.selected.length === playQueue.entry.length) {
                          dispatch(clearPlayQueue());
                          dispatch(setStatus('PAUSED'));
                        } else {
                          dispatch(
                            removeFromPlayQueue({
                              entries: multiSelect.selected as unknown as Song[],
                            })
                          );
                          dispatch(clearSelected());
                          if (playQueue.currentPlayer === 1) {
                            dispatch(fixPlayer2Index());
                          }
                        }
                      }}
                    />
                  </ButtonGroup>
                </ButtonToolbar>
              </>
            }
            subsidetitle={<></>}
          />
        }
      >
        {!playQueue ? (
          <CenterLoader />
        ) : (
          <ListViewType
            ref={tableRef}
            data={
              misc.searchQuery !== '' ? filteredData : playQueue[getCurrentEntryList(playQueue)]
            }
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
            nowPlaying
            dnd
            disabledContextMenuOptions={['deletePlaylist', 'viewInModal']}
            initialScrollOffset={0}
            handleFavorite={handleFavorite}
            handleRating={(rowData: RowDataType, rating: number) =>
              handleRating(rowData, { rating })
            }
            onScroll={(scrollIndex: number) => {
              localStorage.setItem('scroll_list_nowPlaying', String(Math.abs(scrollIndex)));
            }}
          />
        )}
      </GenericPage>
    </>
  );
};

export default NowPlayingView;
