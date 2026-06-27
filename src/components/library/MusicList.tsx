import React, { useEffect, useRef, useState } from 'react';
import { ButtonToolbar } from 'rsuite';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { RowDataType } from 'rsuite-table';
import ListViewType, { ListViewHandle } from '../viewtypes/ListViewType';
import useSearchQuery from '../../hooks/useSearchQuery';
import GenericPageHeader from '../layout/GenericPageHeader';
import GenericPage from '../layout/GenericPage';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { StyledInputPicker, StyledInputPickerContainer, StyledTag } from '../shared/styled';
import { RefreshButton } from '../shared/ToolbarButtons';
import { setSearchQuery } from '../../redux/miscSlice';
import { apiController } from '../../api/controller';
import { Item } from '../../types';
import useColumnSort from '../../hooks/useColumnSort';
import { fixPlayer2Index, setPlayQueueByRowClick } from '../../redux/playQueueSlice';
import { setFilter, setPagination } from '../../redux/viewSlice';
import { setStatus } from '../../redux/playerSlice';
import useListScroll from '../../hooks/useListScroll';
import useListClickHandler from '../../hooks/useListClickHandler';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';
import { settings } from '../shared/bridge';

// prettier-ignore
export const getMusicSortTypes = (t: TFunction) => [
  { label: t('A-Z (Name)'), value: 'alphabeticalByName', role: t('Default') },
  { label: t('A-Z (Album)'), value: 'alphabeticalByAlbum', role: t('Default') },
  { label: t('A-Z (Album Artist)'), value: 'alphabeticalByArtist', role: t('Default') },
  { label: t('A-Z (Artist)'), value: 'alphabeticalByTrackArtist', replacement: 'Artist' },
  { label: t('Most Played'), value: 'frequent', role: t('Default') },
  { label: t('Random'), value: 'random', role: t('Default') },
  { label: t('Recently Added'), value: 'newest', role: t('Default') },
  { label: t('Recently Played'), value: 'recent', role: t('Default') },
  { label: t('Release Date'), value: 'year', role: t('Default') },
];

