import React, { useEffect, useRef, useState } from 'react';
import _ from 'lodash';
import { FastAverageColor } from 'fast-average-color';
import { clipboard, settings, shell } from '../shared/bridge';
import { ButtonToolbar, Whisper, ButtonGroup } from 'rsuite';
import InfoCircleIcon from '@rsuite/icons/legacy/InfoCircle';
import MagicIcon from '@rsuite/icons/legacy/Magic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  DownloadButton,
  FavoriteButton,
  PlayAppendButton,
  PlayAppendNextButton,
  PlayButton,
} from '../shared/ToolbarButtons';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import useSearchQuery from '../../hooks/useSearchQuery';
import GenericPage from '../layout/GenericPage';
import ListViewType from '../viewtypes/ListViewType';
import GridViewType from '../viewtypes/GridViewType';
import GenericPageHeader from '../layout/GenericPageHeader';
import { fixPlayer2Index, setPlayQueueByRowClick } from '../../redux/playQueueSlice';
import { notifyToast } from '../shared/toast';
import { formatDuration } from '../../shared/utils';
import useIsCached from '../../hooks/useIsCached';
import { LinkWrapper, SectionTitle, StyledButton, StyledLink, StyledPanel } from '../shared/styled';
import { setStatus } from '../../redux/playerSlice';
import { GradientBackground, PageHeaderSubtitleDataLine } from '../layout/styled';
import { apiController } from '../../api/controller';
import { Album, Artist, GenericItem, Genre, Item, Play, Server, Song } from '../../types';
import type { RowDataType } from 'rsuite-table';
import ListViewTable from '../viewtypes/ListViewTable';
import Card from '../card/Card';
import ScrollingMenu from '../scrollingmenu/ScrollingMenu';
import useColumnSort from '../../hooks/useColumnSort';
import CustomTooltip from '../shared/CustomTooltip';
import { setFilter, setPagination } from '../../redux/viewSlice';
import CenterLoader from '../loader/CenterLoader';
import useListClickHandler from '../../hooks/useListClickHandler';
import Popup from '../shared/Popup';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';

const fac = new FastAverageColor();

interface ArtistViewProps {
  id?: string;
  isModal?: boolean;
}

