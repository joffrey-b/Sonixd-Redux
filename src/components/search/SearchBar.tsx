import _ from 'lodash';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate, useLocation } from 'react-router-dom';
import { ButtonGroup, Loader, Whisper } from 'rsuite';
import CloseIcon from '@rsuite/icons/legacy/Close';
import MinusSquareOIcon from '@rsuite/icons/legacy/MinusSquareO';
import PlusSquareOIcon from '@rsuite/icons/legacy/PlusSquareO';
import SearchIcon from '@rsuite/icons/legacy/Search';
import ThumbTackIcon from '@rsuite/icons/legacy/ThumbTack';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { setSearchQuery } from '../../redux/miscSlice';
import { apiController } from '../../api/controller';
import {
  StyledButton,
  StyledCheckbox,
  StyledInput,
  StyledInputGroup,
  StyledInputGroupButton,
} from '../shared/styled';
import { Album, Artist, Item, Song, Play } from '../../types';
import type { WhisperInstance } from 'rsuite/Whisper';

interface SearchPage {
  song: { data: Song[]; nextCursor: number | undefined };
  album: { data: Album[]; nextCursor: number | undefined };
  artist: { data: Artist[]; nextCursor: number | undefined };
}
import Popup from '../shared/Popup';
import { PlayAppendButton, PlayAppendNextButton, PlayButton } from '../shared/ToolbarButtons';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';

const SearchContainer = styled.div`
  height: 100%;

  .rs-input-group {
    position: sticky;
    top: 0;
    z-index: 60;
  }
  .rs-input {
    border-radius: 0px !important;
  }

  .rs-btn {
    border-radius: 0px !important;
    position: sticky;
    bottom: 0;
    left: 0;
  }

  .search-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .rs-checkbox {
      display: inline-block;
    }
  }
`;

const SectionTitle = styled.div`
  background: var(--rs-bg-subtle);
  display: flex;
  justify-content: space-between;
  user-select: none;
  z-index: 50;
  margin-top: 4px;

  .rs-btn {
    font-size: 14px;
    line-height: 14px;
    padding: 5px;

    .rs-icon {
      font-size: 12px;
      margin-right: 10px;
    }
  }
`;

const SectionResults = styled.div<{ $show: boolean }>`
  display: ${(props) => (props.$show ? 'block' : 'none')};

  .rs-btn {
    text-align: center;
  }
`;

const SearchResultContainer = styled.div`
  display: grid;
  grid-template-columns: 4.5fr 1fr;
  grid-template-rows: 1fr;
  gap: 0px 0px;
  align-self: center;
  padding: 5px;

  &:hover {
    cursor: pointer;
    background-color: var(--app-selected-row) !important;

    .search-result-details {
      padding-right: 110px;
    }

    .search-controls {
      display: flex;
    }
  }

  .search-result {
    display: grid;
    grid-template-columns: 0.5fr 5.5fr;
    grid-template-rows: 1fr;
    gap: 0px 0px;
    grid-template-areas: 'search-result-cover search-result-details';
    grid-area: 1 / 1 / 2 / 3;
    user-select: none;
  }

  .search-result-details {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 0px 0px;
    grid-template-areas:
      'search-result-details-top'
      'search-result-details-bottom';
    grid-area: search-result-details;

    width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .search-result-details-top {
    grid-area: search-result-details-top;
    width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .search-result-details-bottom {
    grid-area: search-result-details-bottom;
    width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .search-result-cover {
    grid-area: search-result-cover;
    text-align: center;
    width: 50px;
  }

  .search-controls {
    grid-area: 1 / 2 / 2 / 3;
    display: none;
    justify-content: flex-end;
    align-self: center;
  }
`;

interface PlayQueueAddOptions {
  byData?: Song[];
  byItemType?: { item: Item; id: string };
  play: Play;
}

