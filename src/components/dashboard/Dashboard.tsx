import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import ScrollingMenu from '../scrollingmenu/ScrollingMenu';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { apiController } from '../../api/controller';
import { Item, Server } from '../../types';
import { setFilter, setPagination } from '../../redux/viewSlice';
import CenterLoader from '../loader/CenterLoader';
import useFavorite from '../../hooks/useFavorite';

const Dashboard = () => {
  const { t } = useTranslation();
  const history = useHistory();
  const dispatch = useAppDispatch();
  const folder = useAppSelector((state) => state.folder);
  const config = useAppSelector((state) => state.config);
  const [musicFolder, setMusicFolder] = useState({ loaded: false, id: undefined });

  useEffect(() => {
    if (folder.applied.dashboard) {
      setMusicFolder({ loaded: true, id: folder.musicFolder });
    } else {
      setMusicFolder({ loaded: true, id: undefined });
    }
  }, [folder]);

  const {
    isLoading: isLoadingRecent,
    isError: isErrorRecent,
    data: recentAlbums,
  }: any = useQuery(
    ['recentAlbums', musicFolder.id],
    () =>
      apiController({
        serverType: config.serverType,
        endpoint: config.serverType === Server.Jellyfin ? 'getSongs' : 'getAlbums',
        args: { type: 'recent', size: 20, offset: 0, order: 'desc', musicFolderId: musicFolder.id },
      }),
    {
      refetchOnWindowFocus: true,
      refetchInterval: 30000,
      enabled: musicFolder.loaded,
    }
  );

  const {
    isLoading: isLoadingNewest,
    isError: isErrorNewest,
    data: newestAlbums,
  }: any = useQuery(
    ['newestAlbums', musicFolder.id],
    () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getAlbums',
        args: { type: 'newest', size: 20, offset: 0, musicFolderId: musicFolder.id },
      }),
    {
      enabled: musicFolder.loaded,
    }
  );

  const {
    isLoading: isLoadingRandom,
    isError: isErrorRandom,
    data: randomAlbums,
  }: any = useQuery(
    ['randomAlbums', musicFolder.id],
    () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getAlbums',
        args: { type: 'random', size: 20, offset: 0, musicFolderId: musicFolder.id },
      }),
    {
      enabled: musicFolder.loaded,
    }
  );

  const {
    isLoading: isLoadingFrequent,
    isError: isErrorFrequent,
    data: frequentAlbums,
  }: any = useQuery(
    ['frequentAlbums', musicFolder.id],
    () =>
      apiController({
        serverType: config.serverType,
        endpoint: config.serverType === Server.Jellyfin ? 'getSongs' : 'getAlbums',
        args: {
          type: 'frequent',
          size: 20,
          offset: 0,
          order: 'desc',
          musicFolderId: musicFolder.id,
        },
      }),
    {
      enabled: musicFolder.loaded,
    }
  );

  const { handleFavorite } = useFavorite();

  if (
    (isLoadingRecent && !isErrorRecent) ||
    (isLoadingNewest && !isErrorNewest) ||
    (isLoadingRandom && !isErrorRandom) ||
    (isLoadingFrequent && !isErrorFrequent)
  ) {
    return <CenterLoader />;
  }

  return (
    <GenericPage header={<GenericPageHeader title={t('Dashboard')} />} hideDivider>
      <>
        {recentAlbums?.data?.length > 0 && (
          <ScrollingMenu
            noScrollbar
            title={t('Recently Played')}
            data={recentAlbums.data}
            cardTitle={{
              prefix: '/library/album',
              property: 'title',
              urlProperty: 'albumId',
            }}
            cardSubtitle={{
              prefix: '/library/artist',
              property: 'albumArtist',
              urlProperty: 'albumArtistId',
            }}
            cardSize={config.lookAndFeel.gridView.cardSize}
            onClickTitle={() => {
              dispatch(setFilter({ listType: Item.Album, data: 'recent' }));
              dispatch(setPagination({ listType: Item.Album, data: { activePage: 1 } }));
              setTimeout(() => {
                history.push(`/library/album?sortType=recent`);
              }, 50);
            }}
            type="album"
            handleFavorite={(rowData: any) =>
              handleFavorite(rowData, { queryKey: ['recentAlbums', musicFolder.id] })
            }
          />
        )}
        {newestAlbums?.data?.length > 0 && (
          <ScrollingMenu
            title={t('Recently Added')}
            noScrollbar
            data={newestAlbums.data}
            cardTitle={{
              prefix: '/library/album',
              property: 'title',
              urlProperty: 'albumId',
            }}
            cardSubtitle={{
              prefix: '/library/artist',
              property: 'albumArtist',
              urlProperty: 'albumArtistId',
            }}
            cardSize={config.lookAndFeel.gridView.cardSize}
            onClickTitle={() => {
              dispatch(setFilter({ listType: Item.Album, data: 'newest' }));
              dispatch(setPagination({ listType: Item.Album, data: { activePage: 1 } }));
              setTimeout(() => {
                history.push(`/library/album?sortType=newest`);
              }, 50);
            }}
            type="album"
            handleFavorite={(rowData: any) =>
              handleFavorite(rowData, { queryKey: ['newestAlbums', musicFolder.id] })
            }
          />
        )}
        {randomAlbums?.data?.length > 0 && (
          <ScrollingMenu
            title={t('Random')}
            noScrollbar
            data={randomAlbums.data}
            cardTitle={{
              prefix: '/library/album',
              property: 'title',
              urlProperty: 'albumId',
            }}
            cardSubtitle={{
              prefix: '/library/artist',
              property: 'albumArtist',
              urlProperty: 'albumArtistId',
            }}
            cardSize={config.lookAndFeel.gridView.cardSize}
            onClickTitle={() => {
              dispatch(setFilter({ listType: Item.Album, data: 'random' }));
              dispatch(setPagination({ listType: Item.Album, data: { activePage: 1 } }));
              setTimeout(() => {
                history.push(`/library/album?sortType=random`);
              }, 50);
            }}
            type="album"
            handleFavorite={(rowData: any) =>
              handleFavorite(rowData, { queryKey: ['randomAlbums', musicFolder.id] })
            }
          />
        )}
        {frequentAlbums?.data?.length > 0 && (
          <ScrollingMenu
            noScrollbar
            title={t('Most Played')}
            data={frequentAlbums.data}
            cardTitle={{
              prefix: '/library/album',
              property: 'title',
              urlProperty: 'albumId',
            }}
            cardSubtitle={{
              prefix: '/library/artist',
              property: 'albumArtist',
              urlProperty: 'albumArtistId',
            }}
            cardSize={config.lookAndFeel.gridView.cardSize}
            onClickTitle={() => {
              dispatch(setFilter({ listType: Item.Album, data: 'frequent' }));
              dispatch(setPagination({ listType: Item.Album, data: { activePage: 1 } }));
              setTimeout(() => {
                history.push(`/library/album?sortType=frequent`);
              }, 50);
            }}
            type="album"
            handleFavorite={(rowData: any) =>
              handleFavorite(rowData, { queryKey: ['frequentAlbums', musicFolder.id] })
            }
          />
        )}
        {!recentAlbums?.data?.length &&
          !newestAlbums?.data?.length &&
          !randomAlbums?.data?.length &&
          !frequentAlbums?.data?.length && (
            <p style={{ padding: '20px', opacity: 0.5 }}>{t('No data found')}</p>
          )}
      </>
    </GenericPage>
  );
};

export default Dashboard;
