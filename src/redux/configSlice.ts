import { nanoid } from 'nanoid/non-secure';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { mockSettings } from '../shared/mockSettings';
import { moveSelectedToIndex } from '../shared/utils';
import { Server } from '../types';
import { getParsedSettings } from '../components/shared/settingsAccess';
import type { Column, Settings } from '../components/shared/setDefaultSettings';

export type ColumnEntry = Column & { uniqueId?: string; fixed?: boolean | 'left' | 'right' };

const getConfigParsedSettings = (): Partial<Settings> =>
  (process.env.NODE_ENV === 'test' ? mockSettings : getParsedSettings()) as Partial<Settings>;

export interface ConfigPage {
  active: {
    tab: string;
    columnSelectorTab: string;
  };
  playback: {
    filters: PlaybackFilter[];
    audioDeviceId?: string;
    mpvAudioDeviceId?: string;
    playerBackend: 'web' | 'mpv';
    mpvPath: string;
    mpvGapless: 'no' | 'weak' | 'yes';
    mpvReplayGain: 'no' | 'track' | 'album';
  };
  sort: {
    albumListPage?: SortColumn;
    albumPage?: SortColumn;
    artistListPage?: SortColumn;
    artistPage?: SortColumn;
    favoriteAlbumsPage?: SortColumn;
    favoriteArtistsPage?: SortColumn;
    favoriteTracksPage?: SortColumn;
    folderListPage?: SortColumn;
    genreListPage?: SortColumn;
    musicListPage?: SortColumn;
    playlistListPage?: SortColumn;
  };
  player: {
    systemNotifications: boolean;
    globalShortcuts: boolean;
  };
  lookAndFeel: {
    font: string;
    listView: {
      music: { columns: ColumnEntry[]; rowHeight: number; fontSize: number };
      album: { columns: ColumnEntry[]; rowHeight: number; fontSize: number };
      playlist: { columns: ColumnEntry[]; rowHeight: number; fontSize: number };
      artist: { columns: ColumnEntry[]; rowHeight: number; fontSize: number };
      genre: { columns: ColumnEntry[]; rowHeight: number; fontSize: number };
      mini: { columns: ColumnEntry[]; rowHeight: number; fontSize: number };
    };
    gridView: {
      cardSize: number;
      gapSize: number;
      alignment: string | 'flex-start' | 'center';
    };
    sidebar: Sidebar;
  };
  external: {
    discord: {
      enabled: boolean;
      clientId: string;
      showAlbumArt: boolean;
    };
    obs: {
      enabled: boolean;
      url: string;
      path: string;
      pollingInterval: number;
      type: 'web' | 'local';
    };
  };
  window: {
    minimizeToTray: boolean;
    exitToTray: boolean;
    allowDevConsole: boolean;
  };
  serverType: Server;
  hotkeys: {
    navigateBack: string;
    search: string;
    selectAll: string;
    removeSelected: string;
    playPause: string;
    nextTrack: string;
    prevTrack: string;
    volumeUp: string;
    volumeDown: string;
    mute: string;
  };
}

interface SortColumn {
  sortColumn?: string;
  sortType: 'asc' | 'desc';
}

interface PlaybackFilter {
  filter: string;
  enabled: boolean;
}

export interface Sidebar {
  expand: boolean;
  width: string;
  coverArt: boolean;
  selected: SidebarList[];
}

export type SidebarList =
  | 'dashboard'
  | 'nowplaying'
  | 'favorites'
  | 'songs'
  | 'albums'
  | 'artists'
  | 'genres'
  | 'folders'
  | 'config'
  | 'collapse'
  | 'playlists'
  | 'playlistList'
  | 'smartplaylists'
  | 'radio'
  | 'podcasts';

export type ColumnList = 'music' | 'album' | 'playlist' | 'artist' | 'genre' | 'mini';

