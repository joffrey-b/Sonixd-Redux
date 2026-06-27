import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { stateSyncEnhancer } from 'electron-redux/renderer';
import { settings } from '../components/shared/bridge';
import playerReducer from './playerSlice';
import playQueueReducer from './playQueueSlice';
import multiSelectReducer from './multiSelectSlice';
import miscReducer from './miscSlice';
import playlistReducer from './playlistSlice';
import folderReducer from './folderSlice';
import configReducer from './configSlice';
import favoriteReducer from './favoriteSlice';
import artistReducer from './artistSlice';
import viewReducer from './viewSlice';
import eqReducer from './eqSlice';
import peqReducer from './peqSlice';
import smartPlaylistReducer, {
  addSmartPlaylist,
  updateSmartPlaylist,
  deleteSmartPlaylist,
  setLibrarySyncedAt,
} from './smartPlaylistSlice';
import jukeboxReducer from './jukeboxSlice';
import type { SmartPlaylist } from '../types';

const smartPlaylistListener = createListenerMiddleware();

smartPlaylistListener.startListening({
  actionCreator: addSmartPlaylist,
  effect: (_action, api) => {
    const state = api.getState() as { smartPlaylist: { playlists: SmartPlaylist[] } };
    settings.set('smartPlaylists', state.smartPlaylist.playlists);
  },
});

smartPlaylistListener.startListening({
  actionCreator: updateSmartPlaylist,
  effect: (_action, api) => {
    const state = api.getState() as { smartPlaylist: { playlists: SmartPlaylist[] } };
    settings.set('smartPlaylists', state.smartPlaylist.playlists);
  },
});

smartPlaylistListener.startListening({
  actionCreator: deleteSmartPlaylist,
  effect: (_action, api) => {
    const state = api.getState() as { smartPlaylist: { playlists: SmartPlaylist[] } };
    settings.set('smartPlaylists', state.smartPlaylist.playlists);
  },
});

smartPlaylistListener.startListening({
  actionCreator: setLibrarySyncedAt,
  effect: (action) => {
    settings.set('librarySyncedAt', action.payload);
  },
});

export const store = configureStore({
  reducer: {
    player: playerReducer,
    playQueue: playQueueReducer,
    multiSelect: multiSelectReducer,
    misc: miscReducer,
    playlist: playlistReducer,
    folder: folderReducer,
    config: configReducer,
    favorite: favoriteReducer,
    artist: artistReducer,
    view: viewReducer,
    eq: eqReducer,
    peq: peqReducer,
    smartPlaylist: smartPlaylistReducer,
    jukebox: jukeboxReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [],
        ignoredPaths: [],
      },
      immutabilityCheck: true,
    }).prepend(smartPlaylistListener.middleware),
  enhancers: (getDefaultEnhancers) => getDefaultEnhancers().concat(stateSyncEnhancer()),
});

export type RootState = ReturnType<typeof store.getState>;

// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
