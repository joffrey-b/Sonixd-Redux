import React, { useRef } from 'react';
import { clipboard, settings, shell } from '../shared/bridge';
import { ButtonToolbar, Whisper } from 'rsuite';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RowDataType } from 'rsuite-table';
import {
  DownloadButton,
  FavoriteButton,
  PlayAppendButton,
  PlayAppendNextButton,
  PlayButton,
} from '../shared/ToolbarButtons';
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
import { LinkWrapper, StyledButton, StyledLink } from '../shared/styled';
import { PageHeaderSubtitleDataLine } from '../layout/styled';
import { apiController } from '../../api/controller';
import { Genre, Item, Play, Server } from '../../types';
import Card from '../card/Card';
import { setFilter, setPagination } from '../../redux/viewSlice';
import CenterLoader from '../loader/CenterLoader';
import useListClickHandler from '../../hooks/useListClickHandler';
import Popup from '../shared/Popup';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';

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

  const { isLoading, isError, data, error } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getAlbum',
        args: { id: albumId },
      }),
  });
  const filteredData = useSearchQuery(misc.searchQuery, data?.song, [
    'title',
    'artist',
    'album',
    'year',
    'genre',
    'path',
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

  const { handlePlayQueueAdd } = usePlayQueueHandler();
  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();

  const handleDownload = async (type: 'copy' | 'download') => {
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

      if (type === 'download') {
        downloadUrls.forEach((url) => {
          if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        });
      } else {
        clipboard.writeText(downloadUrls.join('\n'));
        notifyToast('info', t('Download links copied!'));
      }

      // If not Navidrome (this assumes Airsonic), then we need to use a song's parent
      // to download. This is because Airsonic does not support downloading via album ids
      // that are provided by /getAlbum or /getAlbumList2
    } else if (data.song[0]?.parent) {
      if (type === 'download') {
        const dlUrl = await apiController({
          serverType: config.serverType,
          endpoint: 'getDownloadUrl',
          args: { id: data.song[0].parent },
        });
        if (/^https?:\/\//i.test(dlUrl)) shell.openExternal(dlUrl);
      } else {
        clipboard.writeText(
          await apiController({
            serverType: config.serverType,
            endpoint: 'getDownloadUrl',
            args:
              config.serverType === Server.Subsonic ? { id: data.song[0].parent } : { id: data.id },
          })
        );
        notifyToast('info', t('Download links copied!'));
      }
    } else {
      notifyToast('warning', t('No parent album found'));
    }
  };

  if (isLoading) {
    return <CenterLoader />;
  }

  if (isError) {
    return <span>Error: {error.message}</span>;
  }

  return (
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
                handleFavorite(data, {
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
                      <StyledLink onClick={() => navigate(`/library/artist/${data.albumArtistId}`)}>
                        <strong>{data.albumArtist}</strong>
                      </StyledLink>
                    </LinkWrapper>
                  </>
                )}{' '}
                • {t('{{count}} songs', { count: data.songCount })}, {formatDuration(data.duration)}
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
                  <Whisper
                    trigger="hover"
                    placement="bottom"
                    delay={250}
                    enterable
                    preventOverflow
                    speaker={
                      <Popup>
                        <ButtonToolbar>
                          <StyledButton
                            data-testid="download-action-download"
                            onClick={() => handleDownload('download')}
                          >
                            {t('Download')}
                          </StyledButton>
                          <StyledButton
                            data-testid="download-action-copy"
                            onClick={() => handleDownload('copy')}
                          >
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
                      <DownloadButton
                        data-testid="download-button"
                        size="lg"
                        appearance="subtle"
                        downloadSize={getAlbumSize(data.song)}
                      />
                    </span>
                  </Whisper>
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
  );
};

export default AlbumView;
