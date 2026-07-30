import React, { useMemo, useRef } from 'react';
import { clipboard, settings } from '../shared/bridge';
import { ButtonToolbar } from 'rsuite';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RowDataType } from 'rsuite-table';
import {
  CopyToClipboardButton,
  DownloadButton,
  FavoriteButton,
  PlayAppendButton,
  PlayAppendNextButton,
  PlayButton,
  RemoveFromOfflineButton,
} from '../shared/ToolbarButtons';
import useBulkDownload from '../../hooks/useBulkDownload';
import { selectDownloadProgress } from '../../redux/downloadProgressSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { fixPlayer2Index, setPlayQueueByRowClick } from '../../redux/playQueueSlice';
import useSearchQuery from '../../hooks/useSearchQuery';
import GenericPage from '../layout/GenericPage';
import ListViewType from '../viewtypes/ListViewType';
import GenericPageHeader from '../layout/GenericPageHeader';
import { setStatus } from '../../redux/playerSlice';
import { notifyToast } from '../shared/toast';
import { formatDate, formatDuration, getAlbumSize } from '../../shared/utils';
import useIsCached from '../../hooks/useIsCached';
import { LinkWrapper, StyledLink } from '../shared/styled';
import { PageHeaderSubtitleDataLine } from '../layout/styled';
import { apiController } from '../../api/controller';
import { Genre, Item, Play, Server } from '../../types';
import Card from '../card/Card';
import { setFilter, setPagination } from '../../redux/viewSlice';
import CenterLoader from '../loader/CenterLoader';
import useListClickHandler from '../../hooks/useListClickHandler';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';
import { useCopyToClipboardConfirm } from '../../hooks/useCopyToClipboardConfirm';
import { selectEffectiveOffline } from '../../redux/connectivitySlice';
import useLibraryCache from '../../hooks/useLibraryCache';
import { buildAlbumsFromSongs, libraryCacheSongToSong } from '../../shared/offlineLibrary';
import useIsAvailableOffline from '../../hooks/useIsAvailableOffline';

interface AlbumViewProps {
  id?: string;
  isModal?: boolean;
}

