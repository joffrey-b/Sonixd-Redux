import { useState, useEffect } from 'react';
import _ from 'lodash';
import { AdvancedFilters } from '../redux/viewSlice';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface AdvancedFilterItem {
  starred?: unknown;
  genre?: Array<{ title?: string }>;
  artist?: Array<{ id?: string }>;
  year?: number;
  uniqueId: string;
}

const useAdvancedFilter = <T extends AdvancedFilterItem>(data: T[], filters: AdvancedFilters) => {
  const [filteredData, setFilteredData] = useState<T[]>([]);
  const [byStarredData, setByStarredData] = useState<T[]>([]);
  const [byGenreData, setByGenreData] = useState<T[]>([]);
  const [byArtistData, setByArtistData] = useState<T[]>([]);
  const [byArtistBaseData, setByArtistBaseData] = useState<T[]>([]);
  const [byYearData, setByYearData] = useState<T[]>([]);

  useEffect(() => {
    // Use the incoming `filters` prop directly so filtering always reflects
    // the current render's values (not the stale previous-render state).
    if (filters.enabled) {
      // Favorite/Star filter
      const filteredByStarred = filters.properties.starred
        ? (data || []).filter((entry) => {
            return entry.starred !== undefined;
          })
        : data;

      const filteredByNotStarred = filters.properties.notStarred
        ? (data || []).filter((entry) => {
            return entry.starred === null || entry.starred === undefined;
          })
        : data;

      const starFilter = filters.properties.starred ? filteredByStarred : filteredByNotStarred;

      // Genre filter — escape special regex characters in genre names to prevent SyntaxError
      const genreRegex = new RegExp(
        filters.properties?.genre?.list.map(escapeRegex).join('|'),
        'i'
      );
      const filteredByGenres =
        filters.properties.genre.list.length > 0
          ? (starFilter || []).filter((entry) => {
              const entryGenres = _.map(entry.genre, 'title');

              if (filters.properties.genre.type === 'or') {
                return entryGenres.some((genre) => genre?.match(genreRegex));
              }

              const matches = [];
              for (let i = 0; i < filters.properties.genre.list.length; i += 1) {
                if (entryGenres.includes(filters.properties.genre.list[i])) {
                  matches.push(entry);
                }
              }

              return matches.length === filters.properties.genre.list.length;
            })
          : starFilter;

      // Artist filter — escape special regex characters in artist names
      const artistRegex = new RegExp(
        filters.properties?.artist?.list.map(escapeRegex).join('|'),
        'i'
      );

      const filteredByArtists =
        filters.properties.artist.list.length > 0
          ? (filteredByGenres || []).filter((entry) => {
              const entryArtistIds = _.map(entry.artist, 'id');

              if (filters.properties.artist.type === 'or') {
                return entryArtistIds.some((artistId) => artistId?.match(artistRegex));
              }

              const matches = [];
              for (let i = 0; i < filters.properties.artist.list.length; i += 1) {
                if (entryArtistIds.includes(filters.properties.artist.list[i])) {
                  matches.push(entry);
                }
              }

              return matches.length === filters.properties.artist.list.length;
            })
          : filteredByGenres;

      // Instead of filtering from the previous (genre), start from the starred filter
      const filteredByArtistsBase =
        filters.properties.artist.list.length > 0
          ? (starFilter || []).filter((entry) => {
              const entryArtistIds = _.map(entry.artist, 'id');

              if (filters.properties.artist.type === 'or') {
                return entryArtistIds.some((artistId) => artistId?.match(artistRegex));
              }

              const matches = [];
              for (let i = 0; i < filters.properties.artist.list.length; i += 1) {
                if (entryArtistIds.includes(filters.properties.artist.list[i])) {
                  matches.push(entry);
                }
              }

              return matches.length === filters.properties.artist.list.length;
            })
          : starFilter;

      const filteredByYear = !(
        filters.properties.year.from === 0 && filters.properties.year.to === 0
      )
        ? (filteredByArtists || []).filter((entry) => {
            if (filters.properties.year.from !== 0 && filters.properties.year.to === 0) {
              return entry.year && entry.year >= filters.properties.year.from;
            }

            if (filters.properties.year.from === 0 && filters.properties.year.to !== 0) {
              return entry.year && entry.year <= filters.properties.year.to;
            }

            if (filters.properties.year.from !== 0 && filters.properties.year.to !== 0) {
              return (
                entry.year &&
                entry.year >= filters.properties.year.from &&
                entry.year <= filters.properties.year.to
              );
            }
            return undefined;
          })
        : filteredByArtists;

      setByStarredData(_.compact(_.uniqBy(starFilter, 'uniqueId')));
      setByGenreData(_.compact(_.uniqBy(filteredByGenres, 'uniqueId')));
      setByArtistData(_.compact(_.uniqBy(filteredByArtists, 'uniqueId')));
      setByArtistBaseData(_.compact(_.uniqBy(filteredByArtistsBase, 'uniqueId')));
      setByYearData(_.compact(_.uniqBy(filteredByYear, 'uniqueId')));
      setFilteredData(_.compact(_.uniqBy(filteredByYear, 'uniqueId')));
    } else {
      setFilteredData(data);
    }
  }, [data, filters]);

  return { filteredData, byStarredData, byGenreData, byArtistData, byArtistBaseData, byYearData };
};

export default useAdvancedFilter;
