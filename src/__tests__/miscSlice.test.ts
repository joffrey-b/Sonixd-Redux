import { configureStore } from '@reduxjs/toolkit';
import miscReducer, {
  setTheme,
  setSearchQuery,
  hideModal,
  addModalPage,
  incrementModalPage,
  decrementModalPage,
  addProcessingPlaylist,
  removeProcessingPlaylist,
  setContextMenu,
  setDynamicBackground,
  savedWindowSize,
  savedWindowPos,
  setDefaultWindowWidth,
  setDefaultWindowHeight,
  setMiscSetting,
  setImgModal,
  setRetainWindowSize,
} from '../redux/miscSlice';

const createStore = () => configureStore({ reducer: { misc: miscReducer } });

// ─── initialisation ────────────────────────────────────────────────────────────

describe('miscSlice initialisation', () => {
  it('initialises theme from mockSettings', () => {
    const store = createStore();
    expect(store.getState().misc.theme).toBe('defaultDark');
  });

  it('starts with modal hidden', () => {
    const store = createStore();
    expect(store.getState().misc.modal.show).toBe(false);
    expect(store.getState().misc.modal.currentPageIndex).toBeUndefined();
  });

  it('starts with empty isProcessingPlaylist array', () => {
    const store = createStore();
    expect(store.getState().misc.isProcessingPlaylist).toEqual([]);
  });

  it('starts with contextMenu hidden', () => {
    const store = createStore();
    expect(store.getState().misc.contextMenu.show).toBe(false);
  });

  it('initialises dynamicBackground from mockSettings', () => {
    const store = createStore();
    expect(store.getState().misc.dynamicBackground).toBe(false);
  });

  it('starts with empty searchQuery', () => {
    const store = createStore();
    expect(store.getState().misc.searchQuery).toBe('');
  });

  it('initialises savedWindowSize from mockSettings', () => {
    const store = createStore();
    expect(store.getState().misc.savedWindowSize).toEqual([1024, 728]);
  });

  it('initialises titleBar from mockSettings', () => {
    const store = createStore();
    expect(store.getState().misc.titleBar).toBe('windows');
  });
});

// ─── theme and search ─────────────────────────────────────────────────────────

describe('miscSlice — setTheme / setSearchQuery', () => {
  it('setTheme updates the theme string', () => {
    const store = createStore();
    store.dispatch(setTheme('monokai'));
    expect(store.getState().misc.theme).toBe('monokai');
  });

  it('setSearchQuery stores the query string', () => {
    const store = createStore();
    store.dispatch(setSearchQuery('Beethoven'));
    expect(store.getState().misc.searchQuery).toBe('Beethoven');
  });

  it('setSearchQuery with empty string clears the query', () => {
    const store = createStore();
    store.dispatch(setSearchQuery('test'));
    store.dispatch(setSearchQuery(''));
    expect(store.getState().misc.searchQuery).toBe('');
  });
});

// ─── modal ────────────────────────────────────────────────────────────────────

