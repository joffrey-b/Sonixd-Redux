import React, { useEffect, useMemo, useState } from 'react';
import _ from 'lodash';
import { Nav } from 'rsuite';
import CloseIcon from '@rsuite/icons/legacy/Close';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import useRouterQuery from '../../hooks/useRouterQuery';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { fixPlayer2Index, setPlayQueueByRowClick } from '../../redux/playQueueSlice';
import { setStatus } from '../../redux/playerSlice';
import {
  StyledButton,
  StyledInput,
  StyledInputGroup,
  StyledInputGroupButton,
  StyledNavItem,
} from '../shared/styled';
import { apiController } from '../../api/controller';
import { Album, Artist, Item, Song } from '../../types';
import type { RowDataType } from 'rsuite-table';

interface SearchPage {
  song: { data: Song[]; nextCursor: number | undefined };
  album: { data: Album[]; nextCursor: number | undefined };
  artist: { data: Artist[]; nextCursor: number | undefined };
}
import useListClickHandler from '../../hooks/useListClickHandler';
import ListViewType from '../viewtypes/ListViewType';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';
import { settings } from '../shared/bridge';

const SearchView = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useRouterQuery();
  const urlQuery = query.get('query') || '';
  const folder = useAppSelector((state) => state.folder);
  const config = useAppSelector((state) => state.config);
  const [search, setSearch] = useState(urlQuery);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(urlQuery);
  const [musicFolder, setMusicFolder] = useState<{ loaded: boolean; id: string | undefined }>({
    loaded: false,
    id: undefined,
  });
  const [nav, setNav] = useState<'songs' | 'albums' | 'artists'>('songs');
  const [artistData, setArtistData] = useState<Artist[]>([]);
  const [albumData, setAlbumData] = useState<Album[]>([]);
  const [songData, setSongData] = useState<Song[]>([]);

  useEffect(() => {
    if (folder.applied.search) {
      setMusicFolder({ loaded: true, id: folder.musicFolder });
    } else {
      setMusicFolder({ loaded: true, id: undefined });
    }
  }, [folder]);

  const debouncedSearchHandler = useMemo(
    () =>
      _.debounce((e) => {
        setDebouncedSearchQuery(e);
        navigate(`/search?query=${e}`, { replace: true });
      }, 300),
    [navigate]
  );

  const {
    data: songResults,
    isLoading: isLoadingSongs,
    fetchNextPage: fetchNextSongPage,
    isFetchingNextPage: isFetchingNextSongPage,
    hasNextPage: hasNextSongPage,
  } = useInfiniteQuery<SearchPage, Error>({
    queryKey: ['searchpage', debouncedSearchQuery, { type: Item.Music, count: 50 }, musicFolder.id],
    queryFn: ({ pageParam }) =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getSearch',
        args: {
          query: debouncedSearchQuery,
          songCount: 50,
          songOffset: pageParam,
          albumCount: 0,
          artistCount: 0,
          musicFolderId: musicFolder.id,
        },
      }),
    initialPageParam: 0,
    enabled: debouncedSearchQuery !== '' && musicFolder.loaded,
    getNextPageParam: (lastPage) => lastPage.song.nextCursor,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: albumResults,
    isLoading: isLoadingAlbums,
    fetchNextPage: fetchNextAlbumPage,
    isFetchingNextPage: isFetchingNextAlbumPage,
    hasNextPage: hasNextAlbumPage,
  } = useInfiniteQuery<SearchPage, Error>({
    queryKey: ['searchpage', debouncedSearchQuery, { type: Item.Album, count: 25 }, musicFolder.id],
    queryFn: ({ pageParam }) =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getSearch',
        args: {
          query: debouncedSearchQuery,
          albumCount: 25,
          albumOffset: pageParam,
          songCount: 0,
          artistCount: 0,
          musicFolderId: musicFolder.id,
        },
      }),
    initialPageParam: 0,
    enabled: debouncedSearchQuery !== '' && musicFolder.loaded,
    getNextPageParam: (lastPage) => lastPage.album.nextCursor,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: artistResults,
    isLoading: isLoadingArtists,
    fetchNextPage: fetchNextArtistPage,
    isFetchingNextPage: isFetchingNextArtistPage,
    hasNextPage: hasNextArtistPage,
  } = useInfiniteQuery<SearchPage, Error>({
    queryKey: [
      'searchpage',
      debouncedSearchQuery,
      { type: Item.Artist, count: 15 },
      musicFolder.id,
    ],
    queryFn: ({ pageParam }) =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getSearch',
        args: {
          query: debouncedSearchQuery,
          artistCount: 15,
          artistOffset: pageParam,
          songCount: 0,
          albumCount: 0,
          musicFolderId: musicFolder.id,
        },
      }),
    initialPageParam: 0,
    enabled: debouncedSearchQuery !== '' && musicFolder.loaded,
    getNextPageParam: (lastPage) => lastPage.artist.nextCursor,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    setSongData(
      _.flatten(
        songResults?.pages.map((page: SearchPage) => {
          return page.song.data;
        })
      )
    );
  }, [songResults]);

  useEffect(() => {
    setAlbumData(
      _.flatten(
        albumResults?.pages.map((page: SearchPage) => {
          return page.album.data;
        })
      )
    );
  }, [albumResults]);

  useEffect(() => {
    setArtistData(
      _.flatten(
        artistResults?.pages.map((page: SearchPage) => {
          return page.artist.data;
        })
      )
    );
  }, [artistResults]);

  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();

  const { handleRowClick, handleRowDoubleClick } = useListClickHandler({
    doubleClick: (rowData: RowDataType) => {
      if (rowData.isDir) {
        navigate(`/library/folder?folderId=${rowData.parent}`);
      } else {
        dispatch(
          setPlayQueueByRowClick({
            entries: songData.filter((entry) => entry.isDir !== true),
            currentIndex: rowData.rowIndex as number,
            currentSongId: rowData.id as string,
            uniqueSongId: rowData.uniqueId as string,
            filters: config.playback.filters,
          })
        );
        dispatch(setStatus('PLAYING'));
        dispatch(fixPlayer2Index());
      }
    },
  });

  const { handleRowClick: handleAlbumRowClick, handleRowDoubleClick: handleAlbumRowDoubleClick } =
    useListClickHandler({
      doubleClick: (rowData: RowDataType) => navigate(`/library/album/${rowData.id as string}`),
    });

  const { handleRowClick: handleArtistRowClick, handleRowDoubleClick: handleArtistRowDoubleClick } =
    useListClickHandler({
      doubleClick: (rowData: RowDataType) => navigate(`/library/artist/${rowData.id as string}`),
    });

  return (
    <GenericPage
      hideDivider
      header={
        <GenericPageHeader
          title={
            <>
              {t('Search')}{' '}
              <StyledButton
                loading={
                  nav === 'songs'
                    ? isFetchingNextSongPage
                    : nav === 'albums'
                      ? isFetchingNextAlbumPage
                      : nav === 'artists'
                        ? isFetchingNextArtistPage
                        : false
                }
                disabled={
                  nav === 'songs'
                    ? !hasNextSongPage
                    : nav === 'albums'
                      ? !hasNextAlbumPage
                      : nav === 'artists'
                        ? !hasNextArtistPage
                        : false
                }
                onClick={() => {
                  if (nav === 'songs') {
                    fetchNextSongPage();
                  }

                  if (nav === 'albums') {
                    fetchNextAlbumPage();
                  }

                  if (nav === 'artists') {
                    fetchNextArtistPage();
                  }
                }}
              >
                {t('Load more')}
              </StyledButton>
            </>
          }
          subtitle={
            <>
              <StyledInputGroup inside style={{ width: '50vw', maxWidth: '95%' }}>
                <StyledInput
                  id="local-search-input"
                  data-testid="search-page-input"
                  value={search}
                  onChange={(e: string) => {
                    debouncedSearchHandler(e);
                    setSearch(e);
                  }}
                />
                {search !== '' && (
                  <StyledInputGroupButton
                    $height={30}
                    appearance="subtle"
                    tabIndex={0}
                    onClick={() => {
                      setDebouncedSearchQuery('');
                      setSearch('');
                    }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        setDebouncedSearchQuery('');
                        setSearch('');
                      }
                    }}
                  >
                    <CloseIcon />
                  </StyledInputGroupButton>
                )}
              </StyledInputGroup>

              <Nav activeKey={nav} onSelect={setNav}>
                <StyledNavItem data-testid="search-tab-songs" eventKey="songs">
                  {t('Songs')} ({songData?.length}
                  {hasNextSongPage && '+'})
                </StyledNavItem>
                <StyledNavItem data-testid="search-tab-albums" eventKey="albums">
                  {t('Albums')} ({albumData?.length}
                  {hasNextAlbumPage && '+'})
                </StyledNavItem>
                <StyledNavItem data-testid="search-tab-artists" eventKey="artists">
                  {t('Artists')} ({artistData?.length}
                  {hasNextArtistPage && '+'})
                </StyledNavItem>
              </Nav>
            </>
          }
        />
      }
    >
      {nav === 'songs' && (
        <ListViewType
          loading={isLoadingSongs}
          data={songData}
          tableColumns={config.lookAndFeel.listView.music.columns}
          rowHeight={config.lookAndFeel.listView.music.rowHeight}
          fontSize={config.lookAndFeel.listView.music.fontSize}
          handleRowClick={handleRowClick}
          handleRowDoubleClick={handleRowDoubleClick}
          handleRating={(rowData: RowDataType, rating: number) =>
            handleRating(rowData, {
              rating,
              custom: () =>
                queryClient.refetchQueries({
                  queryKey: [
                    'searchpage',
                    debouncedSearchQuery,
                    { type: Item.Music, count: 50 },
                    musicFolder.id,
                  ],
                }),
            })
          }
          handleFavorite={(rowData: RowDataType) =>
            handleFavorite(rowData, {
              custom: () =>
                queryClient.refetchQueries({
                  queryKey: [
                    'searchpage',
                    debouncedSearchQuery,
                    { type: Item.Music, count: 50 },
                    musicFolder.id,
                  ],
                }),
            })
          }
          listType="music"
          cacheImages={{
            enabled: settings.get('cacheImages'),
            cacheType: 'album',
            cacheIdProperty: 'albumId',
          }}
          disabledContextMenuOptions={['deletePlaylist', 'viewInModal']}
          isModal={false}
          miniView={false}
          dnd={false}
          virtualized
        />
      )}

      {nav === 'albums' && (
        <ListViewType
          loading={isLoadingAlbums}
          data={albumData}
          tableColumns={config.lookAndFeel.listView.album.columns}
          rowHeight={config.lookAndFeel.listView.album.rowHeight}
          fontSize={config.lookAndFeel.listView.album.fontSize}
          handleRowClick={handleAlbumRowClick}
          handleRowDoubleClick={handleAlbumRowDoubleClick}
          handleRating={(rowData: RowDataType, rating: number) =>
            handleRating(rowData, {
              rating,
              custom: () =>
                queryClient.refetchQueries({
                  queryKey: [
                    'searchpage',
                    debouncedSearchQuery,
                    { type: Item.Album, count: 25 },
                    musicFolder.id,
                  ],
                }),
            })
          }
          handleFavorite={(rowData: RowDataType) =>
            handleFavorite(rowData, {
              custom: () =>
                queryClient.refetchQueries({
                  queryKey: [
                    'searchpage',
                    debouncedSearchQuery,
                    { type: Item.Album, count: 25 },
                    musicFolder.id,
                  ],
                }),
            })
          }
          listType="album"
          cacheImages={{
            enabled: settings.get('cacheImages'),
            cacheType: 'album',
            cacheIdProperty: 'albumId',
          }}
          disabledContextMenuOptions={['deletePlaylist', 'viewInModal']}
          isModal={false}
          miniView={false}
          dnd={false}
          virtualized
        />
      )}

      {nav === 'artists' && (
        <ListViewType
          loading={isLoadingArtists}
          data={artistData}
          tableColumns={config.lookAndFeel.listView.artist.columns}
          rowHeight={config.lookAndFeel.listView.artist.rowHeight}
          fontSize={config.lookAndFeel.listView.artist.fontSize}
          handleRowClick={handleArtistRowClick}
          handleRowDoubleClick={handleArtistRowDoubleClick}
          handleRating={(rowData: RowDataType, rating: number) =>
            handleRating(rowData, {
              rating,
              custom: () =>
                queryClient.refetchQueries({
                  queryKey: [
                    'searchpage',
                    debouncedSearchQuery,
                    { type: Item.Artist, count: 15 },
                    musicFolder.id,
                  ],
                }),
            })
          }
          handleFavorite={(rowData: RowDataType) =>
            handleFavorite(rowData, {
              custom: () =>
                queryClient.refetchQueries({
                  queryKey: [
                    'searchpage',
                    debouncedSearchQuery,
                    { type: Item.Artist, count: 15 },
                    musicFolder.id,
                  ],
                }),
            })
          }
          listType="artist"
          cacheImages={{
            enabled: settings.get('cacheImages'),
            cacheType: 'artist',
            cacheIdProperty: 'id',
          }}
          disabledContextMenuOptions={['deletePlaylist', 'viewInModal']}
          isModal={false}
          miniView={false}
          dnd={false}
          virtualized
        />
      )}
    </GenericPage>
  );
};

export default SearchView;
