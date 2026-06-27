import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { mockSettings } from '../shared/mockSettings';
import { getImageCachePath, getSongCachePath } from '../shared/utils';
import { getParsedSettings } from '../components/shared/settingsAccess';
import type { Settings } from '../components/shared/setDefaultSettings';

const parsedSettings = (
  process.env.NODE_ENV === 'test' ? mockSettings : getParsedSettings()
) as Partial<Settings>;

export interface ModalPage {
  pageType: string;
  id: string;
}

export interface Modal {
  show: boolean;
  currentPageIndex: number | undefined;
}

export interface ImgModal {
  show: boolean;
  src?: string;
}

export type ContextMenuOptions =
  | 'play'
  | 'addToQueueNext'
  | 'addToQueueLast'
  | 'removeSelected'
  | 'addToPlaylist'
  | 'deletePlaylist'
  | 'addToFavorites'
  | 'removeFromFavorites'
  | 'setRating'
  | 'viewInModal'
  | 'viewInFolder'
  | 'moveSelectedTo';

export interface ContextMenu {
  show: boolean;
  xPos?: number;
  yPos?: number;
  rowId?: string;
  type?: string;
  details?: unknown;
  disabledOptions?: ContextMenuOptions[];
}

export interface General {
  theme: string;
  modal: Modal;
  modalPages: ModalPage[];
  imgModal: ImgModal;
  isProcessingPlaylist: string[];
  contextMenu: ContextMenu;
  dynamicBackground: boolean;
  retainWindowSize: boolean;
  savedWindowSize: number[];
  savedWindowPos: number[];
  defaultWindowWidth: number;
  defaultWindowHeight: number;
  highlightOnRowHover: boolean;
  imageCachePath: string;
  songCachePath: string;
  titleBar: 'windows' | 'mac' | 'native' | string;
  searchQuery: string;
}

const initialState: General = {
  theme: String(parsedSettings.theme),
  modal: {
    show: false,
    currentPageIndex: undefined,
  },
  modalPages: [],
  imgModal: {
    show: false,
    src: undefined,
  },
  isProcessingPlaylist: [],
  contextMenu: {
    show: false,
  },
  dynamicBackground: Boolean(parsedSettings.dynamicBackground),
  retainWindowSize: Boolean(parsedSettings.retainWindowSize),
  savedWindowSize: parsedSettings.savedWindowSize || [1600, 900],
  savedWindowPos: parsedSettings.savedWindowPos || [0, 0],
  defaultWindowWidth: Number(parsedSettings.defaultWindowWidth) || 1600,
  defaultWindowHeight: Number(parsedSettings.defaultWindowHeight) || 900,
  highlightOnRowHover: Boolean(parsedSettings.highlightOnRowHover),
  imageCachePath: getImageCachePath(),
  songCachePath: getSongCachePath(),
  titleBar: String(parsedSettings.titleBarStyle ?? 'native'),
  searchQuery: '',
};

const miscSlice = createSlice({
  name: 'misc',
  initialState,
  reducers: {
    setDynamicBackground: (state, action: PayloadAction<boolean>) => {
      state.dynamicBackground = action.payload;
    },

    setRetainWindowSize: (state, action: PayloadAction<boolean>) => {
      state.retainWindowSize = action.payload;
    },
    savedWindowSize: (state, action: PayloadAction<Array<number>>) => {
      state.savedWindowSize = action.payload;
    },
    savedWindowPos: (state, action: PayloadAction<Array<number>>) => {
      state.savedWindowPos = action.payload;
    },
    setDefaultWindowWidth: (state, action: PayloadAction<number>) => {
      state.defaultWindowWidth = action.payload;
    },
    setDefaultWindowHeight: (state, action: PayloadAction<number>) => {
      state.defaultWindowHeight = action.payload;
    },

    setMiscSetting: (
      state,
      action: PayloadAction<{ setting: string; value: string | boolean }>
    ) => {
      switch (action.payload.setting) {
        case 'imageCachePath':
          state.imageCachePath = String(action.payload.value);
          break;
        case 'songCachePath':
          state.songCachePath = String(action.payload.value);
          break;
        case 'titleBar':
          state.titleBar = String(action.payload.value);
          break;
        case 'highlightOnRowHover':
          state.highlightOnRowHover = Boolean(action.payload.value);
          break;
        default:
          break;
      }
    },

    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },

    setContextMenu: (state, action: PayloadAction<ContextMenu>) => {
      state.contextMenu.show = action.payload.show;
      state.contextMenu.xPos = action.payload.xPos;
      state.contextMenu.yPos = action.payload.yPos;
      state.contextMenu.type = action.payload.type;
      state.contextMenu.details = action.payload.details;
      state.contextMenu.disabledOptions = action.payload.disabledOptions;
    },

    addProcessingPlaylist: (state, action: PayloadAction<string>) => {
      state.isProcessingPlaylist.push(action.payload);
    },

    removeProcessingPlaylist: (state, action: PayloadAction<string>) => {
      const filtered = state.isProcessingPlaylist.filter((id: string) => id !== action.payload);

      state.isProcessingPlaylist = filtered;
    },

    setTheme: (state, action: PayloadAction<string>) => {
      state.theme = action.payload;
    },

    setImgModal: (state, action: PayloadAction<ImgModal>) => {
      state.imgModal = action.payload;
    },

    hideModal: (state) => {
      state.modal.show = false;
      state.modal.currentPageIndex = undefined;
      state.modalPages = [];
    },

    addModalPage: (state, action: PayloadAction<ModalPage>) => {
      state.modal.show = true;

      if (
        state.modalPages[
          state.modal.currentPageIndex === undefined ? 0 : state.modal.currentPageIndex
        ]?.id !== action.payload.id
      ) {
        state.modalPages.push(action.payload);

        if (state.modal.currentPageIndex === undefined) {
          state.modal.currentPageIndex = 0;
        } else {
          state.modal.currentPageIndex = state.modalPages.length - 1;
        }
      }
    },

    incrementModalPage: (state) => {
      if (state.modal.currentPageIndex === undefined) {
        state.modal.currentPageIndex = 0;
      }
      if (state.modal.currentPageIndex + 1 < state.modalPages.length) {
        state.modal.currentPageIndex += 1;
      }
    },

    decrementModalPage: (state) => {
      if (state.modal.currentPageIndex === undefined) {
        state.modal.currentPageIndex = 0;
      }
      if (state.modal.currentPageIndex - 1 >= 0) {
        state.modal.currentPageIndex -= 1;
        state.modalPages.pop();
      }
    },
  },
});

export const {
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
} = miscSlice.actions;
export default miscSlice.reducer;
