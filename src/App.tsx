import React, { useState, useEffect } from 'react';
import { webFrame } from 'electron';
import _ from 'lodash';
import { useHotkeys } from 'react-hotkeys-hook';
import { ThemeProvider } from 'styled-components';
import { HashRouter as Router, Switch, Route } from 'react-router-dom';
import './styles/App.global.css';
import Layout from './components/layout/Layout';
import PlaylistList from './components/playlist/PlaylistList';
import PlaylistView from './components/playlist/PlaylistView';
import SmartPlaylistList from './components/smartplaylist/SmartPlaylistList';
import InternetRadioList from './components/radio/InternetRadioList';
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
import { getTheme } from './shared/utils';
import { defaultDark } from './styles/styledTheme';
import { mockSettings } from './shared/mockSettings';
import MusicList from './components/library/MusicList';
import { notifyToast } from './components/shared/toast';
import { settings } from './components/shared/setDefaultSettings';
import useCheckForUpdates from './hooks/useCheckForUpdates';
import useLibraryCache from './hooks/useLibraryCache';

const App = () => {
  const [zoomFactor, setZoomFactor] = useState(Number(localStorage.getItem('zoomFactor')) || 1.0);
  const [theme, setTheme] = useState<any>(defaultDark);
  const [font, setFont] = useState('Poppins');
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  if (process.env.NODE_ENV !== 'test') {
    webFrame.setZoomFactor(zoomFactor);
  }

  useHotkeys(
    'ctrl+shift+=',
    (e: KeyboardEvent) => {
      e.preventDefault();
      const newZoomFactor = Math.round((zoomFactor + 0.05) * 100) / 100;
      webFrame.setZoomFactor(newZoomFactor);
      localStorage.setItem('zoomFactor', String(newZoomFactor));
      setZoomFactor(newZoomFactor);
      notifyToast('info', `${Math.round(newZoomFactor * 100)}%`);
    },
    [zoomFactor]
  );

  useHotkeys(
    'ctrl+shift+-',
    (e: KeyboardEvent) => {
      e.preventDefault();
      const newZoomFactor = Math.round((zoomFactor - 0.05) * 100) / 100;

      if (newZoomFactor > 0) {
        webFrame.setZoomFactor(newZoomFactor);
        localStorage.setItem('zoomFactor', String(newZoomFactor));
        setZoomFactor(newZoomFactor);
        notifyToast('info', `${Math.round(newZoomFactor * 100)}%`);
      }
    },
    [zoomFactor]
  );

  useEffect(() => {
    const themes: any =
      process.env.NODE_ENV === 'test'
        ? mockSettings.themesDefault
        : _.concat(settings.get('themes'), settings.get('themesDefault'));

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
    setFont(config.lookAndFeel.font);
  }, [config.lookAndFeel.font]);

  useCheckForUpdates();

  const dispatch = useAppDispatch();
  const { syncLibrary } = useLibraryCache();

  // Auto-sync library cache on every launch so play counts from other devices stay current.
  useEffect(() => {
    if (!localStorage.getItem('server')) return;
    syncLibrary()
      .then(() => dispatch(setLibrarySyncedAt(new Date().toISOString())))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!localStorage.getItem('server') || !localStorage.getItem('serverBase64')) {
    return (
      <ThemeProvider theme={theme}>
        <Layout disableSidebar footer={<MockFooter />} font={font}>
          <Login />
        </Layout>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Router>
        <Layout footer={<PlayerBar />} font={font}>
          <Switch>
            <Route exact path="/library/music" component={MusicList} />
            <Route exact path="/library/album" component={AlbumList} />
            <Route exact path="/library/artist" component={ArtistList} />
            <Route exact path="/library/genre" component={GenreList} />
            <Route exact path="/library/artist/:id" component={ArtistView} />
            <Route exact path="/library/artist/:id/albums" component={ArtistView} />
            <Route exact path="/library/artist/:id/compilationalbums" component={ArtistView} />
            <Route exact path="/library/artist/:id/songs" component={ArtistView} />
            <Route exact path="/library/artist/:id/topsongs" component={ArtistView} />
            <Route exact path="/library/album/:id" component={AlbumView} />
            <Route exact path="/library/folder" component={FolderList} />
            <Route exact path="/library/folder/:id" component={FolderList} />
            <Route exact path="/nowplaying" component={NowPlayingView} />
            <Route exact path="/playlist/:id" component={PlaylistView} />
            <Route exact path="/playlist" component={PlaylistList} />
            <Route exact path="/smartplaylists" component={SmartPlaylistList} />
            <Route exact path="/radio" component={InternetRadioList} />
            <Route exact path="/starred" component={StarredView} />
            <Route exact path="/config" component={Config} />
            <Route exact path="/search" component={SearchView} />
            <Route path="/" component={Dashboard} />
          </Switch>
        </Layout>
        <PageModal />
        <NowPlayingMiniView />
        <GlobalContextMenu />
      </Router>
    </ThemeProvider>
  );
};

export default App;
