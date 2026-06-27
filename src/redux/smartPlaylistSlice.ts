import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { nanoid } from 'nanoid/non-secure';
import { SmartPlaylist } from '../types';
import { settings } from '../components/shared/bridge';

interface SmartPlaylistState {
  playlists: SmartPlaylist[];
  librarySyncedAt: string | null;
}

const initialState: SmartPlaylistState = {
  playlists: (settings.get('smartPlaylists') as SmartPlaylist[]) || [],
  librarySyncedAt: (settings.get('librarySyncedAt') as string) || null,
};

const smartPlaylistSlice = createSlice({
  name: 'smartPlaylist',
  initialState,
  reducers: {
    addSmartPlaylist: (state, action: PayloadAction<Omit<SmartPlaylist, 'id'>>) => {
      const newPlaylist: SmartPlaylist = { ...action.payload, id: nanoid() };
      state.playlists.push(newPlaylist);
    },
    updateSmartPlaylist: (state, action: PayloadAction<SmartPlaylist>) => {
      const index = state.playlists.findIndex((p) => p.id === action.payload.id);
      if (index !== -1) {
        state.playlists[index] = action.payload;
      }
    },
    deleteSmartPlaylist: (state, action: PayloadAction<string>) => {
      state.playlists = state.playlists.filter((p) => p.id !== action.payload);
    },
    setLibrarySyncedAt: (state, action: PayloadAction<string>) => {
      state.librarySyncedAt = action.payload;
    },
  },
});

export const { addSmartPlaylist, updateSmartPlaylist, deleteSmartPlaylist, setLibrarySyncedAt } =
  smartPlaylistSlice.actions;
export default smartPlaylistSlice.reducer;
