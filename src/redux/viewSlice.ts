import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { mockSettings } from '../shared/mockSettings';
import { Item, Sort, Pagination } from '../types';
import { getParsedSettings } from '../components/shared/settingsAccess';
import type { Settings } from '../components/shared/setDefaultSettings';

const parsedSettings = (
  process.env.NODE_ENV === 'test' ? mockSettings : getParsedSettings()
) as Partial<Settings>;

export interface AdvancedFilters {
  enabled: boolean;
  nav: 'filters' | 'sort';
  properties: {
    starred: boolean;
    notStarred: boolean;
    genre: {
      list: string[];
      type: 'and' | 'or';
    };
    artist: {
      list: string[];
      type: 'and' | 'or';
    };
    year: {
      from: number;
      to: number;
    };
  };
}

export interface View {
  album: {
    filter: string;
    sort: Sort;
    advancedFilters: AdvancedFilters;
    pagination: Pagination;
  };
  music: {
    filter: string;
    sort: Sort;
    pagination: Pagination;
  };
}

const initialState: View = {
  album: {
    filter:
      parsedSettings.serverType === 'jellyfin' &&
      ['frequent', 'recent'].includes(parsedSettings.albumSortDefault ?? 'random')
        ? 'random'
        : (parsedSettings.albumSortDefault ?? 'random'),
    sort: {
      column: undefined,
      type: 'asc',
    },
    advancedFilters: {
      enabled: false,
      nav: 'filters',
      properties: {
        starred: false,
        notStarred: false,
        genre: {
          list: [],
          type: 'and',
        },
        artist: {
          list: [],
          type: 'and',
        },
        year: {
          from: 0,
          to: 0,
        },
      },
    },
    pagination: {
      serverSide: parsedSettings.pagination?.album?.serverSide ?? false,
      recordsPerPage: parsedSettings.pagination?.album?.recordsPerPage ?? 50,
      activePage: 1,
      pages: 1,
    },
  },
  music: {
    filter: String(parsedSettings.musicSortDefault) || 'random',
    sort: {
      column: undefined,
      type: 'asc',
    },
    pagination: {
      serverSide: parsedSettings.pagination?.music?.serverSide ?? true,
      recordsPerPage: parsedSettings.pagination?.music?.recordsPerPage ?? 50,
      activePage: 1,
      pages: 1,
    },
  },
};

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    setFilter: (state, action: PayloadAction<{ listType: Item; data: string }>) => {
      if (action.payload.listType === Item.Album) {
        state.album.filter = action.payload.data;
      }

      if (action.payload.listType === Item.Music) {
        state.music.filter = action.payload.data;
      }
    },

    setAdvancedFilters: (
      state,
      action: PayloadAction<{
        listType: Item;
        filter: 'enabled' | 'starred' | 'notStarred' | 'genre' | 'artist' | 'year' | 'nav';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value type depends on the filter discriminant; each assignment site enforces the correct type at runtime
        value: any;
      }>
    ) => {
      if (action.payload.listType === Item.Album) {
        if (action.payload.filter === 'enabled') {
          state.album.advancedFilters.enabled = action.payload.value;
        }

        if (action.payload.filter === 'starred') {
          state.album.advancedFilters.properties.starred = action.payload.value;
        }

        if (action.payload.filter === 'notStarred') {
          state.album.advancedFilters.properties.notStarred = action.payload.value;
        }

        if (action.payload.filter === 'genre') {
          state.album.advancedFilters.properties.genre = action.payload.value;
        }

        if (action.payload.filter === 'artist') {
          state.album.advancedFilters.properties.artist = action.payload.value;
        }

        if (action.payload.filter === 'year') {
          state.album.advancedFilters.properties.year = action.payload.value;
        }

        if (action.payload.filter === 'nav') {
          state.album.advancedFilters.nav = action.payload.value;
        }
      }
    },

    setColumnSort: (state, action: PayloadAction<{ listType: Item; data: Sort }>) => {
      if (action.payload.listType === Item.Album) {
        state.album.sort = action.payload.data;
      }
    },

    setPagination: (
      state,
      action: PayloadAction<{
        listType: Item;
        data: {
          enabled?: boolean;
          activePage?: number;
          pages?: number;
          recordsPerPage?: number;
          serverSide?: boolean;
        };
      }>
    ) => {
      if (action.payload.listType === Item.Album) {
        state.album.pagination = {
          ...state.album.pagination,
          ...action.payload.data,
        };
      }
      if (action.payload.listType === Item.Music) {
        state.music.pagination = {
          ...state.music.pagination,
          ...action.payload.data,
        };
      }
    },
  },
});

export const { setFilter, setAdvancedFilters, setColumnSort, setPagination } = viewSlice.actions;
export default viewSlice.reducer;