const SearchResult = ({
  entry,
  handleClick,
  title,
  details,
  handlePlay,
}: {
  entry: Song | Album | Artist;
  handleClick: (entry: Song | Album | Artist) => void;
  title: React.ReactNode;
  details: React.ReactNode;
  handlePlay: (options: PlayQueueAddOptions) => void;
}) => {
  return (
    <SearchResultContainer>
      <div
        className="search-result"
        role="button"
        tabIndex={0}
        onClick={() => handleClick(entry)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick(entry);
        }}
      >
        <div className="search-result-details">
          <div className="search-result-details-top">{title}</div>
          <div className="search-result-details-bottom">{details}</div>
        </div>
        <div className="search-result-cover">
          <LazyLoadImage src={entry.image} width="40" height="40" />
        </div>
      </div>
      <div className="search-controls">
        <ButtonGroup>
          <PlayButton
            size="sm"
            appearance="subtle"
            onClick={() => {
              if (entry.type === Item.Music) {
                handlePlay({ byData: [entry as Song], play: Play.Play });
              } else if (entry.type) {
                handlePlay({ byItemType: { item: entry.type, id: entry.id }, play: Play.Play });
              }
            }}
          />
          <PlayAppendNextButton
            size="sm"
            appearance="subtle"
            onClick={() => {
              if (entry.type === Item.Music) {
                handlePlay({ byData: [entry as Song], play: Play.Next });
              } else if (entry.type) {
                handlePlay({ byItemType: { item: entry.type, id: entry.id }, play: Play.Next });
              }
            }}
          />
          <PlayAppendButton
            size="sm"
            appearance="subtle"
            onClick={() => {
              if (entry.type === Item.Music) {
                handlePlay({ byData: [entry as Song], play: Play.Later });
              } else if (entry.type) {
                handlePlay({ byItemType: { item: entry.type, id: entry.id }, play: Play.Later });
              }
            }}
          />
        </ButtonGroup>
      </div>
    </SearchResultContainer>
  );
};