// Exported so import-settings (main.dev.mjs) can rebuild this slice's state
// fresh from the post-import settings store and dispatch it wholesale — the
// main process's redux store is created once at app boot and never
// recomputed afterwards (see initStore() in main.dev.mjs), so without this,
// settings imported via the generic settings.set() path (which doesn't go
// through redux at all) get silently reverted on the next reload when
// electron-redux's INIT_STATE handshake re-hydrates the renderer from main's
// stale in-memory state. Safe to call again later: `active`/`sort` are
// already runtime-only (not settings-derived) and already reset to these
// same fixed values on every reload regardless.
export const buildInitialState = (): ConfigPage => {
  const parsedSettings = getConfigParsedSettings();
  return {
    active: {
      tab: 'playback',
      columnSelectorTab: 'music',
    },
    playback: {
      filters: parsedSettings.playbackFilters ?? [],
      audioDeviceId: parsedSettings.audioDeviceId || undefined,
      mpvAudioDeviceId: parsedSettings.mpvAudioDeviceId || undefined,
      playerBackend: (parsedSettings.playerBackend as 'web' | 'mpv') ?? 'web',
      mpvPath: (parsedSettings.mpvPath as string) ?? '',
      mpvGapless: (parsedSettings.mpvGapless as 'no' | 'weak' | 'yes') ?? 'weak',
      mpvReplayGain: (parsedSettings.mpvReplayGain as 'no' | 'track' | 'album') ?? 'no',
    },
    player: {
      systemNotifications: parsedSettings.systemNotifications ?? false,
      globalShortcuts: parsedSettings.globalShortcuts || false,
    },
    sort: {
      albumListPage: undefined,
      albumPage: undefined,
      artistListPage: undefined,
      artistPage: undefined,
      favoriteAlbumsPage: undefined,
      favoriteArtistsPage: undefined,
      favoriteTracksPage: undefined,
      folderListPage: undefined,
      genreListPage: undefined,
      musicListPage: undefined,
      playlistListPage: undefined,
    },
    lookAndFeel: {
      font: String(parsedSettings.font),
      listView: {
        music: {
          columns:
            parsedSettings.musicListColumns?.map((col) => {
              return { ...col, uniqueId: nanoid() };
            }) ?? [],
          rowHeight: Number(parsedSettings.musicListRowHeight),
          fontSize: Number(parsedSettings.musicListFontSize),
        },
        album: {
          columns:
            parsedSettings.albumListColumns?.map((col) => {
              return { ...col, uniqueId: nanoid() };
            }) ?? [],
          rowHeight: Number(parsedSettings.albumListRowHeight),
          fontSize: Number(parsedSettings.albumListFontSize),
        },
        playlist: {
          columns:
            parsedSettings.playlistListColumns?.map((col) => {
              return { ...col, uniqueId: nanoid() };
            }) ?? [],
          rowHeight: Number(parsedSettings.playlistListRowHeight),
          fontSize: Number(parsedSettings.playlistListFontSize),
        },
        artist: {
          columns:
            parsedSettings.artistListColumns?.map((col) => {
              return { ...col, uniqueId: nanoid() };
            }) ?? [],
          rowHeight: Number(parsedSettings.artistListRowHeight),
          fontSize: Number(parsedSettings.artistListFontSize),
        },
        genre: {
          columns:
            parsedSettings.genreListColumns?.map((col) => {
              return { ...col, uniqueId: nanoid() };
            }) ?? [],
          rowHeight: Number(parsedSettings.genreListRowHeight),
          fontSize: Number(parsedSettings.genreListFontSize),
        },
        mini: {
          columns:
            parsedSettings.miniListColumns?.map((col) => {
              return { ...col, uniqueId: nanoid() };
            }) ?? [],
          rowHeight: Number(parsedSettings.miniListRowHeight),
          fontSize: Number(parsedSettings.miniListFontSize),
        },
      },
      gridView: {
        cardSize: Number(parsedSettings.gridCardSize),
        gapSize: Number(parsedSettings.gridGapSize),
        alignment: String(parsedSettings.gridAlignment),
      },
      sidebar: {
        expand: Boolean(parsedSettings.sidebar?.expand),
        width: String(parsedSettings.sidebar?.width),
        coverArt: Boolean(parsedSettings.sidebar?.coverArt),
        selected: (parsedSettings.sidebar?.selected as SidebarList[]) || [
          'dashboard',
          'nowplaying',
          'favorites',
          'songs',
          'albums',
          'artists',
          'genres',
          'folders',
          'config',
          'collapse',
          'playlists',
          'playlistList',
          'smartplaylists',
          'radio',
          'podcasts',
        ],
      },
    },
    external: {
      discord: {
        enabled: parsedSettings.discord?.enabled || false,
        clientId: parsedSettings.discord?.clientId || '',
        showAlbumArt: parsedSettings.discord?.showAlbumArt || false,
      },
      obs: {
        enabled: parsedSettings.obs?.enabled || false,
        url: parsedSettings.obs?.url || '',
        path: parsedSettings.obs?.path || '',
        pollingInterval: parsedSettings.obs?.pollingInterval || 1000,
        type: (parsedSettings.obs?.type as 'local' | 'web') || 'local',
      },
    },
    window: {
      minimizeToTray: parsedSettings.minimizeToTray ?? false,
      exitToTray: parsedSettings.exitToTray ?? false,
      allowDevConsole: parsedSettings.allowDevConsole || false,
    },
    serverType: (parsedSettings.serverType as Server) ?? Server.Subsonic,
    hotkeys: {
      navigateBack: parsedSettings.hotkeyNavigateBack || 'backspace',
      search: parsedSettings.hotkeySearch || 'ctrl+f',
      selectAll: parsedSettings.hotkeySelectAll || 'ctrl+a',
      removeSelected: parsedSettings.hotkeyRemoveSelected || 'del',
      playPause: parsedSettings.hotkeyPlayPause || 'ctrl+p',
      nextTrack: parsedSettings.hotkeyNextTrack || 'ctrl+right',
      prevTrack: parsedSettings.hotkeyPrevTrack || 'ctrl+left',
      volumeUp: parsedSettings.hotkeyVolumeUp || 'ctrl+up',
      volumeDown: parsedSettings.hotkeyVolumeDown || 'ctrl+down',
      mute: parsedSettings.hotkeyMute || 'ctrl+m',
    },
  };
};