const ArtistView = ({ ...rest }: ArtistViewProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const folder = useAppSelector((state) => state.folder);
  const [viewType, setViewType] = useState(settings.get('albumViewType') || 'list');
  const [imageAverageColor, setImageAverageColor] = useState({
    color: 'rgba(50, 50, 50, .4)',
    loaded: true,
  });
  const [artistDurationTotal, setArtistDurationTotal] = useState('');
  const [artistSongTotal, setArtistSongTotal] = useState(0);
  const [musicFolder, setMusicFolder] = useState<string | undefined>(undefined);
  const [seeFullDescription, setSeeFullDescription] = useState(false);
  const [seeMoreTopSongs, setSeeMoreTopSongs] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [compilationAlbums, setCompilationAlbums] = useState<Album[]>([]);
  const genreLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (folder.applied.artists) {
      setMusicFolder(folder.musicFolder);
    }
  }, [folder]);

  const { id } = useParams();
  const artistId = rest.id ? rest.id : id;
  const { isLoading, isError, data, error } = useQuery<Artist | undefined, Error>({
    queryKey: ['artist', artistId, musicFolder],
    queryFn: () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getArtist',
        args: { id: artistId, musicFolderId: musicFolder },
      }),
  });

  const { isLoading: isLoadingTopSongs, data: topSongs } = useQuery({
    queryKey: ['artistTopSongs', data?.title],
    queryFn: () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getTopSongs',
        args: {
          artist: config.serverType === Server.Jellyfin ? id : data?.title,
          count: 100,
        },
      }),
    enabled: Boolean(data?.title || data?.id),
  });

  const { data: allSongs } = useQuery({
    queryKey: ['artistSongs', artistId],
    queryFn: () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getArtistSongs',
        args: { id: artistId, musicFolderId: musicFolder },
      }),
    enabled: Boolean(location.pathname.match('/songs')),
  });

  const { sortedData: albumsByYearDesc } = useColumnSort(albums, Item.Album, {
    column: 'year',
    type: 'desc',
  });

  const { sortedData: compilationAlbumsByYearDesc } = useColumnSort(compilationAlbums, Item.Album, {
    column: 'year',
    type: 'desc',
  });

  const filteredData = useSearchQuery(misc.searchQuery, data?.album ?? [], [
    'title',
    'artist',
    'genre',
    'year',
  ]);

  const artistImagePath = data?.id ? `${misc.imageCachePath}artist_${data.id}.jpg` : '';
  const isArtistImageCached = useIsCached(artistImagePath);

  useEffect(() => {
    if (settings.get('artistPageLegacy') && !rest.isModal) {
      navigate(`/library/artist/${artistId}/albums`);
    }
  }, [artistId, navigate, rest.isModal]);

  const { handleRowClick, handleRowDoubleClick } = useListClickHandler({
    doubleClick: (rowData: RowDataType, injectedSongs?: MouseEvent) => {
      // injectedSongs is actually Song[] | undefined smuggled via the event slot — see JSX wrappers below
      const songs = injectedSongs as unknown as Song[] | undefined;
      if (rowData.type === Item.Album) {
        navigate(`/library/album/${rowData.id}`);
      }

      if (rowData.type === Item.Music) {
        if (rowData.isDir) {
          navigate(`/library/folder?folderId=${rowData.parent}`);
        } else {
          dispatch(
            setPlayQueueByRowClick({
              entries: (songs ?? []).filter((entry) => !entry.isDir),
              currentIndex: rowData.rowIndex as number,
              currentSongId: rowData.id as string,
              uniqueSongId: rowData.uniqueId as string,
              filters: config.playback.filters,
            })
          );
          dispatch(setStatus('PLAYING'));
          dispatch(fixPlayer2Index());
        }
      }
    },
  });

  const { handleFavorite } = useFavorite();
  const { handlePlayQueueAdd } = usePlayQueueHandler();
  const { handleRating } = useRating();

  const handleDownload = async (type: 'copy' | 'download') => {
    if (config.serverType === Server.Jellyfin) {
      const downloadUrls: string[] = [];

      const allArtistSongs = await apiController({
        serverType: config.serverType,
        endpoint: 'getArtistSongs',
        args: { id: data?.id, musicFolderId: musicFolder },
      });

      for (let i = 0; i < allArtistSongs.length; i += 1) {
        downloadUrls.push(
          await apiController({
            serverType: config.serverType,
            endpoint: 'getDownloadUrl',
            args: { id: allArtistSongs[i].id },
          })
        );
      }

      if (type === 'download') {
        downloadUrls.forEach((link) => {
          if (/^https?:\/\//i.test(link)) shell.openExternal(link);
        });
      }

      if (type === 'copy') {
        clipboard.writeText(downloadUrls.join('\n'));
        notifyToast('info', t('Download links copied!'));
      }
    } else if (data?.album?.[0]?.parent) {
      if (type === 'download') {
        const dlUrl = await apiController({
          serverType: config.serverType,
          endpoint: 'getDownloadUrl',
          args: { id: data.album[0].parent },
        });
        if (/^https?:\/\//i.test(dlUrl)) shell.openExternal(dlUrl);
      } else {
        clipboard.writeText(
          await apiController({
            serverType: config.serverType,
            endpoint: 'getDownloadUrl',
            args: { id: data.album[0].parent },
          })
        );
        notifyToast('info', t('Download links copied!'));
      }
    } else {
      const downloadUrls: string[] = [];
      for (let i = 0; i < (data?.album?.length ?? 0); i += 1) {
        const albumRes = await apiController({
          serverType: config.serverType,
          endpoint: 'getAlbum',
          args: { id: data?.album?.[i].id },
        });

        if (albumRes.song[0]?.parent) {
          downloadUrls.push(
            await apiController({
              serverType: config.serverType,
              endpoint: 'getDownloadUrl',
              args: { id: albumRes.song[0].parent },
            })
          );
        } else {
          notifyToast(
            'warning',
            t('[{{albumTitle}}] No parent album found', { albumTitle: albumRes.title })
          );
        }
      }

      if (type === 'download') {
        downloadUrls.forEach((link) => {
          if (/^https?:\/\//i.test(link)) shell.openExternal(link);
        });
      }

      if (type === 'copy') {
        clipboard.writeText(downloadUrls.join('\n'));
        notifyToast('info', t('Download links copied!'));
      }
    }
  };

  useEffect(() => {
    if (!isLoading) {
      const img = isArtistImageCached
        ? artistImagePath
        : data?.image?.includes('placeholder')
          ? data?.info?.imageUrl
            ? data?.info?.imageUrl
            : data?.image
          : data?.image;

      let colorAttempts = 0;
      const setAvgColor = (imgUrl: string) => {
        if (
          data?.image?.match('placeholder') ||
          (data?.image?.match('placeholder') &&
            data?.info?.imageUrl?.match('2a96cbd8b46e442fc41c2b86b821562f'))
        ) {
          setImageAverageColor({ color: 'rgba(50, 50, 50, .4)', loaded: true });
        } else {
          fac
            .getColorAsync(imgUrl, {
              ignoredColor: [
                [255, 255, 255, 255], // White
                [0, 0, 0, 255], // Black
              ],
              mode: 'precision',
              algorithm: 'dominant',
            })
            .then((color) => {
              return setImageAverageColor({
                color: color.rgba,
                loaded: true,
              });
            })
            .catch(() => {
              colorAttempts += 1;
              if (colorAttempts < 3) {
                setAvgColor(imgUrl);
              } else {
                setImageAverageColor({ color: 'rgba(50, 50, 50, .4)', loaded: true });
              }
            });
        }
      };
      setAvgColor(img ?? '');
    }
  }, [
    data?.id,
    data?.image,
    data?.info,
    isLoading,
    misc.imageCachePath,
    artistImagePath,
    isArtistImageCached,
  ]);

  useEffect(() => {
    const allAlbumDurations = _.sum(_.map(data?.album, 'duration'));
    const allSongCount = _.sum(_.map(data?.album, 'songCount'));

    setArtistDurationTotal(formatDuration(allAlbumDurations) || 'N/a');
    setArtistSongTotal(allSongCount);
  }, [data?.album]);

  useEffect(() => {
    setAlbums(
      data?.album?.filter(
        (entry: Album) => entry.albumArtistId === data?.id || entry.albumArtist === data?.title
      ) ?? []
    );

    setCompilationAlbums(
      data?.album?.filter(
        (entry: Album) => entry.albumArtistId !== data?.id && entry.albumArtist !== data?.title
      ) ?? []
    );
  }, [data?.album, data?.id, data?.title]);

  if (isLoading || isLoadingTopSongs || imageAverageColor.loaded === false) {
    return <CenterLoader />;
  }

  if (isError) {
    return <span>Error: {error?.message}</span>;
  }

  if (!data) {
    return null;
  }

  return (
    <>
      {!rest.isModal && (
        <GradientBackground
          $expanded={config.lookAndFeel.sidebar.expand}
          $color={imageAverageColor.color}
          $titleBar={misc.titleBar}
          $sidebarwidth={config.lookAndFeel.sidebar.width}
        />
      )}
      <GenericPage
        contentZIndex={1}
        hideDivider
        header={
          <GenericPageHeader
            image={
              <Card
                title={t('None')}
                subtitle=""
                coverArt={
                  isArtistImageCached
                    ? artistImagePath
                    : data?.image?.includes('placeholder')
                      ? data?.info?.imageUrl
                        ? data?.info?.imageUrl
                        : data?.image
                      : data?.image
                }
                size={
                  location.pathname.match('/songs|/albums|/compilationalbums|/topsongs') ? 180 : 225
                }
                hasHoverButtons
                noInfoPanel
                noModalButton
                details={data}
                playClick={{ type: 'artist', id: data.id }}
                url={`/library/artist/${artistId}`}
                handleFavorite={handleFavorite}
              />
            }
            cacheImages={{
              enabled: settings.get('cacheImages') ?? false,
              cacheType: 'artist',
              id: data.id,
            }}
            imageHeight={
              location.pathname.match('/songs|/albums|/compilationalbums|/topsongs') ? 180 : 225
            }
            title={data.title}
            showTitleTooltip
            subtitle={
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <PageHeaderSubtitleDataLine $top $overflow>
                  <StyledLink onClick={() => navigate(`/library/artist`)}>
                    <strong>{t('Artist')}</strong>
                  </StyledLink>{' '}
                  • {t('{{count}} albums', { count: data.albumCount })} •{' '}
                  {t('{{count}} songs', { count: artistSongTotal })}, {artistDurationTotal}
                </PageHeaderSubtitleDataLine>
                {!location.pathname.match('/songs|/albums|/compilationalbums|/topsongs') && (
                  <PageHeaderSubtitleDataLine
                    $wrap
                    ref={genreLineRef}
                    onWheel={(e: React.WheelEvent<HTMLDivElement>) => {
                      if (!e.shiftKey) {
                        if (e.deltaY === 0) return;
                        const position = genreLineRef.current?.scrollLeft ?? 0;
                        genreLineRef.current?.scrollTo({
                          top: 0,
                          left: position + e.deltaY,
                          behavior: 'smooth',
                        });
                      }
                    }}
                  >
                    {data.genre?.map((d: Genre, i: number) => {
                      return (
                        <span key={d.id ?? d.title}>
                          {i > 0 && ', '}
                          <LinkWrapper $maxWidth="13vw">
                            <StyledLink
                              tabIndex={0}
                              onClick={() => {
                                if (!rest.isModal) {
                                  dispatch(
                                    setFilter({
                                      listType: Item.Album,
                                      data: d.title,
                                    })
                                  );
                                  dispatch(
                                    setPagination({ listType: Item.Album, data: { activePage: 1 } })
                                  );

                                  localStorage.setItem('scroll_list_albumList', '0');
                                  localStorage.setItem('scroll_grid_albumList', '0');
                                  setTimeout(() => {
                                    navigate(`/library/album?sortType=${d.title}`);
                                  }, 50);
                                }
                              }}
                              onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === ' ' || e.key === 'Enter') {
                                  e.preventDefault();
                                  if (!rest.isModal) {
                                    dispatch(
                                      setFilter({
                                        listType: Item.Album,
                                        data: d.title,
                                      })
                                    );
                                    dispatch(
                                      setPagination({
                                        listType: Item.Album,
                                        data: { activePage: 1 },
                                      })
                                    );

                                    localStorage.setItem('scroll_list_albumList', '0');
                                    localStorage.setItem('scroll_grid_albumList', '0');
                                    setTimeout(() => {
                                      navigate(`/library/album?sortType=${d.title}`);
                                    }, 50);
                                  }
                                }
                              }}
                            >
                              {d.title}
                            </StyledLink>
                          </LinkWrapper>
                        </span>
                      );
                    })}
                  </PageHeaderSubtitleDataLine>
                )}

                {!location.pathname.match('/songs|/albums|/compilationalbums|/topsongs') &&
                  data?.info?.biography
                    ?.replace(/<[^>]*>/g, '')
                    .replace('Read more on Last.fm</a>', '')
                    ?.trim() && (
                    <PageHeaderSubtitleDataLine
                      onClick={() => setSeeFullDescription(!seeFullDescription)}
                      style={{
                        minHeight: '2.5rem',
                        maxHeight: seeFullDescription ? 'none' : '5.0rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'pre-wrap',
                        cursor: 'pointer',
                      }}
                    >
                      <span>
                        {data?.info?.biography
                          ?.replace(/<[^>]*>/g, '')
                          .replace('Read more on Last.fm</a>', '')
                          ?.trim()
                          ? `${data?.info?.biography
                              ?.replace(/<[^>]*>/g, '')
                              .replace('Read more on Last.fm</a>', '')}`
                          : ''}
                      </span>
                    </PageHeaderSubtitleDataLine>
                  )}

                <div style={{ marginTop: 'auto' }}>
                  <ButtonToolbar>
                    <PlayButton
                      $circle
                      appearance="primary"
                      size="md"
                      onClick={() =>
                        handlePlayQueueAdd({
                          byItemType: { item: Item.Artist, id: data.id },
                          play: Play.Play,
                          musicFolder,
                        })
                      }
                    />
                    <PlayAppendNextButton
                      size="md"
                      appearance="subtle"
                      onClick={() =>
                        handlePlayQueueAdd({
                          byItemType: { item: Item.Artist, id: data.id },
                          play: Play.Next,
                          musicFolder,
                        })
                      }
                    />
                    <PlayAppendButton
                      size="md"
                      appearance="subtle"
                      onClick={() =>
                        handlePlayQueueAdd({
                          byItemType: { item: Item.Artist, id: data.id },
                          play: Play.Later,
                          musicFolder,
                        })
                      }
                    />
                    <CustomTooltip text={t('Artist Mix')}>
                      <StyledButton
                        aria-label={t('Artist Mix')}
                        appearance="subtle"
                        size="lg"
                        onClick={() =>
                          handlePlayQueueAdd({
                            byItemType: {
                              item: Item.Artist,
                              id: data.id,
                              endpoint: 'getSimilarSongs',
                            },
                            play: Play.Play,
                            onEmpty: () =>
                              notifyToast('warning', t('No similar songs found for this artist.')),
                          })
                        }
                      >
                        <MagicIcon />
                      </StyledButton>
                    </CustomTooltip>
                    <FavoriteButton
                      size="lg"
                      appearance="subtle"
                      isFavorite={data.starred}
                      onClick={() =>
                        handleFavorite(data, {
                          custom: () =>
                            queryClient.setQueryData(['artist', artistId, musicFolder], {
                              ...data,
                              starred: data?.starred ? undefined : Date.now(),
                            }),
                        })
                      }
                    />
                    <Whisper
                      trigger="hover"
                      placement="bottom"
                      delay={500}
                      enterable
                      preventOverflow
                      speaker={
                        <Popup>
                          <ButtonToolbar>
                            <StyledButton onClick={() => handleDownload('download')}>
                              {t('Download')}
                            </StyledButton>
                            <StyledButton onClick={() => handleDownload('copy')}>
                              {t('Copy to clipboard')}
                            </StyledButton>
                          </ButtonToolbar>
                        </Popup>
                      }
                    >
                      {/* DownloadButton renders its own CustomTooltip, which is itself a
                          Whisper — nesting that directly as this outer Whisper's child
                          leaves it without a plain DOM node to measure for positioning,
                          so the popup fell back to the viewport origin (top-left)
                          instead of anchoring under the button. A plain wrapper element
                          gives it one, same as nav-search's Whisper in SearchBar.tsx. */}
                      <span style={{ display: 'inline-block' }}>
                        <DownloadButton size="lg" appearance="subtle" />
                      </span>
                    </Whisper>
                    <Whisper
                      trigger="hover"
                      placement="bottom"
                      delay={500}
                      enterable
                      preventOverflow
                      speaker={
                        <Popup>
                          {data?.info?.externalUrl &&
                            data.info.externalUrl.map((ext: GenericItem) => (
                              <StyledButton
                                key={ext.id}
                                onClick={() => {
                                  if (/^https?:\/\//i.test(ext.id)) shell.openExternal(ext.id);
                                }}
                              >
                                {ext.title}
                              </StyledButton>
                            ))}
                        </Popup>
                      }
                    >
                      {/* Same fix as the DownloadButton Whisper above: CustomTooltip renders
                          its own internal Whisper, so nesting it directly as this outer
                          Whisper's child leaves it without a plain DOM node to measure for
                          positioning — here throwing "target should return an HTMLElement"
                          on click instead of just mispositioning. A plain wrapper element
                          gives it one. */}
                      <span style={{ display: 'inline-block' }}>
                        <CustomTooltip text={t('Info')}>
                          <StyledButton aria-label={t('Info')} appearance="subtle" size="lg">
                            <InfoCircleIcon />
                          </StyledButton>
                        </CustomTooltip>
                      </span>
                    </Whisper>
                  </ButtonToolbar>
                </div>
              </div>
            }
            showViewTypeButtons={!!location.pathname.match('/albums|/compilationalbums')}
            viewTypeSetting="album"
            handleListClick={() => setViewType('list')}
            handleGridClick={() => setViewType('grid')}
          />
        }
      >
        <>
          {location.pathname.match('/songs') ? (
            <ListViewType
              data={allSongs || []}
              tableColumns={config.lookAndFeel.listView.music.columns}
              handleRowClick={handleRowClick}
              handleRowDoubleClick={(rowData: RowDataType) =>
                handleRowDoubleClick(
                  rowData as unknown as { uniqueId: string },
                  allSongs as unknown as MouseEvent
                )
              }
              virtualized
              rowHeight={config.lookAndFeel.listView.music.rowHeight}
              fontSize={config.lookAndFeel.listView.music.fontSize}
              cacheImages={{
                enabled: settings.get('cacheImages') ?? false,
                cacheType: 'album',
                cacheIdProperty: 'albumId',
              }}
              listType="music"
              dnd
              disabledContextMenuOptions={['deletePlaylist', 'viewInModal']}
              handleFavorite={(rowData: RowDataType) =>
                handleFavorite(rowData, { queryKey: ['artistSongs', artistId] })
              }
              handleRating={(rowData: RowDataType, rating: number) =>
                handleRating(rowData, { queryKey: ['artistSongs', artistId], rating })
              }
            />
          ) : location.pathname.match('/albums|/compilationalbums') ? (
            <>
              {viewType === 'list' && (
                <ListViewType
                  data={
                    misc.searchQuery !== ''
                      ? filteredData
                      : location.pathname.match('/albums')
                        ? albumsByYearDesc
                        : compilationAlbumsByYearDesc
                  }
                  tableColumns={config.lookAndFeel.listView.album.columns}
                  handleRowClick={handleRowClick}
                  handleRowDoubleClick={handleRowDoubleClick}
                  virtualized
                  rowHeight={config.lookAndFeel.listView.album.rowHeight}
                  fontSize={config.lookAndFeel.listView.album.fontSize}
                  cacheImages={{
                    enabled: settings.get('cacheImages') ?? false,
                    cacheType: 'album',
                    cacheIdProperty: 'albumId',
                  }}
                  page="artistPage"
                  listType="album"
                  isModal={rest.isModal}
                  disabledContextMenuOptions={[
                    'removeSelected',
                    'moveSelectedTo',
                    'deletePlaylist',
                    'viewInFolder',
                  ]}
                  handleFavorite={(rowData: RowDataType) =>
                    handleFavorite(rowData, { queryKey: ['artist', artistId, musicFolder] })
                  }
                />
              )}

              {viewType === 'grid' && (
                <GridViewType
                  data={
                    misc.searchQuery !== ''
                      ? filteredData
                      : location.pathname.match('/albums')
                        ? albumsByYearDesc
                        : compilationAlbumsByYearDesc
                  }
                  cardTitle={{
                    prefix: '/library/album',
                    property: 'title',
                    urlProperty: 'albumId',
                  }}
                  cardSubtitle={{
                    property: 'year',
                    unit: '',
                  }}
                  playClick={{ type: 'album', idProperty: 'id' }}
                  size={config.lookAndFeel.gridView.cardSize}
                  cacheType="album"
                  isModal={rest.isModal}
                  handleFavorite={(rowData: RowDataType) =>
                    handleFavorite(rowData, { queryKey: ['artist', artistId, musicFolder] })
                  }
                />
              )}
            </>
          ) : location.pathname.match('/topsongs') ? (
            <ListViewType
              data={topSongs || []}
              tableColumns={config.lookAndFeel.listView.music.columns}
              handleRowClick={handleRowClick}
              handleRowDoubleClick={(rowData: RowDataType) =>
                handleRowDoubleClick(
                  rowData as unknown as { uniqueId: string },
                  topSongs as unknown as MouseEvent
                )
              }
              virtualized
              rowHeight={config.lookAndFeel.listView.music.rowHeight}
              fontSize={config.lookAndFeel.listView.music.fontSize}
              cacheImages={{
                enabled: settings.get('cacheImages') ?? false,
                cacheType: 'album',
                cacheIdProperty: 'albumId',
              }}
              listType="music"
              dnd
              disabledContextMenuOptions={['deletePlaylist', 'viewInModal']}
              handleFavorite={(rowData: RowDataType) =>
                handleFavorite(rowData, { queryKey: ['artistTopSongs', data?.title] })
              }
              handleRating={(rowData: RowDataType, rating: number) =>
                handleRating(rowData, { queryKey: ['artistTopSongs', data?.title], rating })
              }
            />
          ) : (
            <>
              <ButtonToolbar>
                <StyledButton
                  data-testid="view-discography-button"
                  size="sm"
                  appearance="subtle"
                  onClick={() => navigate(`/library/artist/${artistId}/albums`)}
                >
                  {t('View Discography')}
                </StyledButton>
                <StyledButton
                  size="sm"
                  appearance="subtle"
                  onClick={() => navigate(`/library/artist/${artistId}/songs`)}
                >
                  {t('View All Songs')}
                </StyledButton>
              </ButtonToolbar>
              <br />
              {topSongs?.length > 0 && (
                <StyledPanel
                  header={
                    <>
                      <SectionTitle
                        onClick={() => navigate(`/library/artist/${artistId}/topsongs`)}
                      >
                        {t('Top Songs')}
                      </SectionTitle>{' '}
                      <ButtonGroup>
                        <PlayButton
                          size="sm"
                          appearance="subtle"
                          text={t('Play Top Songs')}
                          onClick={() =>
                            handlePlayQueueAdd({
                              byData: topSongs,
                              play: Play.Play,
                            })
                          }
                        />
                        <PlayAppendNextButton
                          size="sm"
                          appearance="subtle"
                          onClick={() =>
                            handlePlayQueueAdd({
                              byData: topSongs,
                              play: Play.Next,
                            })
                          }
                        />
                        <PlayAppendButton
                          size="sm"
                          appearance="subtle"
                          onClick={() =>
                            handlePlayQueueAdd({
                              byData: topSongs,
                              play: Play.Later,
                            })
                          }
                        />
                      </ButtonGroup>
                    </>
                  }
                >
                  <ListViewTable
                    data={(seeMoreTopSongs ? topSongs.slice(0, 15) : topSongs?.slice(0, 5)) || []}
                    autoHeight
                    columns={config.lookAndFeel.listView.music.columns}
                    rowHeight={config.lookAndFeel.listView.music.rowHeight}
                    fontSize={config.lookAndFeel.listView.music.fontSize}
                    listType="music"
                    cacheImages={{ enabled: false }}
                    isModal={false}
                    miniView={false}
                    handleFavorite={(rowData: RowDataType) =>
                      handleFavorite(rowData, { queryKey: ['artistTopSongs', data.title] })
                    }
                    handleRowClick={
                      handleRowClick as (
                        e: MouseEvent,
                        rowData: RowDataType,
                        tableData: RowDataType[]
                      ) => void
                    }
                    handleRowDoubleClick={(rowData: RowDataType) =>
                      handleRowDoubleClick(
                        rowData as unknown as { uniqueId: string },
                        topSongs as unknown as MouseEvent
                      )
                    }
                    handleRating={(rowData: RowDataType, rating: number) =>
                      handleRating(rowData, { queryKey: ['artistTopSongs', data?.title], rating })
                    }
                    config={undefined} // Prevent column sort
                    disabledContextMenuOptions={[
                      'removeSelected',
                      'moveSelectedTo',
                      'deletePlaylist',
                      'viewInModal',
                    ]}
                  />
                  {topSongs.length > 5 && (
                    <StyledButton
                      appearance="subtle"
                      onClick={() => setSeeMoreTopSongs(!seeMoreTopSongs)}
                    >
                      {seeMoreTopSongs ? t('SHOW LESS') : t('SHOW MORE')}
                    </StyledButton>
                  )}
                </StyledPanel>
              )}
              {albumsByYearDesc.length > 0 && (
                <StyledPanel>
                  <ScrollingMenu
                    title={`${t('Latest Albums')} `}
                    subtitle={
                      <ButtonGroup>
                        <PlayButton
                          size="sm"
                          appearance="subtle"
                          text={t('Play Latest Albums')}
                          onClick={() =>
                            handlePlayQueueAdd({
                              byItemType: { item: Item.Artist, id: data.id },
                              play: Play.Play,
                              musicFolder,
                            })
                          }
                        />
                        <PlayAppendNextButton
                          size="sm"
                          appearance="subtle"
                          onClick={() =>
                            handlePlayQueueAdd({
                              byItemType: { item: Item.Artist, id: data.id },
                              play: Play.Next,
                              musicFolder,
                            })
                          }
                        />
                        <PlayAppendButton
                          size="sm"
                          appearance="subtle"
                          onClick={() =>
                            handlePlayQueueAdd({
                              byItemType: { item: Item.Artist, id: data.id },
                              play: Play.Later,
                              musicFolder,
                            })
                          }
                        />
                      </ButtonGroup>
                    }
                    onClickTitle={() => navigate(`/library/artist/${artistId}/albums`)}
                    data={albumsByYearDesc?.slice(0, 15) || []}
                    cardTitle={{
                      prefix: '/library/album',
                      property: 'title',
                      urlProperty: 'id',
                    }}
                    cardSubtitle={{
                      property: 'year',
                    }}
                    cardSize={config.lookAndFeel.gridView.cardSize}
                    type="album"
                    noScrollbar
                    handleFavorite={(rowData: RowDataType) =>
                      handleFavorite(rowData, { queryKey: ['artist', artistId, musicFolder] })
                    }
                  />
                </StyledPanel>
              )}

              {compilationAlbumsByYearDesc.length > 0 && (
                <StyledPanel>
                  <ScrollingMenu
                    title={`${t('Appears On')} `}
                    subtitle={
                      <ButtonGroup>
                        <PlayButton
                          size="sm"
                          appearance="subtle"
                          text={t('Play Compilation Albums')}
                          onClick={() =>
                            handlePlayQueueAdd({
                              byItemType: { item: Item.Artist, id: data.id },
                              play: Play.Play,
                            })
                          }
                        />
                        <PlayAppendNextButton
                          size="sm"
                          appearance="subtle"
                          onClick={() =>
                            handlePlayQueueAdd({
                              byItemType: { item: Item.Artist, id: data.id },
                              play: Play.Next,
                            })
                          }
                        />
                        <PlayAppendButton
                          size="sm"
                          appearance="subtle"
                          onClick={() =>
                            handlePlayQueueAdd({
                              byItemType: { item: Item.Artist, id: data.id },
                              play: Play.Later,
                            })
                          }
                        />
                      </ButtonGroup>
                    }
                    onClickTitle={() => navigate(`/library/artist/${artistId}/compilationalbums`)}
                    data={compilationAlbumsByYearDesc?.slice(0, 15) || []}
                    cardTitle={{
                      prefix: '/library/album',
                      property: 'title',
                      urlProperty: 'id',
                    }}
                    cardSubtitle={{
                      property: 'year',
                    }}
                    cardSize={config.lookAndFeel.gridView.cardSize}
                    type="album"
                    noScrollbar
                    handleFavorite={(rowData: RowDataType) =>
                      handleFavorite(rowData, { queryKey: ['artist', artistId, musicFolder] })
                    }
                  />
                </StyledPanel>
              )}

              {(data.info?.similarArtist?.length ?? 0) > 0 && (
                <StyledPanel>
                  <ScrollingMenu
                    title={t('Related Artists')}
                    data={data.info?.similarArtist ?? []}
                    cardTitle={{
                      prefix: '/library/artist',
                      property: 'title',
                      urlProperty: 'id',
                    }}
                    cardSubtitle="Artist"
                    cardSize={config.lookAndFeel.gridView.cardSize}
                    type="artist"
                    noScrollbar
                    handleFavorite={(rowData: RowDataType) =>
                      handleFavorite(rowData, {
                        custom: () => {
                          queryClient.setQueryData<Artist | undefined>(
                            ['artist', artistId, musicFolder],
                            (oldData) => {
                              if (!oldData?.info?.similarArtist) return oldData;
                              const newStarred = (rowData as Artist).starred
                                ? undefined
                                : String(Date.now());
                              const updatedSimilarArtist = oldData.info.similarArtist.map((a) =>
                                a.id === (rowData as Artist).id ? { ...a, starred: newStarred } : a
                              );
                              return {
                                ...oldData,
                                info: { ...oldData.info, similarArtist: updatedSimilarArtist },
                              };
                            }
                          );
                        },
                      })
                    }
                  />
                </StyledPanel>
              )}
            </>
          )}
        </>
      </GenericPage>
    </>
  );
};

export default ArtistView;
