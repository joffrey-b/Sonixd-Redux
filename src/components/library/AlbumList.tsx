import React, { useEffect, useRef, useState } from 'react';
import _ from 'lodash';
import { ButtonToolbar, Nav, Whisper } from 'rsuite';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import GridViewType from '../viewtypes/GridViewType';
import ListViewType, { ListViewHandle } from '../viewtypes/ListViewType';
import useSearchQuery from '../../hooks/useSearchQuery';
import GenericPageHeader from '../layout/GenericPageHeader';
import GenericPage from '../layout/GenericPage';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  StyledInputPicker,
  StyledInputPickerContainer,
  StyledNavItem,
  StyledTag,
} from '../shared/styled';
import { FilterButton, RefreshButton } from '../shared/ToolbarButtons';
import { setSearchQuery } from '../../redux/miscSlice';
import { apiController } from '../../api/controller';
import { Album, Genre, Item, Server } from '../../types';
import type { RowDataType } from 'rsuite-table';

interface AlbumSortType {
  label: string;
  value: string;
  role: string;
}

interface AlbumListData {
  data: Album[];
  totalRecordCount: number;
}

import AdvancedFilters from './AdvancedFilters';
import useAdvancedFilter from '../../hooks/useAdvancedFilter';
import ColumnSort from '../shared/ColumnSort';
import useColumnSort from '../../hooks/useColumnSort';
import { setFilter, setPagination, setAdvancedFilters, setColumnSort } from '../../redux/viewSlice';
import useGridScroll from '../../hooks/useGridScroll';
import useListScroll from '../../hooks/useListScroll';
import useListClickHandler from '../../hooks/useListClickHandler';
import Popup from '../shared/Popup';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';
import { settings } from '../shared/bridge';

export const getAlbumSortTypes = (t: TFunction) => [
  { label: t('A-Z (Name)'), value: 'alphabeticalByName', role: t('Default') },
  { label: t('A-Z (Artist)'), value: 'alphabeticalByArtist', role: t('Default') },
  { label: t('Most Played'), value: 'frequent', role: t('Default') },
  { label: t('Random'), value: 'random', role: t('Default') },
  { label: t('Recently Added'), value: 'newest', role: t('Default') },
  { label: t('Recently Played'), value: 'recent', role: t('Default') },
];

