import { Song } from '../../types';

// Songs stored without uniqueId (regenerated at read time) and with starred
// simplified to boolean for easier filtering and serialization.
export type LibraryCacheSong = Omit<Song, 'uniqueId' | 'starred'> & {
  starred: boolean;
};