const initialState = buildInitialState();

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    // Wholesale replace, dispatched by main.dev.mjs's import-settings handler
    // with a freshly-built buildInitialState() — see that function's comment.
    replaceState: (_state, action: PayloadAction<ConfigPage>) => action.payload,

    setActive: (state, action: PayloadAction<ConfigPage['active']>) => {
      state.active = action.payload;
    },

    setSidebar: (state, action: PayloadAction<Partial<Sidebar>>) => {
      state.lookAndFeel.sidebar = {
        ...state.lookAndFeel.sidebar,
        ...action.payload,
      };
    },

    setPlayer: (state, action: PayloadAction<Partial<ConfigPage['player']>>) => {
      state.player = {
        ...state.player,
        ...action.payload,
      };
    },

    setWindow: (state, action: PayloadAction<Partial<ConfigPage['window']>>) => {
      state.window = { ...state.window, ...action.payload };
    },

    setPageSort: (
      state,
      action: PayloadAction<{
        page:
          | 'albumListPage'
          | 'albumPage'
          | 'artistListPage'
          | 'artistPage'
          | 'favoriteAlbumsPage'
          | 'favoriteArtistsPage'
          | 'favoriteTracksPage'
          | 'folderListPage'
          | 'genreListPage'
          | 'playlistListPage';
        sort: SortColumn;
      }>
    ) => {
      state.sort[action.payload.page] = action.payload.sort;
    },

    appendPlaybackFilter: (state, action: PayloadAction<PlaybackFilter>) => {
      if (!state.playback.filters.find((f: PlaybackFilter) => f.filter === action.payload.filter)) {
        state.playback.filters.push(action.payload);
      }
    },

    setPlaybackFilter: (
      state,
      action: PayloadAction<{ filterName: string; newFilter: PlaybackFilter }>
    ) => {
      const selectedFilterIndex = state.playback.filters.findIndex(
        (f: PlaybackFilter) => f.filter === action.payload.filterName
      );

      state.playback.filters[selectedFilterIndex] = action.payload.newFilter;
    },

    setFont: (state, action: PayloadAction<string>) => {
      state.lookAndFeel.font = action.payload;
    },

    setAudioDeviceId: (state, action: PayloadAction<string | undefined>) => {
      state.playback.audioDeviceId = action.payload;
    },

    setMpvAudioDeviceId: (state, action: PayloadAction<string | undefined>) => {
      state.playback.mpvAudioDeviceId = action.payload;
    },

    setPlayerBackend: (state, action: PayloadAction<'web' | 'mpv'>) => {
      state.playback.playerBackend = action.payload;
    },

    setMpvPath: (state, action: PayloadAction<string>) => {
      state.playback.mpvPath = action.payload;
    },

    setMpvGapless: (state, action: PayloadAction<'no' | 'weak' | 'yes'>) => {
      state.playback.mpvGapless = action.payload;
    },

    setMpvReplayGain: (state, action: PayloadAction<'no' | 'track' | 'album'>) => {
      state.playback.mpvReplayGain = action.payload;
    },

    removePlaybackFilter: (state, action: PayloadAction<{ filterName: string }>) => {
      state.playback.filters = state.playback.filters.filter(
        (f: PlaybackFilter) => f.filter !== action.payload.filterName
      );
    },

    setPlaybackFilters: (state, action: PayloadAction<PlaybackFilter[]>) => {
      state.playback.filters = action.payload;
    },

    setColumnList: (
      state,
      action: PayloadAction<{ listType: ColumnList; entries: ColumnEntry[] }>
    ) => {
      state.lookAndFeel.listView[action.payload.listType].columns = action.payload.entries;
    },

    setRowHeight: (state, action: PayloadAction<{ listType: ColumnList; height: number }>) => {
      state.lookAndFeel.listView[action.payload.listType].rowHeight = action.payload.height;
    },

    setFontSize: (state, action: PayloadAction<{ listType: ColumnList; size: number }>) => {
      state.lookAndFeel.listView[action.payload.listType].fontSize = action.payload.size;
    },

    setGridCardSize: (state, action: PayloadAction<{ size: number }>) => {
      state.lookAndFeel.gridView.cardSize = action.payload.size;
    },

    setGridGapSize: (state, action: PayloadAction<{ size: number }>) => {
      state.lookAndFeel.gridView.gapSize = action.payload.size;
    },

    setGridAlignment: (
      state,
      action: PayloadAction<{ alignment: string | 'flex-start' | 'center' }>
    ) => {
      state.lookAndFeel.gridView.alignment = action.payload.alignment;
    },

    moveToIndex: (
      state,
      action: PayloadAction<{
        entries: ColumnEntry[];
        moveBeforeId: string | undefined;
        listType: 'music' | 'album' | 'playlist' | 'artist' | 'genre' | 'mini';
      }>
    ) => {
      state.lookAndFeel.listView[action.payload.listType].columns = moveSelectedToIndex(
        state.lookAndFeel.listView[action.payload.listType].columns,
        action.payload.entries,
        action.payload.moveBeforeId
      );
    },

    setDiscord: (state, action: PayloadAction<ConfigPage['external']['discord']>) => {
      state.external.discord = action.payload;
    },

    setOBS: (state, action: PayloadAction<ConfigPage['external']['obs']>) => {
      state.external.obs = action.payload;
    },

    setHotkey: (
      state,
      action: PayloadAction<{ action: keyof ConfigPage['hotkeys']; key: string }>
    ) => {
      state.hotkeys[action.payload.action] = action.payload.key;
    },

    // The main process owns a long-lived Redux store (electron-redux's stateSyncEnhancer)
    // that is created once at app boot and never recomputed on renderer reload. Login/
    // disconnect write serverType directly to electron-store via IPC, bypassing Redux, so
    // without this action the main store's stale serverType gets synced back to the
    // renderer on the next reload, clobbering the value the renderer just persisted. See
    // bridge:settings:setCredentials and bridge:settings:disconnect in main.dev.mjs.
    setServerType: (state, action: PayloadAction<Server>) => {
      state.serverType = action.payload;
    },
  },
});

export const {
  replaceState,
  setActive,
  setPageSort,
  appendPlaybackFilter,
  removePlaybackFilter,
  setPlaybackFilter,
  setPlaybackFilters,
  setAudioDeviceId,
  setMpvAudioDeviceId,
  setPlayerBackend,
  setMpvPath,
  setMpvGapless,
  setMpvReplayGain,
  setColumnList,
  setRowHeight,
  setFont,
  setFontSize,
  setGridCardSize,
  setGridGapSize,
  setGridAlignment,
  moveToIndex,
  setDiscord,
  setOBS,
  setSidebar,
  setWindow,
  setPlayer,
  setHotkey,
  setServerType,
} = configSlice.actions;
export default configSlice.reducer;