const AlbumList = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const folder = useAppSelector((state) => state.folder);
  const config = useAppSelector((state) => state.config);
  const misc = useAppSelector((state) => state.misc);
  const view = useAppSelector((state) => state.view);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortTypes, setSortTypes] = useState<AlbumSortType[]>([]);
  const [viewType, setViewType] = useState(settings.get('albumViewType') || 'list');
  const [musicFolder, setMusicFolder] = useState<{ loaded: boolean; id: string | undefined }>({
    loaded: false,
    id: undefined,
  });
  const albumFilterPickerContainerRef = useRef(null);
  const [currentQueryKey, setCurrentQueryKey] = useState<unknown[]>(['albumList']);

  const gridRef = useRef(null);
  const listRef = useRef<ListViewHandle | null>(null);
  const { gridScroll } = useGridScroll(gridRef);
  const { listScroll } = useListScroll(listRef);

  useEffect(() => {
    if (folder.applied.albums) {
      setMusicFolder({ loaded: true, id: folder.musicFolder });
    } else {
      setMusicFolder({ loaded: true, id: undefined });
    }
  }, [folder.applied.albums, folder.musicFolder]);

  useEffect(() => {
    if (config.serverType === Server.Subsonic || !view.album.pagination.serverSide) {
      // Client-side paging won't require a separate key for the active page
      setCurrentQueryKey(['albumList', view.album.filter, musicFolder.id]);
    } else {
      setCurrentQueryKey(['albumList', view.album.filter, view.album.pagination, musicFolder.id]);
    }
  }, [config.serverType, musicFolder.id, view.album.filter, view.album.pagination]);

  const {
    isLoading,
    isError,
    data: albums,
    error,
  } = useQuery<AlbumListData>({
    queryKey: currentQueryKey,
    queryFn: () =>
      view.album.filter === 'random' ||
      (view.album.pagination.recordsPerPage !== 0 && view.album.pagination.serverSide)
        ? apiController({
            serverType: config.serverType,
            endpoint: 'getAlbums',
            args:
              config.serverType === Server.Subsonic
                ? {
                    type: view.album.filter,
                    size: 500,
                    offset: 0,
                    musicFolderId: musicFolder.id,
                    recursive: view.album.filter !== 'random',
                  }
                : {
                    type: view.album.filter,
                    size:
                      view.album.pagination.recordsPerPage === 0
                        ? 100
                        : view.album.pagination.recordsPerPage,
                    offset:
                      (view.album.pagination.activePage - 1) * view.album.pagination.recordsPerPage,
                    recursive: false,
                    musicFolderId: musicFolder.id,
                  },
          })
        : apiController({
            serverType: config.serverType,
            endpoint: 'getAlbums',
            args:
              config.serverType === Server.Subsonic
                ? {
                    type: view.album.filter,
                    size: 500,
                    offset: 0,
                    musicFolderId: musicFolder.id,
                    recursive: true,
                  }
                : {
                    type: view.album.filter,
                    recursive: true,
                    musicFolderId: musicFolder.id,
                  },
          }),
    gcTime:
      view.album.pagination.recordsPerPage !== 0 && config.serverType === Server.Jellyfin
        ? 600000
        : Infinity,
    staleTime:
      view.album.pagination.recordsPerPage !== 0 && config.serverType === Server.Jellyfin
        ? 600000
        : Infinity,
    enabled: musicFolder.loaded,
  });

  const { data: genres } = useQuery<AlbumSortType[]>({
    queryKey: ['genreList'],
    queryFn: async () => {
      const res = await apiController({
        serverType: config.serverType,
        endpoint: 'getGenres',
        args: { musicFolderId: folder.musicFolder },
      });
      return _.compact(
        (res as Genre[]).map((genre: Genre) => {
          if (genre.albumCount !== 0) {
            return {
              label: `${genre.title}${genre.albumCount ? ` (${genre.albumCount})` : ''}`,
              value: genre.title,
              role: 'Genre',
            };
          }
          return null;
        })
      );
    },
  });

  const searchedData = useSearchQuery(misc.searchQuery, albums?.data ?? [], [
    'title',
    'artist',
    'genre',
    'year',
  ]);

  const { filteredData, byArtistData, byArtistBaseData, byGenreData, byStarredData, byYearData } =
    useAdvancedFilter(albums?.data ?? [], view.album.advancedFilters);

  const { sortColumns, sortedData } = useColumnSort(filteredData, Item.Album, view.album.sort);

  useEffect(() => {
    setSortTypes(_.compact(_.concat(getAlbumSortTypes(t), genres)));
  }, [genres, t]);

  useEffect(() => {
    if (albums?.data && sortedData?.length) {
      const pages = Math.ceil(
        (view.album.pagination.serverSide && config.serverType === Server.Jellyfin
          ? albums?.totalRecordCount
          : sortedData?.length) / view.album.pagination.recordsPerPage
      );

      if (pages && view.album.pagination.pages !== pages) {
        dispatch(
          setPagination({
            listType: Item.Album,
            data: {
              pages,
            },
          })
        );
      }
    }
  }, [albums, config.serverType, dispatch, sortedData?.length, view.album.pagination]);

  const { handleRowClick, handleRowDoubleClick } = useListClickHandler({
    doubleClick: (rowData: RowDataType) => navigate(`/library/album/${rowData.id as string}`),
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ['albumList'], type: 'active' });
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
              {t('Albums')}{' '}
              <StyledTag style={{ verticalAlign: 'middle', cursor: 'default' }}>
                {albums?.totalRecordCount || '...'}
              </StyledTag>
            </>
          }
          subtitle={
            <StyledInputPickerContainer ref={albumFilterPickerContainerRef}>
              <ButtonToolbar>
                <StyledInputPicker
                  container={() => albumFilterPickerContainerRef.current}
                  size="sm"
                  width={180}
                  defaultValue={view.album.filter}
                  value={view.album.filter}
                  groupBy="role"
                  data={sortTypes || getAlbumSortTypes(t)}
                  disabledItemValues={
                    config.serverType === Server.Jellyfin ? ['frequent', 'recent'] : []
                  }
                  cleanable={false}
                  placeholder={t('Sort Type')}
                  onChange={async (value: string) => {
                    await queryClient.cancelQueries({
                      queryKey: ['albumList', view.album.filter, musicFolder.id],
                    });
                    dispatch(setSearchQuery(''));
                    dispatch(setFilter({ listType: Item.Album, data: value }));
                    dispatch(setPagination({ listType: Item.Album, data: { activePage: 1 } }));
                    localStorage.setItem('scroll_grid_albumList', '0');
                    localStorage.setItem('scroll_list_albumList', '0');
                    gridScroll(0);
                    listScroll(0);
                  }}
                />
                <RefreshButton onClick={handleRefresh} size="sm" loading={isRefreshing} />
              </ButtonToolbar>
            </StyledInputPickerContainer>
          }
          sidetitle={
            <>
              <Whisper
                trigger="click"
                enterable
                placement="bottomEnd"
                preventOverflow
                speaker={
                  <Popup width="275px">
                    <Nav
                      activeKey={view.album.advancedFilters.nav}
                      onSelect={(e) =>
                        dispatch(
                          setAdvancedFilters({ listType: Item.Album, filter: 'nav', value: e })
                        )
                      }
                      justified
                      appearance="tabs"
                    >
                      <StyledNavItem eventKey="filters">{t('Filters')}</StyledNavItem>
                      <StyledNavItem eventKey="sort">{t('Sort')}</StyledNavItem>
                    </Nav>
                    <br />
                    {view.album.advancedFilters.nav === 'filters' && (
                      <AdvancedFilters
                        filteredData={{
                          filteredData,
                          byArtistData,
                          byArtistBaseData,
                          byGenreData,
                          byStarredData,
                          byYearData,
                        }}
                        originalData={albums?.data ?? []}
                        filter={view.album.advancedFilters}
                        setAdvancedFilters={setAdvancedFilters}
                      />
                    )}

                    {view.album.advancedFilters.nav === 'sort' && (
                      <ColumnSort
                        sortColumns={sortColumns}
                        sortColumn={view.album.sort.column}
                        sortType={view.album.sort.type}
                        disabledItemValues={
                          config.serverType === Server.Jellyfin ? ['playCount', 'userRating'] : []
                        }
                        clearSortType={() =>
                          dispatch(
                            setColumnSort({
                              listType: Item.Album,
                              data: {
                                ...view.album.sort,
                                column: undefined,
                              },
                            })
                          )
                        }
                        setSortType={(e: string) =>
                          dispatch(
                            setColumnSort({
                              listType: Item.Album,
                              data: { ...view.album.sort, type: e as 'asc' | 'desc' },
                            })
                          )
                        }
                        setSortColumn={(e: string) =>
                          dispatch(
                            setColumnSort({
                              listType: Item.Album,
                              data: { ...view.album.sort, column: e },
                            })
                          )
                        }
                      />
                    )}
                  </Popup>
                }
              >
                <FilterButton
                  data-testid="album-filter-button"
                  size="sm"
                  appearance={
                    view.album.advancedFilters.enabled || view.album.sort.column
                      ? 'primary'
                      : 'subtle'
                  }
                />
              </Whisper>
            </>
          }
          showViewTypeButtons
          viewTypeSetting="album"
          handleListClick={() => setViewType('list')}
          handleGridClick={() => setViewType('grid')}
        />
      }
    >
      {isError && <div>{(error as Error)?.message || 'Failed to load.'}</div>}
      {!isError && viewType === 'list' && (
        <ListViewType
          ref={listRef}
          data={
            misc.searchQuery !== ''
              ? searchedData
              : (config.serverType === Server.Subsonic || !view.album.pagination.serverSide) &&
                  view.album.pagination.recordsPerPage !== 0
                ? sortedData?.slice(
                    (view.album.pagination.activePage - 1) * view.album.pagination.recordsPerPage,
                    view.album.pagination.activePage * view.album.pagination.recordsPerPage
                  )
                : sortedData
          }
          tableColumns={config.lookAndFeel.listView.album.columns}
          rowHeight={config.lookAndFeel.listView.album.rowHeight}
          fontSize={config.lookAndFeel.listView.album.fontSize}
          handleRowClick={handleRowClick}
          handleRowDoubleClick={handleRowDoubleClick}
          handleRating={(rowData: RowDataType, rating: number) =>
            handleRating(rowData, {
              queryKey: ['albumList', view.album.filter, musicFolder.id],
              rating,
            })
          }
          cacheImages={{
            enabled: settings.get('cacheImages'),
            cacheType: 'album',
            cacheIdProperty: 'albumId',
          }}
          page="albumListPage"
          listType="album"
          virtualized
          disabledContextMenuOptions={[
            'moveSelectedTo',
            'removeSelected',
            'deletePlaylist',
            'viewInFolder',
          ]}
          loading={isLoading}
          handleFavorite={(rowData: RowDataType) =>
            handleFavorite(rowData, { queryKey: ['albumList', view.album.filter, musicFolder.id] })
          }
          initialScrollOffset={Number(localStorage.getItem('scroll_list_albumList'))}
          onScroll={(scrollIndex: number) => {
            localStorage.setItem('scroll_list_albumList', String(Math.abs(scrollIndex)));
          }}
          paginationProps={
            view.album.pagination.recordsPerPage !== 0 && {
              disabled: misc.searchQuery !== '' ? true : undefined,
              pages: view.album.pagination.pages,
              activePage: view.album.pagination.activePage,
              maxButtons: 3,
              prev: true,
              next: true,
              ellipsis: true,
              boundaryLinks: true,
              startIndex:
                view.album.pagination.recordsPerPage * (view.album.pagination.activePage - 1) + 1,
              endIndex: view.album.pagination.recordsPerPage * view.album.pagination.activePage,
              handleGoToButton: (e: number) => {
                localStorage.setItem('scroll_list_albumList', '0');
                dispatch(
                  setPagination({
                    listType: Item.Album,
                    data: {
                      activePage: e,
                    },
                  })
                );
              },
              onSelect: async (e: number) => {
                localStorage.setItem('scroll_list_albumList', '0');
                await queryClient.cancelQueries({ queryKey: ['albumList'], type: 'active' });
                dispatch(
                  setPagination({
                    listType: Item.Album,
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
      {!isError && viewType === 'grid' && (
        <GridViewType
          gridRef={gridRef}
          data={
            misc.searchQuery !== ''
              ? searchedData
              : (config.serverType === Server.Subsonic || !view.album.pagination.serverSide) &&
                  view.album.pagination.recordsPerPage !== 0
                ? sortedData?.slice(
                    (view.album.pagination.activePage - 1) * view.album.pagination.recordsPerPage,
                    view.album.pagination.activePage * view.album.pagination.recordsPerPage
                  )
                : sortedData
          }
          cardTitle={{
            prefix: '/library/album',
            property: 'title',
            urlProperty: 'albumId',
          }}
          cardSubtitle={{
            prefix: 'artist',
            property: 'albumArtist',
            urlProperty: 'albumArtistId',
            unit: '',
          }}
          playClick={{ type: 'album', idProperty: 'id' }}
          size={config.lookAndFeel.gridView.cardSize}
          cacheType="album"
          handleFavorite={(rowData: RowDataType) =>
            handleFavorite(rowData, { queryKey: ['albumList', view.album.filter, musicFolder.id] })
          }
          initialScrollOffset={Number(localStorage.getItem('scroll_grid_albumList'))}
          onScroll={(scrollIndex: number) => {
            localStorage.setItem('scroll_grid_albumList', String(scrollIndex));
          }}
          loading={isLoading}
          paginationProps={
            view.album.pagination.recordsPerPage !== 0 && {
              disabled: misc.searchQuery !== '' ? true : undefined,
              pages: view.album.pagination.pages,
              activePage: view.album.pagination.activePage,
              maxButtons: 3,
              prev: true,
              next: true,
              ellipsis: true,
              boundaryLinks: true,
              startIndex:
                view.album.pagination.recordsPerPage * (view.album.pagination.activePage - 1) + 1,
              endIndex: view.album.pagination.recordsPerPage * view.album.pagination.activePage,
              handleGoToButton: (e: number) => {
                localStorage.setItem('scroll_grid_albumList', '0');
                dispatch(
                  setPagination({
                    listType: Item.Album,
                    data: {
                      activePage: e,
                    },
                  })
                );
              },
              onSelect: async (e: number) => {
                localStorage.setItem('scroll_grid_albumList', '0');
                await queryClient.cancelQueries({ queryKey: ['albumList'] });
                dispatch(
                  setPagination({
                    listType: Item.Album,
                    data: {
                      activePage: e,
                    },
                  })
                );
                gridScroll(0);
              },
            }
          }
        />
      )}
    </GenericPage>
  );
};

export default AlbumList;
