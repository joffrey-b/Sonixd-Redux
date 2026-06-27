import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { mockSettings } from '../shared/mockSettings';
import { getParsedSettings } from '../components/shared/settingsAccess';
import type { Settings } from '../components/shared/setDefaultSettings';

const parsedSettings = (
  process.env.NODE_ENV === 'test' ? mockSettings : getParsedSettings()
) as Partial<Settings>;

export interface FolderSelection {
  musicFolder?: string;
  musicFolderName?: string;
  applied: {
    albums: boolean;
    artists: boolean;
    dashboard: boolean;
    search: boolean;
    starred: boolean;
    music: boolean;
  };
  currentViewedFolder?: string;
}

const initialState: FolderSelection = {
  musicFolder:
    parsedSettings.musicFolder?.id == null ? undefined : String(parsedSettings.musicFolder.id),
  musicFolderName: parsedSettings.musicFolder?.name
    ? String(parsedSettings.musicFolder.name)
    : undefined,
  applied: {
    albums: parsedSettings.musicFolder?.albums ?? true,
    artists: parsedSettings.musicFolder?.artists ?? true,
    dashboard: parsedSettings.musicFolder?.dashboard ?? true,
    search: parsedSettings.musicFolder?.search ?? false,
    starred: parsedSettings.musicFolder?.starred ?? false,
    music: parsedSettings.musicFolder?.music ?? true,
  },
  currentViewedFolder: undefined,
};

const folderSlice = createSlice({
  name: 'folder',
  initialState,
  reducers: {
    setMusicFolder: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.musicFolder = action.payload.id;
      state.musicFolderName = action.payload.name;
    },

    setCurrentViewedFolder: (state, action: PayloadAction<string>) => {
      state.currentViewedFolder = action.payload;
    },

    setAppliedFolderViews: (state, action: PayloadAction<FolderSelection['applied']>) => {
      state.applied = action.payload;
    },
  },
});

export const { setMusicFolder, setCurrentViewedFolder, setAppliedFolderViews } =
  folderSlice.actions;
export default folderSlice.reducer;
