import Store from 'electron-store';
import { Song } from '../../types';

// Songs stored without uniqueId (regenerated at read time) and with starred
// simplified to boolean for easier filtering and serialization.
export type LibraryCacheSong = Omit<Song, 'uniqueId' | 'starred'> & {
  starred: boolean;
};

interface LibraryCacheData {
  songs: LibraryCacheSong[];
  lastSyncedAt: string | null;
  serverUrl: string | null;
}

export const libraryCache = new Store<LibraryCacheData>({
  name: 'library-cache',
  defaults: {
    songs: [],
    lastSyncedAt: null,
    serverUrl: null,
  },
});
