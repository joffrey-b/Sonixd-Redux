import { configureStore } from '@reduxjs/toolkit';
import folderReducer, {
  setMusicFolder,
  setCurrentViewedFolder,
  setAppliedFolderViews,
  FolderSelection,
} from '../redux/folderSlice';

const createStore = () => configureStore({ reducer: { folder: folderReducer } });

// ─── initialisation ────────────────────────────────────────────────────────────

describe('folderSlice initialisation', () => {
  it('defaults currentViewedFolder to undefined', () => {
    const store = createStore();
    expect(store.getState().folder.currentViewedFolder).toBeUndefined();
  });

  it('defaults musicFolder to undefined when mockSettings.musicFolder.id is null', () => {
    const store = createStore();
    // mockSettings has musicFolder.id === null, so musicFolder should be undefined
    expect(store.getState().folder.musicFolder).toBeUndefined();
  });

  it('initialises applied flags from mockSettings defaults', () => {
    const store = createStore();
    const { applied } = store.getState().folder;
    // mockSettings.musicFolder.albums/artists/dashboard/music = true, search/starred = false
    expect(applied.albums).toBe(true);
    expect(applied.artists).toBe(true);
    expect(applied.search).toBe(false);
    expect(applied.starred).toBe(false);
    expect(applied.music).toBe(true);
  });

  it('starts with musicFolderName as undefined when id is null', () => {
    const store = createStore();
    expect(store.getState().folder.musicFolderName).toBeUndefined();
  });
});

// ─── reducers ─────────────────────────────────────────────────────────────────

describe('folderSlice reducers', () => {
  it('setCurrentViewedFolder updates currentViewedFolder', () => {
    const store = createStore();
    store.dispatch(setCurrentViewedFolder('folder-123'));
    expect(store.getState().folder.currentViewedFolder).toBe('folder-123');
  });

  it('setCurrentViewedFolder with empty string stores empty string', () => {
    const store = createStore();
    store.dispatch(setCurrentViewedFolder(''));
    expect(store.getState().folder.currentViewedFolder).toBe('');
  });

  it('setCurrentViewedFolder replaces a previously set value', () => {
    const store = createStore();
    store.dispatch(setCurrentViewedFolder('first'));
    store.dispatch(setCurrentViewedFolder('second'));
    expect(store.getState().folder.currentViewedFolder).toBe('second');
  });

  it('setMusicFolder updates musicFolder id and musicFolderName', () => {
    const store = createStore();
    store.dispatch(setMusicFolder({ id: 'folder-1', name: 'My Music' }));
    const state = store.getState().folder;
    expect(state.musicFolder).toBe('folder-1');
    expect(state.musicFolderName).toBe('My Music');
  });

  it('setMusicFolder overwrites a previously set folder', () => {
    const store = createStore();
    store.dispatch(setMusicFolder({ id: 'a', name: 'A' }));
    store.dispatch(setMusicFolder({ id: 'b', name: 'B' }));
    expect(store.getState().folder.musicFolder).toBe('b');
    expect(store.getState().folder.musicFolderName).toBe('B');
  });

  it('setAppliedFolderViews replaces the applied object', () => {
    const store = createStore();
    const newApplied: FolderSelection['applied'] = {
      albums: false,
      artists: false,
      dashboard: true,
      search: true,
      starred: true,
      music: false,
    };
    store.dispatch(setAppliedFolderViews(newApplied));
    expect(store.getState().folder.applied).toEqual(newApplied);
  });

  it('setAppliedFolderViews only changes the applied field, not musicFolder', () => {
    const store = createStore();
    store.dispatch(setMusicFolder({ id: 'x', name: 'X' }));
    store.dispatch(
      setAppliedFolderViews({
        albums: false,
        artists: false,
        dashboard: false,
        search: false,
        starred: false,
        music: false,
      })
    );
    expect(store.getState().folder.musicFolder).toBe('x');
  });
});