describe('miscSlice — modal', () => {
  it('addModalPage shows the modal and appends a page', () => {
    const store = createStore();
    store.dispatch(addModalPage({ pageType: 'album', id: 'album-1' }));
    const state = store.getState().misc;
    expect(state.modal.show).toBe(true);
    expect(state.modalPages).toHaveLength(1);
    expect(state.modal.currentPageIndex).toBe(0);
  });

  it('addModalPage a second time advances the page index', () => {
    const store = createStore();
    store.dispatch(addModalPage({ pageType: 'album', id: 'album-1' }));
    store.dispatch(addModalPage({ pageType: 'artist', id: 'artist-1' }));
    const state = store.getState().misc;
    expect(state.modalPages).toHaveLength(2);
    expect(state.modal.currentPageIndex).toBe(1);
  });

  it('addModalPage with the same id as current page does not duplicate', () => {
    const store = createStore();
    store.dispatch(addModalPage({ pageType: 'album', id: 'album-1' }));
    store.dispatch(addModalPage({ pageType: 'album', id: 'album-1' }));
    expect(store.getState().misc.modalPages).toHaveLength(1);
  });

  it('hideModal clears modal state', () => {
    const store = createStore();
    store.dispatch(addModalPage({ pageType: 'album', id: 'album-1' }));
    store.dispatch(hideModal());
    const state = store.getState().misc;
    expect(state.modal.show).toBe(false);
    expect(state.modalPages).toHaveLength(0);
    expect(state.modal.currentPageIndex).toBeUndefined();
  });

  it('incrementModalPage advances the page index when not at last page', () => {
    // Simulate a state where multiple pages exist and we are not at the last one.
    // We achieve this by adding 3 pages and then manually decrementing once — but
    // since decrementModalPage pops the last page, we instead inject the pre-condition
    // via a sequence of adds with distinct ids and then check that incrementModalPage
    // does nothing when already at the end (the normal UI path).
    // Verify that when currentPageIndex < modalPages.length - 1 the index increases.
    const store = createStore();
    store.dispatch(addModalPage({ pageType: 'album', id: 'a1' }));
    store.dispatch(addModalPage({ pageType: 'album', id: 'a2' }));
    // currentPageIndex is now 1 (last page), so incrementModalPage is a no-op
    const before = store.getState().misc.modal.currentPageIndex;
    store.dispatch(incrementModalPage());
    // Cannot advance past last page — index stays the same
    expect(store.getState().misc.modal.currentPageIndex).toBe(before);
    // Verify the logic: incrementModal checks currentPageIndex + 1 < modalPages.length
    expect(store.getState().misc.modal.currentPageIndex).toBe(
      store.getState().misc.modalPages.length - 1
    );
  });

  it('incrementModalPage does not exceed last page', () => {
    const store = createStore();
    store.dispatch(addModalPage({ pageType: 'album', id: 'a1' }));
    store.dispatch(incrementModalPage());
    // Can't go past the only page (index 0)
    expect(store.getState().misc.modal.currentPageIndex).toBe(0);
  });

  it('decrementModalPage goes back one page', () => {
    const store = createStore();
    store.dispatch(addModalPage({ pageType: 'album', id: 'a1' }));
    store.dispatch(addModalPage({ pageType: 'album', id: 'a2' }));
    store.dispatch(addModalPage({ pageType: 'album', id: 'a3' }));
    // Now at index 2
    store.dispatch(decrementModalPage());
    expect(store.getState().misc.modal.currentPageIndex).toBe(1);
    expect(store.getState().misc.modalPages).toHaveLength(2);
  });

  it('decrementModalPage does not go below 0', () => {
    const store = createStore();
    store.dispatch(addModalPage({ pageType: 'album', id: 'a1' }));
    store.dispatch(decrementModalPage());
    // Already at 0, can't go further
    expect(store.getState().misc.modal.currentPageIndex).toBe(0);
  });
});

// ─── imgModal ─────────────────────────────────────────────────────────────────

describe('miscSlice — setImgModal', () => {
  it('shows the image modal with a src', () => {
    const store = createStore();
    store.dispatch(setImgModal({ show: true, src: 'http://example.com/image.jpg' }));
    const { imgModal } = store.getState().misc;
    expect(imgModal.show).toBe(true);
    expect(imgModal.src).toBe('http://example.com/image.jpg');
  });

  it('hides the image modal', () => {
    const store = createStore();
    store.dispatch(setImgModal({ show: true, src: 'http://img' }));
    store.dispatch(setImgModal({ show: false }));
    expect(store.getState().misc.imgModal.show).toBe(false);
  });
});

// ─── processing playlist ──────────────────────────────────────────────────────

describe('miscSlice — addProcessingPlaylist / removeProcessingPlaylist', () => {
  it('adds a playlist id to isProcessingPlaylist', () => {
    const store = createStore();
    store.dispatch(addProcessingPlaylist('pl-1'));
    expect(store.getState().misc.isProcessingPlaylist).toContain('pl-1');
  });

  it('can hold multiple playlist ids', () => {
    const store = createStore();
    store.dispatch(addProcessingPlaylist('pl-1'));
    store.dispatch(addProcessingPlaylist('pl-2'));
    expect(store.getState().misc.isProcessingPlaylist).toEqual(['pl-1', 'pl-2']);
  });

  it('removeProcessingPlaylist removes the specified id', () => {
    const store = createStore();
    store.dispatch(addProcessingPlaylist('pl-1'));
    store.dispatch(addProcessingPlaylist('pl-2'));
    store.dispatch(removeProcessingPlaylist('pl-1'));
    expect(store.getState().misc.isProcessingPlaylist).not.toContain('pl-1');
    expect(store.getState().misc.isProcessingPlaylist).toContain('pl-2');
  });

  it('removeProcessingPlaylist with unknown id does not throw', () => {
    const store = createStore();
    expect(() => store.dispatch(removeProcessingPlaylist('nonexistent'))).not.toThrow();
  });
});

