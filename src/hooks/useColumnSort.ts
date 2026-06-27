import { useState, useEffect, useMemo } from 'react';
import _ from 'lodash';
import { useTranslation } from 'react-i18next';
import { Item, Sort } from '../types';

const useColumnSort = (data: unknown[], type: Item, sort: Sort) => {
  const { t } = useTranslation();
  const [sortedData, setSortedData] = useState<unknown[]>([]);
  const [sortColumns, setSortColumns] = useState<{ label: string; dataKey: string }[]>([]);

  const albumColumns = useMemo(
    () => [
      { label: t('Artist'), dataKey: 'albumArtist' },
      { label: t('Created'), dataKey: 'created' },
      { label: t('Duration'), dataKey: 'duration' },
      { label: t('Favorite'), dataKey: 'starred' },
      { label: t('Genre'), dataKey: 'albumGenre' },
      { label: t('Play Count'), dataKey: 'playCount' },
      { label: t('Rating'), dataKey: 'userRating' },
      { label: t('Song Count'), dataKey: 'songCount' },
      { label: t('Title'), dataKey: 'title' },
      { label: t('Year'), dataKey: 'year' },
    ],
    [t]
  );

  const artistColumns = useMemo(
    () => [
      { label: t('Album Count'), dataKey: 'albumCount' },
      { label: t('Duration'), dataKey: 'duration' },
      { label: t('Favorite'), dataKey: 'starred' },
      { label: t('Rating'), dataKey: 'userRating' },
      { label: t('Title'), dataKey: 'title' },
    ],
    [t]
  );

  const musicColumns = useMemo(
    () => [
      { label: t('Artist'), dataKey: 'albumArtist' },
      { label: t('Bitrate'), dataKey: 'bitRate' },
      { label: t('Created'), dataKey: 'created' },
      { label: t('Duration'), dataKey: 'duration' },
      { label: t('Favorite'), dataKey: 'starred' },
      { label: t('Genre'), dataKey: 'albumGenre' },
      { label: t('Play Count'), dataKey: 'playCount' },
      { label: t('Rating'), dataKey: 'userRating' },
      { label: t('Size'), dataKey: 'size' },
      { label: t('Title'), dataKey: 'title' },
      { label: t('Year'), dataKey: 'year' },
    ],
    [t]
  );

  const playlistColumns = useMemo(
    () => [
      { label: t('Created'), dataKey: 'created' },
      { label: t('Description'), dataKey: 'comment' },
      { label: t('Duration'), dataKey: 'duration' },
      { label: t('Modified'), dataKey: 'changed' },
      { label: t('Owner'), dataKey: 'owner' },
      { label: t('Song Count'), dataKey: 'songCount' },
      { label: t('Title'), dataKey: 'title' },
      { label: t('Visibility'), dataKey: 'public' },
    ],
    [t]
  );

  const genreColumns = useMemo(
    () => [
      { label: t('Album Count'), dataKey: 'albumCount' },
      { label: t('Song Count'), dataKey: 'songCount' },
      { label: t('Title'), dataKey: 'title' },
    ],
    [t]
  );

  useEffect(() => {
    if (type === Item.Album) {
      return setSortColumns(albumColumns);
    }

    if (type === Item.Artist) {
      return setSortColumns(artistColumns);
    }

    if (type === Item.Music) {
      return setSortColumns(musicColumns);
    }

    if (type === Item.Genre) {
      return setSortColumns(genreColumns);
    }

    if (type === Item.Playlist) {
      return setSortColumns(playlistColumns);
    }
  }, [type, albumColumns, artistColumns, musicColumns, genreColumns, playlistColumns]);

  useEffect(() => {
    const safeData = data || [];
    const sortedByColumn = sort.column
      ? _.orderBy(
          safeData,
          [
            (entry: unknown) => {
              const e = entry as Record<string, unknown>;
              const col = sort.column ?? '';
              return typeof e[col] === 'string'
                ? (e[col] as string).toLowerCase() || ''
                : Number(e[col]) || '';
            },
          ],
          sort.type
        )
      : safeData;

    setSortedData(sortedByColumn);
  }, [data, sort.column, sort.type]);

  return { sortedData, sortColumns };
};

export default useColumnSort;
