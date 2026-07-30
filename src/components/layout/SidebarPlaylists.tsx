import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { List } from 'react-window';
import styled from 'styled-components';
import { apiController } from '../../api/controller';
import { useAppSelector } from '../../redux/hooks';
import { selectEffectiveOffline } from '../../redux/connectivitySlice';
import usePlaylistsCache from '../../hooks/usePlaylistsCache';
import { playlistCacheEntryToPlaylist } from '../../shared/offlineLibrary';
import CenterLoader from '../loader/CenterLoader';
import { StyledButton } from '../shared/styled';

const ListItemContainer = styled.div`
  .rs-btn {
    padding-left: 20px;
    padding-right: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    text-align: left;
    color: var(--app-sidebar-btn) !important;

    &:hover {
      color: var(--app-sidebar-btn-hover) !important;
    }

    &:focus-visible {
      color: var(--app-sidebar-btn-hover) !important;
    }
  }
`;

type PlaylistEntry = { id: string; title: string };

interface PlaylistRowExtraProps {
  data: PlaylistEntry[];
}

const PlaylistRow = ({
  ariaAttributes,
  data,
  index,
  style,
}: {
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
  index: number;
  style: React.CSSProperties;
} & PlaylistRowExtraProps) => {
  const navigate = useNavigate();

  return (
    <ListItemContainer style={style} {...ariaAttributes}>
      <StyledButton
        block
        appearance="subtle"
        onClick={() => navigate(`/playlist/${data[index].id}`)}
      >
        {data[index].title}
      </StyledButton>
    </ListItemContainer>
  );
};

const SidebarPlaylists = ({ width }: { width?: number }) => {
  const config = useAppSelector((state) => state.config);
  const effectiveOffline = useAppSelector(selectEffectiveOffline);
  const { getCachedPlaylists } = usePlaylistsCache();

  const { isLoading: onlineIsLoading, data: onlinePlaylists } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiController({ serverType: config.serverType, endpoint: 'getPlaylists' }),
    enabled: !effectiveOffline,
  });

  // Mirrors PlaylistList.tsx's offline-browsing fallback (ADR Section 5.2/5.3)
  // -- without this, the sidebar's playlist entries silently disappeared
  // while offline even though the main Playlists page correctly fell back
  // to the cache, since this query had no offline branch of its own.
  const offlinePlaylists = useMemo(() => {
    if (!effectiveOffline) return undefined;
    return getCachedPlaylists().map(playlistCacheEntryToPlaylist);
  }, [effectiveOffline, getCachedPlaylists]);

  const playlists = effectiveOffline ? offlinePlaylists : onlinePlaylists;
  const isLoading = effectiveOffline ? false : onlineIsLoading;

  if (isLoading) return <CenterLoader absolute />;

  return (
    <AutoSizer
      renderProp={({ height }) => (
        <List<PlaylistRowExtraProps>
          rowCount={playlists?.length ?? 0}
          rowHeight={35}
          rowProps={{ data: playlists ?? [] }}
          rowComponent={PlaylistRow}
          style={{ height: (height ?? 0) - 25, width }}
        />
      )}
    />
  );
};

export default SidebarPlaylists;