const AlbumView = ({ ...rest }: AlbumViewProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const genreLineRef = useRef<HTMLDivElement | null>(null);

  const { id } = useParams();
  const albumId = rest.id ? rest.id : id;

  const albumImagePath = `${misc.imageCachePath}album_${albumId}.jpg`;
  const isAlbumImageCached = useIsCached(albumImagePath);

  const effectiveOffline = useAppSelector(selectEffectiveOffline);
  const { getCachedSongs } = useLibraryCache();

  const {
    isLoading: onlineIsLoading,
    isError: onlineIsError,
    data: onlineData,
    error,
  } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getAlbum',
        args: { id: albumId },
      }),
    enabled: !effectiveOffline,
  });

  // Offline browsing (ADR Section 5.1) -- reconstructs the same Album shape
  // getAlbum returns online, by filtering the local song snapshot down to
  // this album and reusing buildAlbumsFromSongs for the aggregate metadata.
  const offlineData = useMemo(() => {
    if (!effectiveOffline || !albumId) return undefined;
    // The cached snapshot is a flat, whole-library list with no guaranteed
    // per-album order -- unlike the online getAlbum response, which the
    // server already returns in track order. Restore it explicitly (same
    // fix jellyfinApi.ts already applies for its own out-of-order
    // responses), disc first for multi-disc albums, then track number.
    const albumSongs = getCachedSongs()
      .filter((song) => song.albumId === albumId)
      .sort((a, b) => (a.discNumber || 0) - (b.discNumber || 0) || (a.track || 0) - (b.track || 0));
    if (albumSongs.length === 0) return undefined;
    const [album] = buildAlbumsFromSongs(albumSongs);
    return { ...album, song: albumSongs.map(libraryCacheSongToSong) };
  }, [effectiveOffline, albumId, getCachedSongs]);

  const data = effectiveOffline ? offlineData : onlineData;
  const isLoading = effectiveOffline ? false : onlineIsLoading;
  const isError = effectiveOffline ? false : onlineIsError;
  const filteredData = useSearchQuery(misc.searchQuery, data?.song, [
    'title',
    'artist',
    'album',
    'year',
    'genre',
    'path',
  ]);

  const isAvailableOfflineCheck = useIsAvailableOffline();

  const { handleRowClick, handleRowDoubleClick } = useListClickHandler({
    doubleClick: (rowData: RowDataType) => {
      // Fix C: setPlayQueueByRowClick is a separate dispatch path from
      // dispatchSongsToQueue/usePlayQueueHandler -- the header Play button's
      // skip-unavailable-songs filter doesn't cover this double-click path at
      // all, matching what SearchView.tsx's row-click already does.
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
  });

  const { handlePlayQueueAdd } = usePlayQueueHandler();
  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();
  const { requestCopyConfirmation, confirmCopyModal } = useCopyToClipboardConfirm();

  // Copy-to-clipboard only now -- the Download button's own zip mechanism is
  // replaced below by the offline per-song download fan-out (ADR Section
  // 8.3: a single server-generated zip has the wrong shape for per-song
  // progress/offline-status updates, so only this button's UI slot is
  // reused, not its underlying zip request).
  const handleCopyLinks = async () => {
    if (config.serverType === Server.Jellyfin) {
      const downloadUrls = [];
      for (let i = 0; i < data.song.length; i += 1) {
        downloadUrls.push(
          await apiController({
            serverType: config.serverType,
            endpoint: 'getDownloadUrl',
            args: { id: data.song[i].id },
          })
        );
      }

      clipboard.writeText(downloadUrls.join('\n'));
      notifyToast('info', t('Download links copied!'));

      // If not Navidrome (this assumes Airsonic), then we need to use a song's parent
      // to download. This is because Airsonic does not support downloading via album ids
      // that are provided by /getAlbum or /getAlbumList2
    } else if (data.song[0]?.parent) {
      clipboard.writeText(
        await apiController({
          serverType: config.serverType,
          endpoint: 'getDownloadUrl',
          args:
            config.serverType === Server.Subsonic ? { id: data.song[0].parent } : { id: data.id },
        })
      );
      notifyToast('info', t('Download links copied!'));
    } else {
      notifyToast('warning', t('No parent album found'));
    }
  };

  const { downloadSongs, removeDownloadedSongs } = useBulkDownload();
  const downloadProgress = useAppSelector(selectDownloadProgress);

  const handleOfflineDownload = () => {
    downloadSongs(data.song);
  };

  const handleOfflineDelete = () => {
    removeDownloadedSongs(data.song.map((song: { id: string }) => song.id));
  };

  if (isLoading) {
    return <CenterLoader />;
  }

  if (isError) {
    return <span>Error: {error?.message}</span>;
  }

  // Offline (FIX A): effectiveOffline forces isLoading/isError to false above
  // regardless of whether the album was actually found in the local
  // snapshot -- this is a separate, explicit guard for that case, not folded
  // into isError (which means "the online query failed", a different thing).
  // Without it, the JSX below dereferences `data.xxx` unconditionally and
  // crashes when the album isn't in the local snapshot (deleted server-side
  // since last sync, a stale/invalid albumId, or offline triggered before
  // the first sync completes). Mirrors PodcastChannelView.tsx's existing
  // "not found" pattern.
  if (!data) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
        {t('Album not found.')}
      </div>
    );
  }

  return (
    <>
      <GenericPage
        contentZIndex={1}
        hideDivider
        header={
          <GenericPageHeader
            image={
              <Card
                title="None"
                subtitle=""
                coverArt={isAlbumImageCached ? albumImagePath : data.image}
                size={200}
                hasHoverButtons
                noInfoPanel
                noModalButton
                details={data}
                playClick={{ type: 'album', id: data.id }}
                url={`/library/album/${data.id}`}
                handleFavorite={() =>
                  effectiveOffline
                    ? notifyToast('warning', t("Favorite status isn't available offline"))
                    : handleFavorite(data, {
                        custom: () =>
                          queryClient.setQueryData(['album', id], {
                            ...data,
                            starred: data?.starred ? undefined : Date.now(),
                          }),
                      })
                }
              />
            }
            cacheImages={{
              enabled: settings.get<'cacheImages'>('cacheImages') ?? false,
              cacheType: 'album',
              id: data.albumId,
            }}
            imageHeight={200}
            title={data.title}
            showTitleTooltip
            subtitle={
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <PageHeaderSubtitleDataLine $top $overflow>
                  <StyledLink onClick={() => navigate('/library/album')}>{t('Album')}</StyledLink>{' '}
                  {data.albumArtist && (
                    <>
                      {t('by')}{' '}
                      <LinkWrapper $maxWidth="20vw">
                        <StyledLink
                          onClick={() => navigate(`/library/artist/${data.albumArtistId}`)}
                        >
                          <strong>{data.albumArtist}</strong>
                        </StyledLink>
                      </LinkWrapper>
                    </>
                  )}{' '}
                  • {t('{{count}} songs', { count: data.songCount })},{' '}
                  {formatDuration(data.duration)}
                  {data.year && (
                    <>
                      {' • '}
                      {data.year}
                    </>
                  )}
                </PageHeaderSubtitleDataLine>
                <PageHeaderSubtitleDataLine
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
                            onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
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
                                    setPagination({ listType: Item.Album, data: { activePage: 1 } })
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
                <PageHeaderSubtitleDataLine $overflow>
                  {t('Added {{val, datetime}}', { val: formatDate(data.created) })}
                </PageHeaderSubtitleDataLine>
                <div style={{ marginTop: '20px' }}>
                  <ButtonToolbar>
                    <PlayButton
                      appearance="primary"
                      size="lg"
                      $circle
                      data-testid="album-play-button"
                      onClick={() => handlePlayQueueAdd({ byData: data.song, play: Play.Play })}
                    />
                    <PlayAppendNextButton
                      appearance="subtle"
                      size="lg"
                      onClick={() => handlePlayQueueAdd({ byData: data.song, play: Play.Next })}
                    />
                    <PlayAppendButton
                      appearance="subtle"
                      size="lg"
                      onClick={() => handlePlayQueueAdd({ byData: data.song, play: Play.Later })}
                    />
                    <FavoriteButton
                      size="lg"
                      appearance="subtle"
                      isFavorite={data.starred}
                      disabled={effectiveOffline}
                      tooltipText={
                        effectiveOffline ? t("Favorite status isn't available offline") : undefined
                      }
                      onClick={() =>
                        handleFavorite(data, {
                          custom: () =>
                            queryClient.setQueryData(['album', id], {
                              ...data,
                              starred: data?.starred ? undefined : Date.now(),
                            }),
                        })
                      }
                    />
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
                      onClick={() => requestCopyConfirmation(() => handleCopyLinks())}
                    />
                  </ButtonToolbar>
                </div>
              </div>
            }
          />
        }
      >
        <ListViewType
          data={misc.searchQuery !== '' ? filteredData : data.song}
          tableColumns={config.lookAndFeel.listView.music.columns}
          handleRowClick={handleRowClick}
          handleRowDoubleClick={handleRowDoubleClick}
          handleRating={(rowData: RowDataType, rating: number) =>
            handleRating(rowData, { queryKey: ['album', albumId], rating })
          }
          virtualized
          rowHeight={Number(settings.get('musicListRowHeight'))}
          fontSize={Number(settings.get('musicListFontSize'))}
          cacheImages={{
            enabled: settings.get<'cacheImages'>('cacheImages'),
            cacheType: 'album',
            cacheIdProperty: 'albumId',
          }}
          page="albumPage"
          listType="music"
          isModal={rest.isModal}
          disabledContextMenuOptions={[
            'removeSelected',
            'moveSelectedTo',
            'deletePlaylist',
            'viewInModal',
          ]}
          handleFavorite={(rowData: RowDataType) =>
            handleFavorite(rowData, { queryKey: ['album', id] })
          }
        />
      </GenericPage>
      {confirmCopyModal}
    </>
  );
};

export default AlbumView;
