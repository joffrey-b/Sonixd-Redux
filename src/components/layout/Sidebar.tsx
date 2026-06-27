import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useMeasure from 'react-use/lib/useMeasure';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sidenav, Nav } from 'rsuite';
import AngleLeftIcon from '@rsuite/icons/legacy/AngleLeft';
import AngleRightIcon from '@rsuite/icons/legacy/AngleRight';
import Book2Icon from '@rsuite/icons/legacy/Book2';
import DashboardIcon from '@rsuite/icons/legacy/Dashboard';
import DownIcon from '@rsuite/icons/legacy/Down';
import FolderOpenIcon from '@rsuite/icons/legacy/FolderOpen';
import GearCircleIcon from '@rsuite/icons/legacy/GearCircle';
import Globe2Icon from '@rsuite/icons/legacy/Globe2';
import HeadphonesIcon from '@rsuite/icons/legacy/Headphones';
import HeartIcon from '@rsuite/icons/legacy/Heart';
import ListUlIcon from '@rsuite/icons/legacy/ListUl';
import MagicIcon from '@rsuite/icons/legacy/Magic';
import MicrophoneIcon from '@rsuite/icons/legacy/Microphone';
import MusicIcon from '@rsuite/icons/legacy/Music';
import PeopleGroupIcon from '@rsuite/icons/legacy/PeopleGroup';
import PodcastIcon from '@rsuite/icons/legacy/Podcast';
import _ from 'lodash';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { Server } from '../../types';
import {
  FixedSidebar,
  PlaylistDivider,
  SidebarCoverArtContainer,
  SidebarDragContainer,
  SidebarNavItem,
} from './styled';
import { StyledButton } from '../shared/styled';
import { InfoModal } from '../modal/Modal';
import placeholderImg from '../../img/placeholder.png';
import SidebarPlaylists from './SidebarPlaylists';
import { setSidebar } from '../../redux/configSlice';
import { settings } from '../shared/bridge';

interface SidebarProps {
  expand: boolean;
  handleToggle: () => void;
  handleSidebarSelect: (eventKey: string) => void;
  disableSidebar: boolean;
  titleBar: string;
  onClick?: React.MouseEventHandler;
}

