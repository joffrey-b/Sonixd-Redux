import React, { useState, useEffect, Component } from 'react';
import { settings, webFrame, cacheDir, ipcRenderer } from './components/shared/bridge';
import _ from 'lodash';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from 'react-hotkeys-hook';
import { ThemeProvider, type DefaultTheme } from 'styled-components';
import { CustomProvider } from 'rsuite';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import './styles/App.global.css';
import Layout from './components/layout/Layout';
import PlaylistList from './components/playlist/PlaylistList';
import PlaylistView from './components/playlist/PlaylistView';
import SmartPlaylistList from './components/smartplaylist/SmartPlaylistList';
import InternetRadioList from './components/radio/InternetRadioList';
import PodcastList from './components/podcast/PodcastList';
import PodcastChannelView from './components/podcast/PodcastChannelView';
import Config from './components/settings/Config';
import NowPlayingView from './components/player/NowPlayingView';
import Login from './components/settings/Login';
import StarredView from './components/starred/StarredView';
import Dashboard from './components/dashboard/Dashboard';
import PlayerBar from './components/player/PlayerBar';
import AlbumView from './components/library/AlbumView';
import ArtistView from './components/library/ArtistView';
import AlbumList from './components/library/AlbumList';
import ArtistList from './components/library/ArtistList';
import GenreList from './components/library/GenreList';
import { MockFooter } from './components/settings/styled';
import { useAppDispatch, useAppSelector } from './redux/hooks';
import { setLibrarySyncedAt } from './redux/smartPlaylistSlice';
import { PageModal } from './components/modal/Modal';
import NowPlayingMiniView from './components/player/NowPlayingMiniView';
import { GlobalContextMenu } from './components/shared/ContextMenu';
import SearchView from './components/search/SearchView';
import FolderList from './components/library/FolderList';
import { getTheme, getImageCachePath, getSongCachePath } from './shared/utils';
import { mockSettings } from './shared/mockSettings';
import { defaultDark } from './styles/styledTheme';
import MusicList from './components/library/MusicList';
import { notifyToast } from './components/shared/toast';
import useCheckForUpdates from './hooks/useCheckForUpdates';
import useLibraryCache from './hooks/useLibraryCache';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '1rem',
            fontFamily: 'sans-serif',
          }}
        >
          <h2>Something went wrong</h2>
          <p style={{ color: '#888' }}>{this.state.error?.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  const { t } = useTranslation();
  const [zoomFactor, setZoomFactor] = useState(Number(localStorage.getItem('zoomFactor')) || 1.0);
  const [theme, setTheme] = useState<DefaultTheme>(defaultDark);
  const rsuiteTheme: 'dark' | 'light' = theme?.type === 'light' ? 'light' : 'dark';
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);

  useEffect(() => {
    // Only when a server is configured - skipped before login and after
    // disconnect, otherwise getRootCachePath()'s serverBase64 segment
    // resolves to the literal string "undefined", creating a spurious
    // .../sonixd-redux-cache/undefined/{image,song} folder pair.
    if (process.env.NODE_ENV !== 'test' && settings.get('serverBase64')) {
      cacheDir.ensure(getImageCachePath());
      cacheDir.ensure(getSongCachePath());
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;
    const checkMigration = async () => {
      const wasMigrated = (await ipcRenderer.invoke('check-library-cache-migration')) as boolean;
      if (wasMigrated) {
        notifyToast(
          'info',
          t(
            'libraryCache.formatReset',
            'Library cache was reset after an upgrade. Please sync your library in Smart Playlists.'
          )
        );
      }
    };
    checkMigration().catch(() => {});
  }, [t]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'test') {
      webFrame.setZoomFactor(zoomFactor);
    }
  }, [zoomFactor]);

  useHotkeys(
    'ctrl+shift+=',
    () => {
      const newZoomFactor = Math.round((zoomFactor + 0.05) * 100) / 100;
      webFrame.setZoomFactor(newZoomFactor);
      localStorage.setItem('zoomFactor', String(newZoomFactor));
      setZoomFactor(newZoomFactor);
      notifyToast('info', `${Math.round(newZoomFactor * 100)}%`);
    },
    { preventDefault: true },
    [zoomFactor]
  );

  useHotkeys(
    'ctrl+shift+-',
    () => {
      const newZoomFactor = Math.round((zoomFactor - 0.05) * 100) / 100;

      if (newZoomFactor > 0) {
        webFrame.setZoomFactor(newZoomFactor);
        localStorage.setItem('zoomFactor', String(newZoomFactor));
        setZoomFactor(newZoomFactor);
        notifyToast('info', `${Math.round(newZoomFactor * 100)}%`);
      }
    },
    { preventDefault: true },
    [zoomFactor]
  );

  useEffect(() => {
    // Themes are DefaultTheme objects with an added `value` field (the theme name).
    const themes: (DefaultTheme & { value: string })[] =
      process.env.NODE_ENV === 'test'
        ? (mockSettings.themesDefault as unknown as (DefaultTheme & { value: string })[])
        : (_.concat(settings.get('themes'), settings.get('themesDefault')) as (DefaultTheme & {
            value: string;
          })[]);

    if (misc.theme !== 'followSystem') {
      setTheme(getTheme(themes, misc.theme) || defaultDark);
      return undefined;
    }

    const apply = () => {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(getTheme(themes, isDark ? 'defaultDark' : 'defaultLight') || defaultDark);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [misc.theme]);

  useEffect(() => {
    const name = (config.lookAndFeel.font ?? 'Poppins').split(/Light|Medium/)[0].trim();
    const weight = config.lookAndFeel.font?.includes('Light')
      ? '300'
      : config.lookAndFeel.font?.includes('Medium')
        ? '500'
        : '400';
    document.body.style.setProperty('--rs-font-family-base', name);
    document.body.style.fontWeight = weight;
  }, [config.lookAndFeel.font]);

  useEffect(() => {
    if (!theme) return;
    const t = theme;
    const s = (name: string, val: unknown) =>
      document.body.style.setProperty(name, String(val ?? ''));
    s('--rs-text-primary', t.colors?.layout?.page?.color);
    s('--rs-text-secondary', t.colors?.layout?.page?.colorSecondary);
    s('--rs-checkbox-checked-bg', t.colors?.primary);
    s('--rs-radio-checked-bg', t.colors?.primary);
    s('--rs-input-bg', t.colors?.input?.background);
    s('--rs-input-disabled-bg', t.colors?.input?.backgroundHover);
    s(
      '--rs-table-header-bg',
      t?.type === 'light' ? t.colors?.layout?.sideBar?.background : 'transparent'
    );
    s('--app-primary', t.colors?.primary);
    s('--app-text', t.colors?.layout?.page?.color);
    s('--app-text-secondary', t.colors?.layout?.page?.colorSecondary);
    s('--app-bg', t.colors?.layout?.page?.background);
    s('--app-sidebar-bg', t.colors?.layout?.sideBar?.background);
    s('--app-sidebar-btn', t.colors?.layout?.sideBar?.button?.color);
    s('--app-sidebar-btn-hover', t.colors?.layout?.sideBar?.button?.colorHover);
    s('--app-titlebar-bg', t.colors?.layout?.titleBar?.background);
    s('--app-titlebar-color', t.colors?.layout?.titleBar?.color);
    s('--app-playerbar-bg', t.colors?.layout?.playerBar?.background);
    s('--app-playerbar-color', t.colors?.layout?.playerBar?.color);
    s('--app-playerbar-color-secondary', t.colors?.layout?.playerBar?.colorSecondary);
    s('--app-playerbar-btn', t.colors?.layout?.playerBar?.button?.color);
    s('--app-playerbar-btn-hover', t.colors?.layout?.playerBar?.button?.colorHover);
    s('--app-playerbar-border-top', t.other?.playerBar?.borderTop);
    s('--app-playerbar-border-right', t.other?.playerBar?.borderRight);
    s('--app-playerbar-border-bottom', t.other?.playerBar?.borderBottom);
    s('--app-playerbar-border-left', t.other?.playerBar?.borderLeft);
    s('--app-playerbar-filter', t.other?.playerBar?.filter);
    s('--app-miniplayer-bg', t.colors?.layout?.miniPlayer?.background);
    s('--app-miniplayer-height', t.other?.miniPlayer?.height);
    s('--app-miniplayer-opacity', t.other?.miniPlayer?.opacity);
    s('--app-btn-default-bg', t.colors?.button?.default?.background);
    s('--app-btn-default-bg-hover', t.colors?.button?.default?.backgroundHover);
    s('--app-btn-default-color', t.colors?.button?.default?.color);
    s('--app-btn-default-color-hover', t.colors?.button?.default?.colorHover);
    s('--app-btn-primary-color', t.colors?.button?.primary?.color);
    s('--app-btn-primary-color-hover', t.colors?.button?.primary?.colorHover);
    s('--app-btn-primary-bg-hover', t.colors?.button?.primary?.backgroundHover);
    s('--app-btn-subtle-color', t.colors?.button?.subtle?.color);
    s('--app-btn-subtle-color-hover', t.colors?.button?.subtle?.colorHover);
    s('--app-btn-subtle-bg-hover', t.colors?.button?.subtle?.backgroundHover);
    s('--app-input-bg', t.colors?.input?.background);
    s('--app-input-bg-hover', t.colors?.input?.backgroundHover);
    s('--app-input-bg-active', t.colors?.input?.backgroundActive);
    s('--app-input-color', t.colors?.input?.color);
    s('--app-input-radius', t.other?.input?.borderRadius);
    s('--app-nav-color', t.colors?.nav?.color);
    s('--app-popover-bg', t.colors?.popover?.background);
    s('--app-popover-color', t.colors?.popover?.color);
    s('--app-tooltip-bg', t.colors?.tooltip?.background);
    s('--app-tooltip-color', t.colors?.tooltip?.color);
    s('--app-tooltip-border', t.other?.tooltip?.border);
    s('--app-tooltip-radius', t.other?.tooltip?.borderRadius);
    s('--app-context-bg', t.colors?.contextMenu?.background);
    s('--app-context-bg-hover', t.colors?.contextMenu?.backgroundHover);
    s('--app-context-color', t.colors?.contextMenu?.color);
    s('--app-context-color-disabled', t.colors?.contextMenu?.colorDisabled);
    s('--app-tag-bg', t.colors?.tag?.background);
    s('--app-tag-color', t.colors?.tag?.text);
    s('--app-tag-radius', t.other?.tag?.borderRadius);
    s('--app-slider-bg', t.colors?.slider?.background);
    s('--app-slider-progress', t.colors?.slider?.progressBar);
    s('--app-selected-row', t.colors?.table?.selectedRow);
    s(
      '--app-table-header-bg',
      t?.type === 'light' ? t.colors?.layout?.sideBar?.background : 'transparent'
    );
    s('--app-card-overlay-bg', t.colors?.card?.overlayButton?.background);
    s('--app-card-overlay-bg-hover', t.colors?.card?.overlayButton?.backgroundHover);
    s('--app-card-overlay-color', t.colors?.card?.overlayButton?.color);
    s('--app-card-overlay-color-hover', t.colors?.card?.overlayButton?.colorHover);
    s('--app-card-overlay-opacity', t.colors?.card?.overlayButton?.opacity);
    s('--app-card-border', t.other?.card?.border);
    s('--app-card-hover-transform', t.other?.card?.hover?.transform);
    s('--app-card-hover-transition', t.other?.card?.hover?.transition);
    s('--app-card-hover-filter', t.other?.card?.hover?.filter);
    s('--app-card-img-top', t.other?.card?.image?.borderTop);
    s('--app-card-img-right', t.other?.card?.image?.borderRight);
    s('--app-card-img-bottom', t.other?.card?.image?.borderBottom);
    s('--app-card-img-left', t.other?.card?.image?.borderLeft);
    s('--app-card-img-radius', t.other?.card?.image?.borderRadius);
    s('--app-card-info-top', t.other?.card?.info?.borderTop);
    s('--app-card-info-right', t.other?.card?.info?.borderRight);
    s('--app-card-info-bottom', t.other?.card?.info?.borderBottom);
    s('--app-card-info-left', t.other?.card?.info?.borderLeft);
    s('--app-card-info-radius', t.other?.card?.info?.borderRadius);
    s('--app-cover-filter', t.other?.coverArtFilter);
    s('--app-cover-radius', t.other?.coverArtBorderRadius);
    s('--app-btn-radius', t.other?.button?.borderRadius);
    s('--app-panel-radius', t.other?.panel?.borderRadius);
    s('--app-font-page', t.fonts?.size?.page);
    s('--app-font-panel', t.fonts?.size?.panelTitle);
    s('--app-blur-brightness', t?.type === 'dark' ? '0.3' : '0.9');
    s('--app-blurred-bg-img', t?.type === 'light' ? '#f0f0f2' : '#0b0908');
    s('--app-blurred-bg-no-img', t?.type === 'light' ? '#e8e8eb' : '#00395A');
    s('--app-gradient-alpha', t?.type === 'dark' ? '0.2' : '0.15');
  }, [theme]);

  useCheckForUpdates();

  const dispatch = useAppDispatch();
  const { syncLibrary } = useLibraryCache();

  // Auto-sync library cache on every launch so play counts from other devices stay current.
  useEffect(() => {
    if (!settings.get('server') || !settings.get('serverBase64')) return;
    syncLibrary()
      .then(() => dispatch(setLibrarySyncedAt(new Date().toISOString())))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings.get('server') || !settings.get('serverBase64')) {
    return (
      <CustomProvider theme={rsuiteTheme}>
        <ThemeProvider theme={theme}>
          <Router>
            <ErrorBoundary>
              <Layout disableSidebar footer={<MockFooter />}>
                <Login />
              </Layout>
            </ErrorBoundary>
          </Router>
        </ThemeProvider>
      </CustomProvider>
    );
  }

  return (
    <CustomProvider theme={rsuiteTheme}>
      <ThemeProvider theme={theme}>
        <Router>
          <ErrorBoundary>
            <Layout footer={<PlayerBar />}>
              <Routes>
                <Route path="/library/music" element={<MusicList />} />
                <Route path="/library/album" element={<AlbumList />} />
                <Route path="/library/artist" element={<ArtistList />} />
                <Route path="/library/genre" element={<GenreList />} />
                <Route path="/library/artist/:id" element={<ArtistView />} />
                <Route path="/library/artist/:id/albums" element={<ArtistView />} />
                <Route path="/library/artist/:id/compilationalbums" element={<ArtistView />} />
                <Route path="/library/artist/:id/songs" element={<ArtistView />} />
                <Route path="/library/artist/:id/topsongs" element={<ArtistView />} />
                <Route path="/library/album/:id" element={<AlbumView />} />
                <Route path="/library/folder" element={<FolderList />} />
                <Route path="/library/folder/:id" element={<FolderList />} />
                <Route path="/nowplaying" element={<NowPlayingView />} />
                <Route path="/playlist/:id" element={<PlaylistView />} />
                <Route path="/playlist" element={<PlaylistList />} />
                <Route path="/smartplaylists" element={<SmartPlaylistList />} />
                <Route path="/radio" element={<InternetRadioList />} />
                <Route path="/podcasts" element={<PodcastList />} />
                <Route path="/podcasts/:id" element={<PodcastChannelView />} />
                <Route path="/starred" element={<StarredView />} />
                <Route path="/config" element={<Config />} />
                <Route path="/search" element={<SearchView />} />
                <Route path="/*" element={<Dashboard />} />
              </Routes>
            </Layout>
            <PageModal />
            <NowPlayingMiniView />
            <GlobalContextMenu />
          </ErrorBoundary>
        </Router>
      </ThemeProvider>
    </CustomProvider>
  );
};

export default App;
