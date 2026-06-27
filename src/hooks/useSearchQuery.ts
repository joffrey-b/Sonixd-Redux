import { useState, useEffect } from 'react';
import _ from 'lodash';

const useSearchQuery = (searchQuery: string, data: unknown[], filterProperties: string[]) => {
  const [filteredData, setFilteredData] = useState<unknown[]>([]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchQuery !== '') {
        const matches: unknown[] = [];
        filterProperties.map((prop: string) => {
          const filteredDataByProp = (data || []).filter((entry) => {
            const e = entry as Record<string, unknown>;
            if (prop.match('artist')) {
              return String(e.albumArtist)?.toLowerCase().includes(searchQuery.toLowerCase());
            }

            if (prop.match('genre') && e.genre) {
              const genres = e.genre as Array<{ title?: string }>;
              return String(genres[0]?.title)?.toLowerCase().includes(searchQuery.toLowerCase());
            }

            return String(e[prop])?.toLowerCase().includes(searchQuery.toLowerCase());
          });

          return filteredDataByProp.map((entry) => matches.push(entry));
        });

        setFilteredData(_.uniqBy(matches, 'uniqueId'));
      } else {
        setFilteredData([]);
      }
    }, 500);

    return () => clearTimeout(debounce);
  }, [data, filterProperties, searchQuery]);

  return filteredData;
};

export default useSearchQuery;