const SearchBar = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const config = useAppSelector((state) => state.config);
  const folder = useAppSelector((state) => state.folder);
  const queryClient = useQueryClient();
  const searchPopupRef = useRef<WhisperInstance | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [openSearch, setOpenSearch] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [musicFolder, setMusicFolder] = useState<{ loaded: boolean; id: string | undefined }>({
    loaded: false,
    id: undefined,
  });
  const [searchOptions, setSearchOptions] = useState<{
    global: boolean;
    local: boolean;
    songs: boolean;
    albums: boolean;
    artists: boolean;
  }>(
    JSON.parse(
      localStorage.getItem('search') ||
        '{"global":true,"local":false,"songs":true,"albums":true,"artists":true}'
    )
  );

  useHotkeys(config.hotkeys.search ?? '', () => {
    if (location?.pathname?.match('/search')) {
      setTimeout(() => {
        const searchInputBar = document.getElementById('local-search-input') as HTMLInputElement;
        searchInputBar?.focus();
        searchInputBar?.select();
      }, 100);
    } else {
      setOpenSearch(true);
      setTimeout(() => {
        const searchInputBar = document.getElementById('global-search-input') as HTMLInputElement;
        searchInputBar?.focus();
        searchInputBar?.select();
      }, 100);
    }
  });

  const { handlePlayQueueAdd } = usePlayQueueHandler();

  useHotkeys('escape', () => {
    setOpenSearch(false);
  });

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
        if (searchOptions.local) {
          dispatch(setSearchQuery(e));
        }
      }, 300),
    [dispatch, searchOptions]
  );

  useEffect(() => {
    if (openSearch) {
      searchPopupRef.current?.open();
    } else {
      searchPopupRef.current?.close();
    }
  }, [openSearch]);

  const closeSearch = () => {
    setDebouncedSearchQuery('');
    dispatch(setSearchQuery('')); // Handles the search query sent for local page search
    queryClient.removeQueries({ queryKey: ['search'] }); // Retrieve fresh data on search bar open
    setOpenSearch(false);
  };

  const [pinned, setPinned] = useState(() => localStorage.getItem('searchPinned') === 'true');

  useEffect(() => {
    localStorage.setItem('search', JSON.stringify(searchOptions));
  }, [searchOptions]);

  useEffect(() => {
    localStorage.setItem('searchPinned', String(pinned));
  }, [pinned]);

  const {
    data: songResults,
    isLoading: isLoadingSongs,
    isRefetching: isRefetchingSongs,
    fetchNextPage: fetchNextSongPage,
    isFetchingNextPage: isFetchingNextSongPage,
    hasNextPage: hasNextSongPage,
  } = useInfiniteQuery<SearchPage, Error>({
    queryKey: ['search', debouncedSearchQuery, { type: Item.Music, count: 3 }, musicFolder.id],
    queryFn: ({ pageParam }) =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getSearch',
        args: {
          query: debouncedSearchQuery,
          songCount: 3,
          songOffset: pageParam,
          albumCount: 0,
          artistCount: 0,
          musicFolderId: musicFolder.id,
        },
      }),
    initialPageParam: 0,
    enabled: debouncedSearchQuery !== '' && searchOptions.global && musicFolder.loaded,
    getNextPageParam: (lastPage) => lastPage.song.nextCursor,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: albumResults,
    isLoading: isLoadingAlbums,
    isRefetching: isRefetchingAlbums,
    fetchNextPage: fetchNextAlbumPage,
    isFetchingNextPage: isFetchingNextAlbumPage,
    hasNextPage: hasNextAlbumPage,
  } = useInfiniteQuery<SearchPage, Error>({
    queryKey: ['search', debouncedSearchQuery, { type: Item.Album, count: 3 }, musicFolder.id],
    queryFn: ({ pageParam }) =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getSearch',
        args: {
          query: debouncedSearchQuery,
          albumCount: 3,
          albumOffset: pageParam,
          songCount: 0,
          artistCount: 0,
          musicFolderId: musicFolder.id,
        },
      }),
    initialPageParam: 0,
    enabled: debouncedSearchQuery !== '' && searchOptions.global && musicFolder.loaded,
    getNextPageParam: (lastPage) => lastPage.album.nextCursor,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: artistResults,
    isLoading: isLoadingArtists,
    isRefetching: isRefetchingArtists,
    fetchNextPage: fetchNextArtistPage,
    isFetchingNextPage: isFetchingNextArtistPage,
    hasNextPage: hasNextArtistPage,
  } = useInfiniteQuery<SearchPage, Error>({
    queryKey: ['search', debouncedSearchQuery, { type: Item.Artist, count: 3 }, musicFolder.id],
    queryFn: ({ pageParam }) =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getSearch',
        args: {
          query: debouncedSearchQuery,
          artistCount: 3,
          artistOffset: pageParam,
          songCount: 0,
          albumCount: 0,
          musicFolderId: musicFolder.id,
        },
      }),
    initialPageParam: 0,
    enabled: debouncedSearchQuery !== '' && searchOptions.global && musicFolder.loaded,
    getNextPageParam: (lastPage) => lastPage.artist.nextCursor,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = [
    isLoadingSongs,
    isLoadingAlbums,
    isLoadingArtists,
    isRefetchingSongs,
    isRefetchingAlbums,
    isRefetchingArtists,
  ].some((q) => q);

  return (
    <Whisper
      ref={searchPopupRef}
      onClose={closeSearch}
      trigger="none"
      placement="leftStart"
      preventOverflow
      enterable
      speaker={
        <Popup
          style={{
            width: '620px',
            maxHeight: '80vh',
            minHeight: '50px',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '0px',
          }}
        >
          <SearchContainer data-testid="search-results-popup">
            <StyledInputGroup inside style={{ marginBottom: '6px' }}>
              <StyledInput
                ref={searchInputRef}
                placeholder={t('Search')}
                size="sm"
                id="global-search-input"
                data-testid="search-input"
                onChange={(e: string) => {
                  setSearch(e);
                  debouncedSearchHandler(e);
                }}
                onPressEnter={() => {
                  if (search) {
                    navigate(`/search?query=${search}`);
                  }
                  closeSearch();
                }}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Escape') {
                    closeSearch();
                  }
                }}
                spellCheck="false"
              />
              <StyledInputGroupButton
                $height={30}
                appearance="subtle"
                tabIndex={0}
                onClick={closeSearch}
                onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    closeSearch();
                  }
                }}
              >
                {isLoading ? <Loader size="xs" /> : <CloseIcon />}
              </StyledInputGroupButton>
            </StyledInputGroup>
            <div
              className="search-options"
              style={{ padding: '6px 12px 4px', boxSizing: 'border-box' }}
            >
              <div>
                <StyledCheckbox
                  defaultChecked={searchOptions.global}
                  onChange={(_v: unknown, e: boolean) => {
                    setSearchOptions({ ...searchOptions, global: e });
                  }}
                  checked={searchOptions.global}
                >
                  {t('Search library')}
                </StyledCheckbox>
                <StyledCheckbox
                  defaultChecked={searchOptions.local}
                  onChange={(_v: unknown, e: boolean) => {
                    setSearchOptions({ ...searchOptions, local: e });
                    dispatch(setSearchQuery(e ? debouncedSearchQuery : ''));
                  }}
                  checked={searchOptions.local}
                >
                  {t('Search page')}
                </StyledCheckbox>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <StyledButton size="xs" appearance="subtle" onClick={() => setPinned(!pinned)}>
                  <span style={{ color: pinned ? 'var(--app-primary)' : undefined }}>
                    <ThumbTackIcon />
                  </span>
                </StyledButton>
                <StyledButton
                  size="xs"
                  appearance="subtle"
                  onClick={() => {
                    return [searchOptions.albums, searchOptions.songs, searchOptions.artists].some(
                      (v) => v
                    )
                      ? setSearchOptions({
                          ...searchOptions,
                          songs: false,
                          albums: false,
                          artists: false,
                        })
                      : setSearchOptions({
                          ...searchOptions,
                          songs: true,
                          albums: true,
                          artists: true,
                        });
                  }}
                >
                  {[searchOptions.albums, searchOptions.songs, searchOptions.artists].some((v) => v)
                    ? t('Collapse')
                    : t('Expand')}
                </StyledButton>
              </div>
            </div>

            {debouncedSearchQuery !== '' ? (
              <>
                {(songResults?.pages[0]?.song?.data?.length ?? 0) < 1 &&
                (albumResults?.pages[0]?.album?.data?.length ?? 0) < 1 &&
                (artistResults?.pages[0]?.artist?.data?.length ?? 0) < 1 ? (
                  <div style={{ padding: '0 10px' }}>{t('No results found')}</div>
                ) : (
                  <>
                    {(artistResults?.pages[0]?.artist.data.length ?? 0) > 0 &&
                      searchOptions.global && (
                        <>
                          <SectionTitle>
                            <StyledButton
                              size="xs"
                              appearance="subtle"
                              onClick={() =>
                                setSearchOptions({
                                  ...searchOptions,
                                  artists: !searchOptions.artists,
                                })
                              }
                            >
                              {searchOptions.artists ? <MinusSquareOIcon /> : <PlusSquareOIcon />}
                              {t('Artists')}
                            </StyledButton>

                            <StyledButton
                              size="xs"
                              appearance="subtle"
                              onClick={fetchNextArtistPage}
                              disabled={!hasNextArtistPage}
                              loading={isFetchingNextArtistPage}
                            >
                              {t('Load more')}
                            </StyledButton>
                          </SectionTitle>
                          <SectionResults $show={searchOptions.artists}>
                            {artistResults?.pages?.map((group: SearchPage, i: number) => (
                              <React.Fragment key={`${i}-artists`}>
                                {group.artist.data.map((entry: Artist) => (
                                  <SearchResult
                                    key={entry.uniqueId}
                                    entry={entry}
                                    handleClick={(lineEntry) => {
                                      navigate(`/library/artist/${lineEntry.id}`);
                                      if (!pinned) closeSearch();
                                    }}
                                    handlePlay={handlePlayQueueAdd}
                                    title={<>{entry.title}</>}
                                    details={
                                      <>
                                        {entry.albumCount && `${entry.albumCount} ${t(' albums')}`}
                                      </>
                                    }
                                  />
                                ))}
                              </React.Fragment>
                            ))}
                          </SectionResults>
                        </>
                      )}

                    {(albumResults?.pages[0]?.album.data.length ?? 0) > 0 &&
                      searchOptions.global && (
                        <>
                          <SectionTitle>
                            <StyledButton
                              size="xs"
                              appearance="subtle"
                              onClick={() =>
                                setSearchOptions({
                                  ...searchOptions,
                                  albums: !searchOptions.albums,
                                })
                              }
                            >
                              {searchOptions.albums ? <MinusSquareOIcon /> : <PlusSquareOIcon />}
                              {t('Albums')}
                            </StyledButton>
                            <StyledButton
                              size="xs"
                              appearance="subtle"
                              onClick={fetchNextAlbumPage}
                              disabled={!hasNextAlbumPage}
                              loading={isFetchingNextAlbumPage}
                            >
                              {t('Load more')}
                            </StyledButton>
                          </SectionTitle>
                          <SectionResults $show={searchOptions.albums}>
                            {albumResults?.pages?.map((group: SearchPage, i: number) => (
                              <React.Fragment key={`${i}-albums`}>
                                {group.album.data.map((entry: Album) => (
                                  <SearchResult
                                    key={entry.uniqueId}
                                    entry={entry}
                                    handleClick={(lineEntry) => {
                                      navigate(`/library/album/${lineEntry.id}`);
                                      if (!pinned) closeSearch();
                                    }}
                                    handlePlay={handlePlayQueueAdd}
                                    title={<>{entry.title}</>}
                                    details={
                                      <>
                                        {_.compact([entry.year, entry.albumArtist]).map(
                                          (val, index: number) => (
                                            <React.Fragment key={`${index}-albums-details`}>
                                              {val && (
                                                <>
                                                  {index > 0 && ' • '}
                                                  {val}
                                                </>
                                              )}
                                            </React.Fragment>
                                          )
                                        )}
                                      </>
                                    }
                                  />
                                ))}
                              </React.Fragment>
                            ))}
                          </SectionResults>
                        </>
                      )}

                    {(songResults?.pages[0]?.song.data.length ?? 0) > 0 && searchOptions.global && (
                      <>
                        <SectionTitle>
                          <StyledButton
                            size="xs"
                            appearance="subtle"
                            onClick={() =>
                              setSearchOptions({ ...searchOptions, songs: !searchOptions.songs })
                            }
                          >
                            {searchOptions.songs ? <MinusSquareOIcon /> : <PlusSquareOIcon />}
                            {t('Songs')}
                          </StyledButton>
                          <StyledButton
                            size="xs"
                            appearance="subtle"
                            onClick={fetchNextSongPage}
                            disabled={!hasNextSongPage}
                            loading={isFetchingNextSongPage}
                          >
                            {t('Load more')}
                          </StyledButton>
                        </SectionTitle>
                        <SectionResults $show={searchOptions.songs}>
                          {songResults?.pages?.map((group: SearchPage, i: number) => (
                            <React.Fragment key={`${i}-songs`}>
                              {group.song.data.map((entry: Song) => (
                                <SearchResult
                                  key={entry.uniqueId}
                                  entry={entry}
                                  handleClick={(lineEntry) => {
                                    navigate(`/library/album/${(lineEntry as Song).albumId}`);
                                    if (!pinned) closeSearch();
                                  }}
                                  handlePlay={handlePlayQueueAdd}
                                  title={<>{entry.title}</>}
                                  details={
                                    <>
                                      {_.compact([entry.year, entry.albumArtist, entry.album]).map(
                                        (val, index: number) => (
                                          <React.Fragment key={`${index}-songs-details`}>
                                            {val && (
                                              <>
                                                {index > 0 && ' • '}
                                                {val}
                                              </>
                                            )}
                                          </React.Fragment>
                                        )
                                      )}
                                    </>
                                  }
                                />
                              ))}
                            </React.Fragment>
                          ))}
                        </SectionResults>
                      </>
                    )}

                    <StyledButton
                      data-testid="search-view-all-button"
                      size="sm"
                      block
                      appearance="primary"
                      onClick={() => {
                        if (debouncedSearchQuery.trim()) {
                          navigate(`/search?query=${debouncedSearchQuery}`);
                        }
                        closeSearch();
                      }}
                    >
                      {t('View all results')}
                    </StyledButton>
                  </>
                )}
              </>
            ) : (
              <></>
            )}
          </SearchContainer>
        </Popup>
      }
    >
      <span style={{ display: 'inline-block' }}>
        <StyledButton
          aria-label="search"
          data-testid="nav-search"
          onClick={() => {
            setOpenSearch(true);
            setTimeout(() => {
              const searchInput = document.getElementById(
                'global-search-input'
              ) as HTMLInputElement;
              searchInput.focus();
              searchInput.select();
            }, 50);
          }}
          appearance="subtle"
        >
          <SearchIcon />
        </StyledButton>
      </span>
    </Whisper>
  );
};

export default SearchBar;
