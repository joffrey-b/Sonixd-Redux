import { configureStore } from '@reduxjs/toolkit';
import viewReducer, {
  setFilter,
  setAdvancedFilters,
  setColumnSort,
  setPagination,
} from '../redux/viewSlice';
import { Item } from '../types';

const createStore = () => configureStore({ reducer: { view: viewReducer } });

// ─── initialisation ────────────────────────────────────────────────────────────

describe('viewSlice initialisation', () => {
  it('defaults album filter to random (from mockSettings.albumSortDefault)', () => {
    const store = createStore();
    expect(store.getState().view.album.filter).toBe('random');
  });

  it('defaults music filter to random (from mockSettings.musicSortDefault)', () => {
    const store = createStore();
    expect(store.getState().view.music.filter).toBe('random');
  });

  it('initialises album pagination recordsPerPage from mockSettings', () => {
    const store = createStore();
    expect(store.getState().view.album.pagination.recordsPerPage).toBe(50);
  });

  it('initialises music pagination serverSide from mockSettings', () => {
    const store = createStore();
    expect(store.getState().view.music.pagination.serverSide).toBe(true);
  });

  it('starts with advancedFilters disabled', () => {
    const store = createStore();
    expect(store.getState().view.album.advancedFilters.enabled).toBe(false);
  });

  it('starts with sort column undefined', () => {
    const store = createStore();
    expect(store.getState().view.album.sort.column).toBeUndefined();
  });
});

// ─── setFilter ─────────────────────────────────────────────────────────────────

describe('viewSlice — setFilter', () => {
  it('updates album filter', () => {
    const store = createStore();
    store.dispatch(setFilter({ listType: Item.Album, data: 'newest' }));
    expect(store.getState().view.album.filter).toBe('newest');
  });

  it('updates music filter', () => {
    const store = createStore();
    store.dispatch(setFilter({ listType: Item.Music, data: 'frequent' }));
    expect(store.getState().view.music.filter).toBe('frequent');
  });

  it('does not affect music filter when changing album filter', () => {
    const store = createStore();
    const before = store.getState().view.music.filter;
    store.dispatch(setFilter({ listType: Item.Album, data: 'recent' }));
    expect(store.getState().view.music.filter).toBe(before);
  });
});

// ─── setPagination ─────────────────────────────────────────────────────────────

describe('viewSlice — setPagination', () => {
  it('updates album pagination activePage', () => {
    const store = createStore();
    store.dispatch(setPagination({ listType: Item.Album, data: { activePage: 3 } }));
    expect(store.getState().view.album.pagination.activePage).toBe(3);
  });

  it('updates music pagination recordsPerPage', () => {
    const store = createStore();
    store.dispatch(setPagination({ listType: Item.Music, data: { recordsPerPage: 100 } }));
    expect(store.getState().view.music.pagination.recordsPerPage).toBe(100);
  });

  it('merges pagination fields (does not reset unspecified fields)', () => {
    const store = createStore();
    const before = store.getState().view.album.pagination.recordsPerPage;
    store.dispatch(setPagination({ listType: Item.Album, data: { activePage: 2 } }));
    expect(store.getState().view.album.pagination.recordsPerPage).toBe(before);
  });

  it('updates serverSide flag on album pagination', () => {
    const store = createStore();
    store.dispatch(setPagination({ listType: Item.Album, data: { serverSide: true } }));
    expect(store.getState().view.album.pagination.serverSide).toBe(true);
  });

  it('updates pages count on music pagination', () => {
    const store = createStore();
    store.dispatch(setPagination({ listType: Item.Music, data: { pages: 10 } }));
    expect(store.getState().view.music.pagination.pages).toBe(10);
  });
});

// ─── setAdvancedFilters ────────────────────────────────────────────────────────

describe('viewSlice — setAdvancedFilters', () => {
  it('enables the advanced filter panel', () => {
    const store = createStore();
    store.dispatch(setAdvancedFilters({ listType: Item.Album, filter: 'enabled', value: true }));
    expect(store.getState().view.album.advancedFilters.enabled).toBe(true);
  });

  it('sets starred filter', () => {
    const store = createStore();
    store.dispatch(setAdvancedFilters({ listType: Item.Album, filter: 'starred', value: true }));
    expect(store.getState().view.album.advancedFilters.properties.starred).toBe(true);
  });

  it('sets notStarred filter', () => {
    const store = createStore();
    store.dispatch(setAdvancedFilters({ listType: Item.Album, filter: 'notStarred', value: true }));
    expect(store.getState().view.album.advancedFilters.properties.notStarred).toBe(true);
  });

  it('sets genre filter object', () => {
    const store = createStore();
    const genre = { list: ['Rock', 'Pop'], type: 'or' as const };
    store.dispatch(setAdvancedFilters({ listType: Item.Album, filter: 'genre', value: genre }));
    expect(store.getState().view.album.advancedFilters.properties.genre).toEqual(genre);
  });

  it('sets year filter object', () => {
    const store = createStore();
    const year = { from: 1990, to: 2000 };
    store.dispatch(setAdvancedFilters({ listType: Item.Album, filter: 'year', value: year }));
    expect(store.getState().view.album.advancedFilters.properties.year).toEqual(year);
  });

  it('sets nav mode', () => {
    const store = createStore();
    store.dispatch(setAdvancedFilters({ listType: Item.Album, filter: 'nav', value: 'sort' }));
    expect(store.getState().view.album.advancedFilters.nav).toBe('sort');
  });

  it('does not affect album when listType is not Album', () => {
    const store = createStore();
    const before = store.getState().view.album.advancedFilters.enabled;
    store.dispatch(setAdvancedFilters({ listType: Item.Music, filter: 'enabled', value: true }));
    expect(store.getState().view.album.advancedFilters.enabled).toBe(before);
  });
});

// ─── setColumnSort ─────────────────────────────────────────────────────────────

describe('viewSlice — setColumnSort', () => {
  it('updates album sort column and type', () => {
    const store = createStore();
    store.dispatch(
      setColumnSort({ listType: Item.Album, data: { column: 'title', type: 'desc' } })
    );
    const sort = store.getState().view.album.sort;
    expect(sort.column).toBe('title');
    expect(sort.type).toBe('desc');
  });

  it('does not affect album sort when listType is not Album', () => {
    const store = createStore();
    const before = store.getState().view.album.sort.column;
    store.dispatch(
      setColumnSort({ listType: Item.Music, data: { column: 'artist', type: 'asc' } })
    );
    expect(store.getState().view.album.sort.column).toBe(before);
  });
});