const MusicList = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const folder = useAppSelector((state) => state.folder);
  const config = useAppSelector((state) => state.config);
  const misc = useAppSelector((state) => state.misc);
  const view = useAppSelector((state) => state.view);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortTypes, setSortTypes] = useState<ReturnType<typeof getMusicSortTypes>>([]);
  const [musicFolder, setMusicFolder] = useState<{ loaded: boolean; id: string | undefined }>({
    loaded: false,
    id: undefined,
  });
  const musicFilterPickerContainerRef = useRef(null);
  const [currentQueryKey, setCurrentQueryKey] = useState<unknown[]>(['musicList']);

  const listRef = useRef<ListViewHandle | null>(null);
  const { listScroll } = useListScroll(listRef);

  useEffect(() => {
    if (folder.applied.music) {
      setMusicFolder({ loaded: true, id: folder.musicFolder });
    } else {
      setMusicFolder({ loaded: true, id: undefined });
    }
  }, [folder.applied.music, folder.musicFolder]);

  useEffect(() => {
    if (!view.music.pagination.serverSide) {
      // Client-side paging won't require a separate key for the active page
      setCurrentQueryKey(['musicList', view.music.filter, musicFolder.id]);
    } else {
      setCurrentQueryKey(['musicList', view.music.filter, view.music.pagination, musicFolder.id]);
    }
  }, [musicFolder.id, view.music.filter, view.music.pagination]);

  const {
    isLoading,
    isError,
    data: songs,
    error,
  } = useQuery({
    queryKey: currentQueryKey,
    queryFn: () =>
      view.music.filter === 'random' ||
      (view.music.pagination.recordsPerPage !== 0 && view.music.pagination.serverSide)
        ? apiController({
            serverType: config.serverType,
            endpoint: 'getSongs',
            args: {
              type: view.music.filter,
              size:
                view.music.pagination.recordsPerPage === 0
                  ? 100
                  : view.music.pagination.recordsPerPage,
              offset: (view.music.pagination.activePage - 1) * view.music.pagination.recordsPerPage,
              recursive: false,
              musicFolderId: musicFolder.id,
              order: [
                'alphabeticalByName',
                'alphabeticalByAlbum',
                'alphabeticalByArtist',
                'alphabeticalByTrackArtist',
                'newest',
              ].includes(view.music.filter)
                ? 'asc'
                : 'desc',
            },
          })
        : apiController({
            serverType: config.serverType,
            endpoint: 'getSongs',
            args: {
              type: view.music.filter,
              recursive: true,
              musicFolderId: musicFolder.id,
            },
          }),
    // Due to extensive fetch times without pagination, we want to cache for the entire session
    gcTime: view.music.pagination.recordsPerPage !== 0 ? 600000 : Infinity,
    staleTime: view.music.pagination.recordsPerPage !== 0 ? 600000 : Infinity,
    enabled: musicFolder.loaded,
  });

  const searchedData = useSearchQuery(misc.searchQuery, songs?.data, [
    'title',
    'artist',
    'genre',
    'year',
  ]);

  const { sortedData } = useColumnSort(songs?.data, Item.Album, view.music.sort);

  useEffect(() => {
    setSortTypes(getMusicSortTypes(t));
  }, [t]);

  useEffect(() => {
    if (songs?.data && sortedData?.length) {
      const pages = Math.ceil(
        (view.music.pagination.serverSide && view.music.filter !== 'random'
          ? songs?.totalRecordCount
          : sortedData?.length) / view.music.pagination.recordsPerPage
      );

      if (pages && view.music.pagination.pages !== pages) {
        dispatch(
          setPagination({
            listType: Item.Music,
            data: {
              pages,
            },
          })
        );
      }
    }
  }, [
    dispatch,
    songs?.data,
    songs?.totalRecordCount,
    sortedData?.length,
    view.music.filter,
    view.music.pagination.pages,
    view.music.pagination.recordsPerPage,
    view.music.pagination.serverSide,
  ]);

  const { handleRowClick, handleRowDoubleClick } = useListClickHandler({
    doubleClick: (rowData: RowDataType) => {
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
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.removeQueries({ queryKey: ['musicList'], exact: false });
    setIsRefreshing(false);
  };

  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();

  return (
    <GenericPage
      hideDivider
      header={
        <GenericPageHeader
          title={
            <>
              {t('Songs')}{' '}
              <StyledTag style={{ verticalAlign: 'middle', cursor: 'default' }}>
                {songs?.totalRecordCount || '...'}
              </StyledTag>
            </>
          }
          subtitle={
            <>
              <StyledInputPickerContainer ref={musicFilterPickerContainerRef}>
                <ButtonToolbar>
                  <StyledInputPicker
                    container={() => musicFilterPickerContainerRef.current}
                    size="sm"
                    width={180}
                    defaultValue={view.music.filter}
                    value={view.music.filter}
                    data={sortTypes || getMusicSortTypes(t)}
                    cleanable={false}
                    placeholder={t('Sort Type')}
                    onChange={async (value: string) => {
                      setIsRefreshing(true);
                      await queryClient.cancelQueries({
                        queryKey: ['musicList', view.music.filter, musicFolder.id],
                      });
                      dispatch(setSearchQuery(''));
                      dispatch(setFilter({ listType: Item.Music, data: value }));
                      dispatch(setPagination({ listType: Item.Music, data: { activePage: 1 } }));
                      localStorage.setItem('scroll_list_musicList', '0');
                      setIsRefreshing(false);
                    }}
                  />
                  <RefreshButton onClick={handleRefresh} size="sm" loading={isRefreshing} />
                </ButtonToolbar>
              </StyledInputPickerContainer>
            </>
          }
        />
      }
    >
      {isError && <div>{(error as Error)?.message || 'Failed to load.'}</div>}
      {!isError && (
        <ListViewType
          ref={listRef}
          data={
            misc.searchQuery !== ''
              ? searchedData
              : view.music.pagination.recordsPerPage !== 0 && !view.music.pagination.serverSide
                ? sortedData?.slice(
                    (view.music.pagination.activePage - 1) * view.music.pagination.recordsPerPage,
                    view.music.pagination.activePage * view.music.pagination.recordsPerPage
                  )
                : sortedData
          }
          tableColumns={config.lookAndFeel.listView.music.columns}
          rowHeight={config.lookAndFeel.listView.music.rowHeight}
          fontSize={config.lookAndFeel.listView.music.fontSize}
          handleRowClick={handleRowClick}
          handleRowDoubleClick={handleRowDoubleClick}
          handleRating={(rowData: RowDataType, rating: number) =>
            handleRating(rowData, { queryKey: currentQueryKey, rating })
          }
          cacheImages={{
            enabled: settings.get('cacheImages'),
            cacheType: 'album',
            cacheIdProperty: 'albumId',
          }}
          page="musicListPage"
          listType="music"
          virtualized
          disabledContextMenuOptions={[
            'moveSelectedTo',
            'removeSelected',
            'deletePlaylist',
            'viewInModal',
            'viewInFolder',
          ]}
          loading={isLoading}
          handleFavorite={(rowData: RowDataType) =>
            handleFavorite(rowData, { queryKey: currentQueryKey })
          }
          initialScrollOffset={Number(localStorage.getItem('scroll_list_musicList'))}
          onScroll={(scrollIndex: number) => {
            localStorage.setItem('scroll_list_musicList', String(Math.abs(scrollIndex)));
          }}
          paginationProps={
            view.music.pagination.recordsPerPage !== 0 && {
              pages: view.music.pagination.pages,
              activePage: view.music.pagination.activePage,
              maxButtons: 3,
              prev: true,
              next: true,
              ellipsis: true,
              boundaryLinks: true,
              startIndex:
                view.music.pagination.recordsPerPage * (view.music.pagination.activePage - 1) + 1,
              endIndex: view.music.pagination.recordsPerPage * view.music.pagination.activePage,
              handleGoToButton: (e: number) => {
                localStorage.setItem('scroll_list_musicList', '0');
                dispatch(
                  setPagination({
                    listType: Item.Music,
                    data: {
                      activePage: e,
                    },
                  })
                );
              },
              onSelect: async (e: number) => {
                localStorage.setItem('scroll_list_musicList', '0');
                await queryClient.cancelQueries({ queryKey: ['musicList'], type: 'active' });
                dispatch(
                  setPagination({
                    listType: Item.Music,
                    data: {
                      activePage: e,
                    },
                  })
                );
                listScroll(0);
              },
            }
          }
        />
      )}
    </GenericPage>
  );
};

export default MusicList;