const Sidebar = ({
  expand,
  handleToggle,
  handleSidebarSelect,
  disableSidebar,
  titleBar,
  ...rest
}: SidebarProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const playQueue = useAppSelector((state) => state.playQueue);
  const config = useAppSelector((state) => state.config);
  const [width, setWidth] = useState(Number(config.lookAndFeel.sidebar.width.replace('px', '')));
  const [isResizing, setIsResizing] = useState(false);
  const [showCoverArtModal, setShowCoverArtModal] = useState(false);
  const [throttledWidth, setThrottledWidth] = useState(
    Number(config.lookAndFeel.sidebar.width.replace('px', ''))
  );
  const [mainNavRef, { height: mainNavHeight }] = useMeasure<HTMLDivElement>();
  const [sidebarBodyRef, { height: sidebarBodyHeight }] = useMeasure<HTMLDivElement>();

  const getSidebarWidth = useCallback((num: number) => {
    if (num < 165) {
      return 165;
    }

    if (num > 400) {
      return 400;
    }

    return num;
  }, []);

  const handleResizeMove = useMemo(
    () => _.throttle((e: MouseEvent) => setThrottledWidth(e.clientX), 25),
    []
  );

  const handleResizeEnd = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const finalWidth = `${getSidebarWidth(e?.clientX)}px`;
        dispatch(setSidebar({ width: finalWidth }));
        settings.set('sidebar.width', finalWidth);
        setIsResizing(false);
        document.body.style.cursor = 'default';
      }
    },
    [dispatch, getSidebarWidth, isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      handleResizeMove.cancel();
    };
  }, [handleResizeEnd, isResizing, handleResizeMove]);

  useEffect(() => {
    setWidth(getSidebarWidth(throttledWidth));
  }, [dispatch, getSidebarWidth, throttledWidth]);

  return (
    <>
      <FixedSidebar
        id="sidebar"
        data-testid="sidebar"
        width={expand ? `${width}px` : 56}
        $titleBar={titleBar} // transient prop to determine position
        onClick={rest.onClick}
      >
        <Sidenav style={{ height: '100%' }} expanded={expand} appearance="default">
          {expand && config.lookAndFeel.sidebar.coverArt && (
            <SidebarCoverArtContainer height={`${width}px`}>
              <LazyLoadImage
                onClick={() => setShowCoverArtModal(true)}
                src={
                  playQueue.current?.image.replace(
                    /&size=\d+|width=\d+&height=\d+&quality=\d+/,
                    ''
                  ) || placeholderImg
                }
              />
              <StyledButton
                size="xs"
                onClick={() => {
                  dispatch(setSidebar({ coverArt: false }));
                  settings.set('sidebar.coverArt', false);
                }}
              >
                <DownIcon />
              </StyledButton>
            </SidebarCoverArtContainer>
          )}

          <Sidenav.Body
            style={{
              height: expand
                ? `calc(100% - ${config.lookAndFeel.sidebar.coverArt ? width : 0}px)`
                : '100%',
              overflowY: 'auto',
            }}
          >
            <div ref={sidebarBodyRef} style={{ height: '100%' }}>
              {expand && (
                <SidebarDragContainer
                  $resizing={isResizing}
                  onMouseDown={() => {
                    setIsResizing(true);
                    document.body.style.cursor = 'w-resize';
                  }}
                />
              )}

              <Nav>
                <div ref={mainNavRef}>
                  <SidebarNavItem
                    tabIndex={0}
                    eventKey="discover"
                    icon={<DashboardIcon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('dashboard')}
                  >
                    {t('Dashboard')}
                  </SidebarNavItem>
                  <SidebarNavItem
                    tabIndex={0}
                    eventKey="nowplaying"
                    icon={<HeadphonesIcon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/nowplaying');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('nowplaying')}
                  >
                    {t('Now Playing')}
                  </SidebarNavItem>
                  <SidebarNavItem
                    tabIndex={0}
                    data-testid="nav-playlists"
                    eventKey="playlists"
                    icon={<ListUlIcon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/playlist');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('playlists')}
                  >
                    {t('Playlists')}
                  </SidebarNavItem>
                  <SidebarNavItem
                    tabIndex={0}
                    data-testid="nav-smart-playlists"
                    eventKey="smartplaylists"
                    icon={<MagicIcon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/smartplaylists');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('smartplaylists')}
                  >
                    {t('Smart Playlists')}
                  </SidebarNavItem>
                  <SidebarNavItem
                    tabIndex={0}
                    data-testid="nav-starred"
                    eventKey="starred"
                    icon={<HeartIcon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/starred');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('favorites')}
                  >
                    {t('Favorites')}
                  </SidebarNavItem>
                  {config.serverType === Server.Jellyfin && (
                    <SidebarNavItem
                      tabIndex={0}
                      eventKey="music"
                      icon={<MusicIcon />}
                      onSelect={handleSidebarSelect}
                      disabled={disableSidebar}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          navigate('/library/music');
                        }
                      }}
                      $show={config.lookAndFeel.sidebar.selected.includes('songs')}
                    >
                      {t('Songs')}
                    </SidebarNavItem>
                  )}
                  <SidebarNavItem
                    tabIndex={0}
                    data-testid="nav-albums"
                    eventKey="albums"
                    icon={<Book2Icon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/library/album');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('albums')}
                  >
                    {t('Albums')}
                  </SidebarNavItem>
                  <SidebarNavItem
                    tabIndex={0}
                    data-testid="nav-artists"
                    eventKey="artists"
                    icon={<PeopleGroupIcon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/library/artist');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('artists')}
                  >
                    {t('Artists')}
                  </SidebarNavItem>
                  <SidebarNavItem
                    tabIndex={0}
                    data-testid="nav-genres"
                    eventKey="genres"
                    icon={<Globe2Icon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/library/genre');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('genres')}
                  >
                    {t('Genres')}
                  </SidebarNavItem>
                  {(config.serverType as string) !== 'funkwhale' && (
                    <>
                      <SidebarNavItem
                        tabIndex={0}
                        data-testid="nav-folders"
                        eventKey="folders"
                        icon={<FolderOpenIcon />}
                        onSelect={handleSidebarSelect}
                        disabled={disableSidebar}
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            navigate('/library/folder');
                          }
                        }}
                        $show={config.lookAndFeel.sidebar.selected.includes('folders')}
                      >
                        {t('Folders')}
                      </SidebarNavItem>
                    </>
                  )}
                  {config.serverType !== Server.Jellyfin && (
                    <SidebarNavItem
                      data-testid="nav-internet-radio"
                      tabIndex={0}
                      eventKey="radio"
                      icon={<PodcastIcon />}
                      onSelect={handleSidebarSelect}
                      disabled={disableSidebar}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          navigate('/radio');
                        }
                      }}
                      $show={config.lookAndFeel.sidebar.selected.includes('radio')}
                    >
                      {t('Internet Radio')}
                    </SidebarNavItem>
                  )}
                  {config.serverType !== Server.Jellyfin && (
                    <SidebarNavItem
                      tabIndex={0}
                      data-testid="nav-podcasts"
                      eventKey="podcasts"
                      icon={<MicrophoneIcon />}
                      onSelect={handleSidebarSelect}
                      disabled={disableSidebar}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          navigate('/podcasts');
                        }
                      }}
                      $show={config.lookAndFeel.sidebar.selected.includes('podcasts')}
                    >
                      {t('Podcasts')}
                    </SidebarNavItem>
                  )}
                  <SidebarNavItem
                    tabIndex={0}
                    data-testid="settings-link"
                    eventKey="config"
                    icon={<GearCircleIcon />}
                    onSelect={handleSidebarSelect}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        navigate('/config');
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('config')}
                  >
                    {t('Configuration')}
                  </SidebarNavItem>
                  <SidebarNavItem
                    tabIndex={0}
                    icon={expand ? <AngleLeftIcon /> : <AngleRightIcon />}
                    onSelect={handleToggle}
                    disabled={disableSidebar}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        handleToggle();
                      }
                    }}
                    $show={config.lookAndFeel.sidebar.selected.includes('collapse')}
                  >
                    {expand ? t('Collapse') : t('Expand')}
                  </SidebarNavItem>
                </div>
              </Nav>
              {expand &&
                !disableSidebar &&
                config.lookAndFeel.sidebar.selected.includes('playlistList') && (
                  <div
                    style={{
                      height: `${
                        sidebarBodyHeight - mainNavHeight < 100
                          ? 100
                          : sidebarBodyHeight - mainNavHeight
                      }px`,
                      overflow: 'hidden',
                      overflowY: 'auto',
                    }}
                  >
                    <>
                      <PlaylistDivider />
                      <SidebarPlaylists width={width} />
                    </>
                  </div>
                )}
            </div>
          </Sidenav.Body>
        </Sidenav>
      </FixedSidebar>
      <InfoModal show={showCoverArtModal} handleHide={() => setShowCoverArtModal(false)}>
        <LazyLoadImage
          src={
            playQueue.current?.image.replace(/&size=\d+|width=\d+&height=\d+&quality=\d+/, '') ||
            placeholderImg
          }
          style={{
            width: 'auto',
            height: 'auto',
            minHeight: '50vh',
            maxHeight: '70vh',
            maxWidth: '95vw',
          }}
        />
      </InfoModal>
    </>
  );
};

export default Sidebar;