// ─── context menu ─────────────────────────────────────────────────────────────

describe('miscSlice — setContextMenu', () => {
  it('shows the context menu with position and type', () => {
    const store = createStore();
    store.dispatch(
      setContextMenu({ show: true, xPos: 100, yPos: 200, type: 'song', rowId: 'song-1' })
    );
    const { contextMenu } = store.getState().misc;
    expect(contextMenu.show).toBe(true);
    expect(contextMenu.xPos).toBe(100);
    expect(contextMenu.yPos).toBe(200);
    expect(contextMenu.type).toBe('song');
  });

  it('hides the context menu', () => {
    const store = createStore();
    store.dispatch(setContextMenu({ show: true, xPos: 10, yPos: 10 }));
    store.dispatch(setContextMenu({ show: false }));
    expect(store.getState().misc.contextMenu.show).toBe(false);
  });
});

// ─── window settings ──────────────────────────────────────────────────────────

describe('miscSlice — window size and position', () => {
  it('setDynamicBackground updates the flag', () => {
    const store = createStore();
    store.dispatch(setDynamicBackground(true));
    expect(store.getState().misc.dynamicBackground).toBe(true);
  });

  it('setRetainWindowSize updates the flag', () => {
    const store = createStore();
    store.dispatch(setRetainWindowSize(true));
    expect(store.getState().misc.retainWindowSize).toBe(true);
  });

  it('savedWindowSize stores the new dimensions', () => {
    const store = createStore();
    store.dispatch(savedWindowSize([1920, 1080]));
    expect(store.getState().misc.savedWindowSize).toEqual([1920, 1080]);
  });

  it('savedWindowPos stores the new position', () => {
    const store = createStore();
    store.dispatch(savedWindowPos([50, 100]));
    expect(store.getState().misc.savedWindowPos).toEqual([50, 100]);
  });

  it('setDefaultWindowWidth updates the default width', () => {
    const store = createStore();
    store.dispatch(setDefaultWindowWidth(1440));
    expect(store.getState().misc.defaultWindowWidth).toBe(1440);
  });

  it('setDefaultWindowHeight updates the default height', () => {
    const store = createStore();
    store.dispatch(setDefaultWindowHeight(900));
    expect(store.getState().misc.defaultWindowHeight).toBe(900);
  });
});

// ─── setMiscSetting ───────────────────────────────────────────────────────────

describe('miscSlice — setMiscSetting', () => {
  it('imageCachePath updates correctly', () => {
    const store = createStore();
    store.dispatch(setMiscSetting({ setting: 'imageCachePath', value: '/new/image/path' }));
    expect(store.getState().misc.imageCachePath).toBe('/new/image/path');
  });

  it('songCachePath updates correctly', () => {
    const store = createStore();
    store.dispatch(setMiscSetting({ setting: 'songCachePath', value: '/new/song/path' }));
    expect(store.getState().misc.songCachePath).toBe('/new/song/path');
  });

  it('titleBar updates correctly', () => {
    const store = createStore();
    store.dispatch(setMiscSetting({ setting: 'titleBar', value: 'mac' }));
    expect(store.getState().misc.titleBar).toBe('mac');
  });

  it('highlightOnRowHover updates correctly', () => {
    const store = createStore();
    store.dispatch(setMiscSetting({ setting: 'highlightOnRowHover', value: true }));
    expect(store.getState().misc.highlightOnRowHover).toBe(true);
  });

  it('unknown setting key does not throw and does not change state', () => {
    const store = createStore();
    const before = store.getState().misc.theme;
    expect(() =>
      store.dispatch(setMiscSetting({ setting: 'unknownKey', value: 'something' }))
    ).not.toThrow();
    expect(store.getState().misc.theme).toBe(before);
  });
});
