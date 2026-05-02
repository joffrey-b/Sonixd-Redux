import React from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useHistory } from 'react-router-dom';
import { ButtonToolbar, Content, FlexboxGrid, Icon } from 'rsuite';
import Sidebar from './Sidebar';
import Titlebar from './Titlebar';
import { RootContainer, RootFooter, MainContainer } from './styled';
import { setContextMenu } from '../../redux/miscSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { clearSelected } from '../../redux/multiSelectSlice';
import { StyledButton } from '../shared/styled';
import { setSidebar } from '../../redux/configSlice';
import SearchBar from '../search/SearchBar';
import { settings } from '../shared/setDefaultSettings';

const Layout = ({ footer, children, disableSidebar, font }: any) => {
  const history = useHistory();
  const dispatch = useAppDispatch();
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const multiSelect = useAppSelector((state) => state.multiSelect);

  useHotkeys(
    config.hotkeys.navigateBack,
    (e: KeyboardEvent) => {
      e.preventDefault();
      history.goBack();
    },
    [config.hotkeys.navigateBack]
  );

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

    history.push(route);
  };

  return (
    <>
      <Titlebar font={font} />
      <Sidebar
        expand={config.lookAndFeel.sidebar.expand}
        handleToggle={handleToggle}
        handleSidebarSelect={handleSidebarSelect}
        disableSidebar={disableSidebar}
        font={font}
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
        font={font}
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
        <MainContainer
          id="container-main"
          expanded={config.lookAndFeel.sidebar.expand}
          sidebarwidth={config.lookAndFeel.sidebar.width}
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
                      aria-label="back"
                      appearance="subtle"
                      size="sm"
                      onClick={() => history.goBack()}
                    >
                      <Icon icon="arrow-left-line" />
                    </StyledButton>
                    <StyledButton
                      aria-label="next"
                      appearance="subtle"
                      size="sm"
                      onClick={() => history.goForward()}
                    >
                      <Icon icon="arrow-right-line" />
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
