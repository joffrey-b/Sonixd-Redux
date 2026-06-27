import React, { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';
import { ButtonToolbar, Content, FlexboxGrid } from 'rsuite';
import ArrowLeftLineIcon from '@rsuite/icons/legacy/ArrowLeftLine';
import ArrowRightLineIcon from '@rsuite/icons/legacy/ArrowRightLine';
import Sidebar from './Sidebar';
import Titlebar from './Titlebar';
import { RootContainer, RootFooter, MainContainer } from './styled';
import { setContextMenu } from '../../redux/miscSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { clearSelected } from '../../redux/multiSelectSlice';
import { StyledButton } from '../shared/styled';
import { setSidebar } from '../../redux/configSlice';
import SearchBar from '../search/SearchBar';
import { settings } from '../shared/bridge';
import useIsCached from '../../hooks/useIsCached';

interface LayoutProps {
  footer?: React.ReactNode;
  children?: React.ReactNode;
  disableSidebar?: boolean;
}

const Layout = ({ footer, children, disableSidebar }: LayoutProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const multiSelect = useAppSelector((state) => state.multiSelect);
  const playQueue = useAppSelector((state) => state.playQueue);
  const [dynamicBgSrc, setDynamicBgSrc] = useState('');

  // The cached-path check needs to run through useIsCached (a hook), so it has to be
  // computed unconditionally here rather than inside the effect below -- an empty
  // string disables the underlying query (see useIsCached) when there's nothing to check.
  const dynamicBgImage = playQueue.current?.image;
  const dynamicBgCachedPath =
    misc.dynamicBackground && dynamicBgImage && !dynamicBgImage.includes('placeholder')
      ? `${misc.imageCachePath}album_${playQueue.current?.albumId}.jpg`
      : '';
  const isDynamicBgCached = useIsCached(dynamicBgCachedPath);

  useEffect(() => {
    if (!misc.dynamicBackground) {
      setDynamicBgSrc('');
      return;
    }
    const image = dynamicBgImage;
    if (!image || image.includes('placeholder')) {
      setDynamicBgSrc('');
      return;
    }
    const cssCachedPath = dynamicBgCachedPath.replaceAll('\\', '/');
    const serverPath = image.replace(/size=\d+/, 'size=500');
    if (!isDynamicBgCached) {
      const preloadImage = new Image();
      preloadImage.src = serverPath;
    }
    setDynamicBgSrc(isDynamicBgCached ? cssCachedPath : serverPath);
  }, [
    misc.imageCachePath,
    misc.dynamicBackground,
    dynamicBgImage,
    dynamicBgCachedPath,
    isDynamicBgCached,
  ]);

  useHotkeys(config.hotkeys.navigateBack, () => navigate(-1), { preventDefault: true }, [
    config.hotkeys.navigateBack,
  ]);

  const handleToggle = () => {
    settings.set('sidebar.expand', !config.lookAndFeel.sidebar.expand);
    dispatch(setSidebar({ expand: !config.lookAndFeel.sidebar.expand }));
  };

  const handleSidebarSelect = (e: string) => {
    let route;
    const navItem = String(e);
    switch (navItem) {
      case 'discover':
        route = '/';
        break;
      case 'nowplaying':
        route = '/nowplaying';
        break;
      case 'playlists':
        route = '/playlist';
        break;
      case 'smartplaylists':
        route = '/smartplaylists';
        break;
      case 'radio':
        route = '/radio';
        break;
      case 'podcasts':
        route = '/podcasts';
        break;
      case 'starred':
        route = '/starred';
        break;
      case 'albums':
        route = '/library/album';
        break;
      case 'music':
        route = '/library/music';
        break;
      case 'artists':
        route = '/library/artist';
        break;
      case 'genres':
        route = '/library/genre';
        break;
      case 'folders':
        route = '/library/folder';
        break;
      case 'config':
        route = '/config';
        break;
      default:
        route = '/';
        break;
    }

    navigate(route);
  };

  return (
    <>
      <Titlebar />
      <Sidebar
        expand={config.lookAndFeel.sidebar.expand}
        handleToggle={handleToggle}
        handleSidebarSelect={handleSidebarSelect}
        disableSidebar={disableSidebar ?? false}
        titleBar={misc.titleBar}
        onClick={() => {
          if (misc.contextMenu.show === true) {
            dispatch(
              setContextMenu({
                show: false,
              })
            );
          }
          if (multiSelect.selected.length > 0 && !multiSelect.isSelectDragging) {
            dispatch(clearSelected());
          }
        }}
      />
      <RootContainer
        id="container-root"
        onClick={() => {
          if (misc.contextMenu.show === true) {
            dispatch(
              setContextMenu({
                show: false,
              })
            );
          }
        }}
      >
        {dynamicBgSrc && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: 'calc(100% - 98px)',
              backgroundImage: `url("${dynamicBgSrc.replace(/"/g, '%22')}")`,
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'cover',
              opacity: 0.3,
              filter: 'blur(50px) brightness(0.8)',
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
        )}
        <MainContainer
          id="container-main"
          expanded={config.lookAndFeel.sidebar.expand}
          $sidebarwidth={config.lookAndFeel.sidebar.width}
          $titleBar={misc.titleBar} // transient prop to determine margin
        >
          <FlexboxGrid
            justify="space-between"
            style={{
              zIndex: 2,
              padding: '0 10px 0 10px',
              margin: '10px 5px 5px 5px',
            }}
          >
            {!disableSidebar && (
              <>
                <FlexboxGrid.Item>
                  <ButtonToolbar aria-label="history">
                    <StyledButton
                      aria-label="navigate back"
                      appearance="subtle"
                      size="sm"
                      onClick={() => navigate(-1)}
                    >
                      <ArrowLeftLineIcon />
                    </StyledButton>
                    <StyledButton
                      aria-label="navigate forward"
                      appearance="subtle"
                      size="sm"
                      onClick={() => navigate(1)}
                    >
                      <ArrowRightLineIcon />
                    </StyledButton>
                  </ButtonToolbar>
                </FlexboxGrid.Item>
                <FlexboxGrid.Item>
                  <ButtonToolbar>
                    <SearchBar />
                  </ButtonToolbar>
                </FlexboxGrid.Item>
              </>
            )}
          </FlexboxGrid>

          <Content id="container-content" role="main">
            {children}
          </Content>
        </MainContainer>
        <RootFooter id="container-footer">{footer}</RootFooter>
      </RootContainer>
    </>
  );
};

export default Layout;
