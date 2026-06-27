import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { List } from 'react-window';
import styled from 'styled-components';
import { apiController } from '../../api/controller';
import { useAppSelector } from '../../redux/hooks';
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

  const { isLoading, data: playlists } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiController({ serverType: config.serverType, endpoint: 'getPlaylists' }),
  });

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
