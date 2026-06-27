import type { TFunction } from 'i18next';

export const getSongColumnList = (t: TFunction) => [
  {
    label: t('# (Drag/Drop)'),
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: t('# (Drag/Drop)'),
    },
  },
  {
    label: t('Album'),
    value: {
      id: t('Album'),
      dataKey: 'album',
      alignment: 'left',
      resizable: true,
      width: 200,
      label: t('Album'),
    },
  },
  {
    label: t('Artist'),
    value: {
      id: t('Artist'),
      dataKey: 'artist',
      alignment: 'left',
      resizable: true,
      width: 200,
      label: t('Artist'),
    },
  },
  {
    label: t('Bitrate'),
    value: {
      id: t('Bitrate'),
      dataKey: 'bitRate',
      alignment: 'left',
      resizable: true,
      width: 100,
      label: t('Bitrate'),
    },
  },
  {
    label: t('CoverArt'),
    value: {
      id: t('Art'),
      dataKey: 'coverart',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('CoverArt'),
    },
  },
  {
    label: t('Created'),
    value: {
      id: t('Created'),
      dataKey: 'created',
      alignment: 'left',
      resizable: true,
      width: 100,
      label: t('Created'),
    },
  },
  {
    label: t('Duration'),
    value: {
      id: t('Duration'),
      dataKey: 'duration',
      alignment: 'center',
      resizable: true,
      width: 80,
      label: t('Duration'),
    },
  },
  {
    label: t('Favorite'),
    value: {
      id: t('Fav'),
      dataKey: 'starred',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('Favorite'),
    },
  },
  {
    label: t('Genre'),
    value: {
      id: t('Genre'),
      dataKey: 'genre',
      alignment: 'left',
      resizable: true,
      width: 150,
      label: t('Genre'),
    },
  },
  {
    label: t('Path'),
    value: {
      id: t('Path'),
      dataKey: 'path',
      alignment: 'left',
      resizable: true,
      width: 200,
      label: t('Path'),
    },
  },
  {
    label: t('Play Count'),
    value: {
      id: t('Plays'),
      dataKey: 'playCount',
      alignment: 'center',
      resizable: true,
      width: 60,
      label: t('Play Count'),
    },
  },
  {
    label: t('Rating'),
    value: {
      id: t('Rate'),
      dataKey: 'userRating',
      alignment: 'center',
      resizable: true,
      width: 150,
      label: t('Rating'),
    },
  },
  {
    label: t('Size'),
    value: {
      id: t('Size'),
      dataKey: 'size',
      alignment: 'center',
      resizable: true,
      width: 150,
      label: t('Size'),
    },
  },
  {
    label: t('Track'),
    value: {
      id: t('Track #'),
      dataKey: 'track',
      alignment: 'left',
      resizable: true,
      width: 80,
      label: t('Track'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      resizable: true,
      width: 300,
      label: t('Title'),
    },
  },
  {
    label: t('Title (Combined)'),
    value: {
      id: t('Title'),
      dataKey: 'combinedtitle',
      alignment: 'left',
      resizable: true,
      width: 300,
      label: t('Title (Combined)'),
    },
  },
  {
    label: t('Year'),
    value: {
      id: t('Year'),
      dataKey: 'year',
      alignment: 'left',
      resizable: true,
      width: 60,
      label: t('Year'),
    },
  },
];

export const getSongColumnListAuto = (t: TFunction) => [
  {
    label: t('# (Drag/Drop)'),
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: t('# (Drag/Drop)'),
    },
  },
  {
    label: t('Album'),
    value: {
      id: t('Album'),
      dataKey: 'album',
      alignment: 'left',
      flexGrow: 3,
      label: t('Album'),
    },
  },
  {
    label: t('Artist'),
    value: {
      id: t('Artist'),
      dataKey: 'artist',
      alignment: 'left',
      flexGrow: 3,
      label: t('Artist'),
    },
  },
  {
    label: t('Bitrate'),
    value: {
      id: t('Bitrate'),
      dataKey: 'bitRate',
      alignment: 'left',
      flexGrow: 1,
      label: t('Bitrate'),
    },
  },
  {
    label: t('CoverArt'),
    value: {
      id: t('Art'),
      dataKey: 'coverart',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('CoverArt'),
    },
  },
  {
    label: t('Created'),
    value: {
      id: t('Created'),
      dataKey: 'created',
      alignment: 'left',
      flexGrow: 2,
      label: t('Created'),
    },
  },
  {
    label: t('Duration'),
    value: {
      id: t('Duration'),
      dataKey: 'duration',
      alignment: 'center',
      flexGrow: 2,
      label: t('Duration'),
    },
  },
  {
    label: t('Favorite'),
    value: {
      id: t('Fav'),
      dataKey: 'starred',
      alignment: 'center',
      flexGrow: 1,
      label: t('Favorite'),
    },
  },
  {
    label: t('Genre'),
    value: {
      id: t('Genre'),
      dataKey: 'genre',
      alignment: 'left',
      flexGrow: 2,
      label: t('Genre'),
    },
  },
  {
    label: t('Path'),
    value: {
      id: t('Path'),
      dataKey: 'path',
      alignment: 'left',
      flexGrow: 3,
      label: t('Path'),
    },
  },
  {
    label: t('Play Count'),
    value: {
      id: t('Plays'),
      dataKey: 'playCount',
      alignment: 'center',
      flexGrow: 1,
      label: t('Play Count'),
    },
  },
  {
    label: t('Rating'),
    value: {
      id: t('Rate'),
      dataKey: 'userRating',
      alignment: 'center',
      flexGrow: 3,
      label: t('Rating'),
    },
  },
  {
    label: t('Size'),
    value: {
      id: t('Size'),
      dataKey: 'size',
      alignment: 'center',
      flexGrow: 1,
      label: t('Size'),
    },
  },
  {
    label: t('Track'),
    value: {
      id: t('Track #'),
      dataKey: 'track',
      alignment: 'left',
      flexGrow: 1,
      label: t('Track'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      flexGrow: 5,
      label: t('Title'),
    },
  },
  {
    label: t('Title (Combined)'),
    value: {
      id: t('Title'),
      dataKey: 'combinedtitle',
      alignment: 'left',
      flexGrow: 5,
      label: t('Title (Combined)'),
    },
  },
  {
    label: t('Year'),
    value: {
      id: t('Year'),
      dataKey: 'year',
      alignment: 'left',
      flexGrow: 1,
      label: t('Year'),
    },
  },
];

export const getSongColumnPicker = (t: TFunction) => [
  { label: t('# (Drag/Drop)') },
  { label: t('Album') },
  { label: t('Artist') },
  { label: t('Bitrate') },
  { label: t('CoverArt') },
  { label: t('Created') },
  { label: t('Duration') },
  { label: t('Favorite') },
  { label: t('Genre') },
  { label: t('Path') },
  { label: t('Play Count') },
  { label: t('Rating') },
  { label: t('Size') },
  { label: t('Track') },
  { label: t('Title') },
  { label: t('Title (Combined)') },
  { label: t('Year') },
];

export const getAlbumColumnList = (t: TFunction) => [
  {
    label: '#',
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: '#',
    },
  },
  {
    label: t('Artist'),
    value: {
      id: t('Artist'),
      dataKey: 'artist',
      alignment: 'left',
      resizable: true,
      width: 200,
      label: t('Artist'),
    },
  },
  {
    label: t('CoverArt'),
    value: {
      id: t('Art'),
      dataKey: 'coverart',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('CoverArt'),
    },
  },
  {
    label: t('Created'),
    value: {
      id: t('Created'),
      dataKey: 'created',
      alignment: 'left',
      resizable: true,
      width: 100,
      label: t('Created'),
    },
  },
  {
    label: t('Duration'),
    value: {
      id: t('Duration'),
      dataKey: 'duration',
      alignment: 'center',
      resizable: true,
      width: 80,
      label: t('Duration'),
    },
  },
  {
    label: t('Favorite'),
    value: {
      id: t('Fav'),
      dataKey: 'starred',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('Favorite'),
    },
  },
  {
    label: t('Genre'),
    value: {
      id: t('Genre'),
      dataKey: 'genre',
      alignment: 'left',
      resizable: true,
      width: 70,
      label: t('Genre'),
    },
  },
  {
    label: t('Play Count'),
    value: {
      id: t('Plays'),
      dataKey: 'playCount',
      alignment: 'center',
      resizable: true,
      width: 60,
      label: t('Play Count'),
    },
  },
  {
    label: t('Rating'),
    value: {
      id: t('Rate'),
      dataKey: 'userRating',
      alignment: 'center',
      resizable: true,
      width: 150,
      label: t('Rating'),
    },
  },
  {
    label: t('Track Count'),
    value: {
      id: t('Tracks'),
      dataKey: 'songCount',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('Track Count'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      resizable: true,
      width: 300,
      label: t('Title'),
    },
  },
  {
    label: t('Title (Combined)'),
    value: {
      id: t('Title'),
      dataKey: 'combinedtitle',
      alignment: 'left',
      resizable: true,
      width: 300,
      label: t('Title (Combined)'),
    },
  },
  {
    label: t('Year'),
    value: {
      id: t('Year'),
      dataKey: 'year',
      alignment: 'left',
      resizable: true,
      width: 60,
      label: t('Year'),
    },
  },
];

export const getAlbumColumnListAuto = (t: TFunction) => [
  {
    label: '#',
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: '#',
    },
  },
  {
    label: t('Artist'),
    value: {
      id: t('Artist'),
      dataKey: 'artist',
      alignment: 'left',
      flexGrow: 3,
      label: t('Artist'),
    },
  },
  {
    label: t('CoverArt'),
    value: {
      id: t('Art'),
      dataKey: 'coverart',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('CoverArt'),
    },
  },
  {
    label: t('Created'),
    value: {
      id: t('Created'),
      dataKey: 'created',
      alignment: 'left',
      flexGrow: 2,
      label: t('Created'),
    },
  },
  {
    label: t('Duration'),
    value: {
      id: t('Duration'),
      dataKey: 'duration',
      alignment: 'center',
      flexGrow: 2,
      label: t('Duration'),
    },
  },
  {
    label: t('Favorite'),
    value: {
      id: t('Fav'),
      dataKey: 'starred',
      alignment: 'center',
      flexGrow: 1,
      label: t('Favorite'),
    },
  },
  {
    label: t('Genre'),
    value: {
      id: t('Genre'),
      dataKey: 'genre',
      alignment: 'left',
      flexGrow: 2,
      label: t('Genre'),
    },
  },
  {
    label: t('Play Count'),
    value: {
      id: t('Plays'),
      dataKey: 'playCount',
      alignment: 'center',
      resizable: true,
      width: 60,
      label: t('Play Count'),
    },
  },
  {
    label: t('Rating'),
    value: {
      id: t('Rate'),
      dataKey: 'userRating',
      alignment: 'center',
      flexGrow: 3,
      label: t('Rating'),
    },
  },
  {
    label: t('Track Count'),
    value: {
      id: t('Tracks'),
      dataKey: 'songCount',
      alignment: 'center',
      flexGrow: 1,
      label: t('Track Count'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      flexGrow: 5,
      label: t('Title'),
    },
  },
  {
    label: t('Title (Combined)'),
    value: {
      id: t('Title'),
      dataKey: 'combinedtitle',
      alignment: 'left',
      flexGrow: 5,
      label: t('Title (Combined)'),
    },
  },
  {
    label: t('Year'),
    value: {
      id: t('Year'),
      dataKey: 'year',
      alignment: 'left',
      flexGrow: 1,
      label: t('Year'),
    },
  },
];

export const getAlbumColumnPicker = (t: TFunction) => [
  { label: '#' },
  { label: t('Artist') },
  { label: t('CoverArt') },
  { label: t('Created') },
  { label: t('Duration') },
  { label: t('Favorite') },
  { label: t('Genre') },
  { label: t('Play Count') },
  { label: t('Rating') },
  { label: t('Title') },
  { label: t('Title (Combined)') },
  { label: t('Track Count') },
  { label: t('Year') },
];

export const getPlaylistColumnList = (t: TFunction) => [
  {
    label: '#',
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: '#',
    },
  },
  {
    label: t('CoverArt'),
    value: {
      id: t('Art'),
      dataKey: 'coverart',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('CoverArt'),
    },
  },
  {
    label: t('Created'),
    value: {
      id: t('Created'),
      dataKey: 'created',
      alignment: 'left',
      resizable: true,
      width: 100,
      label: t('Created'),
    },
  },
  {
    label: t('Description'),
    value: {
      id: t('Description'),
      dataKey: 'comment',
      alignment: 'left',
      resizable: true,
      width: 200,
      label: t('Description'),
    },
  },
  {
    label: t('Duration'),
    value: {
      id: t('Duration'),
      dataKey: 'duration',
      alignment: 'center',
      resizable: true,
      width: 80,
      label: t('Duration'),
    },
  },
  {
    label: t('Genre'),
    value: {
      id: t('Genre'),
      dataKey: 'genre',
      alignment: 'left',
      resizable: true,
      width: 70,
      label: t('Genre'),
    },
  },
  {
    label: t('Modified'),
    value: {
      id: t('Modified'),
      dataKey: 'changed',
      alignment: 'left',
      resizable: true,
      width: 100,
      label: t('Modified'),
    },
  },
  {
    label: t('Owner'),
    value: {
      id: t('Owner'),
      dataKey: 'owner',
      alignment: 'left',
      resizable: true,
      width: 150,
      label: t('Owner'),
    },
  },
  {
    label: t('Play Count'),
    value: {
      id: t('Plays'),
      dataKey: 'playCount',
      alignment: 'center',
      resizable: true,
      width: 60,
      label: t('Play Count'),
    },
  },
  {
    label: t('Track Count'),
    value: {
      id: t('Tracks'),
      dataKey: 'songCount',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('Track Count'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      resizable: true,
      width: 300,
      label: t('Title'),
    },
  },
  {
    label: t('Visibility'),
    value: {
      id: t('Visibility'),
      dataKey: 'public',
      alignment: 'left',
      resizable: true,
      width: 100,
      label: t('Visibility'),
    },
  },
];

export const getPlaylistColumnListAuto = (t: TFunction) => [
  {
    label: '#',
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: '#',
    },
  },
  {
    label: t('CoverArt'),
    value: {
      id: t('Art'),
      dataKey: 'coverart',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('CoverArt'),
    },
  },
  {
    label: t('Created'),
    value: {
      id: t('Created'),
      dataKey: 'created',
      alignment: 'left',
      flexGrow: 2,
      label: t('Created'),
    },
  },
  {
    label: t('Description'),
    value: {
      id: t('Description'),
      dataKey: 'comment',
      alignment: 'left',
      flexGrow: 3,
      label: t('Description'),
    },
  },
  {
    label: t('Duration'),
    value: {
      id: t('Duration'),
      dataKey: 'duration',
      alignment: 'center',
      flexGrow: 2,
      label: t('Duration'),
    },
  },
  {
    label: t('Genre'),
    value: {
      id: t('Genre'),
      dataKey: 'genre',
      alignment: 'left',
      flexGrow: 2,
      label: t('Genre'),
    },
  },
  {
    label: t('Modified'),
    value: {
      id: t('Modified'),
      dataKey: 'changed',
      alignment: 'left',
      flexGrow: 2,
      label: t('Modified'),
    },
  },
  {
    label: t('Owner'),
    value: {
      id: t('Owner'),
      dataKey: 'owner',
      alignment: 'left',
      flexGrow: 1,
      label: t('Owner'),
    },
  },
  {
    label: t('Play Count'),
    value: {
      id: t('Plays'),
      dataKey: 'playCount',
      alignment: 'center',
      flexGrow: 1,
      label: t('Play Count'),
    },
  },
  {
    label: t('Track Count'),
    value: {
      id: t('Tracks'),
      dataKey: 'songCount',
      alignment: 'center',
      flexGrow: 1,
      label: t('Track Count'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      flexGrow: 5,
      label: t('Title'),
    },
  },
  {
    label: t('Visibility'),
    value: {
      id: t('Visibility'),
      dataKey: 'public',
      alignment: 'left',
      flexGrow: 2,
      label: t('Visibility'),
    },
  },
];

export const getPlaylistColumnPicker = (t: TFunction) => [
  { label: '#' },
  { label: t('CoverArt') },
  { label: t('Created') },
  { label: t('Description') },
  { label: t('Duration') },
  { label: t('Modified') },
  { label: t('Owner') },
  { label: t('Title') },
  { label: t('Track Count') },
  { label: t('Visibility') },
];

export const getArtistColumnList = (t: TFunction) => [
  {
    label: '#',
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: '#',
    },
  },
  {
    label: t('Album Count'),
    value: {
      id: t('Album Count'),
      dataKey: 'albumCount',
      alignment: 'left',
      resizable: true,
      width: 100,
      label: t('Album Count'),
    },
  },
  {
    label: t('CoverArt'),
    value: {
      id: t('Art'),
      dataKey: 'coverart',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('CoverArt'),
    },
  },
  {
    label: t('Duration'),
    value: {
      id: t('Duration'),
      dataKey: 'duration',
      alignment: 'center',
      width: 80,
      label: t('Duration'),
    },
  },
  {
    label: t('Favorite'),
    value: {
      id: t('Fav'),
      dataKey: 'starred',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('Favorite'),
    },
  },
  {
    label: t('Genre'),
    value: {
      id: t('Genre'),
      dataKey: 'genre',
      alignment: 'left',
      resizable: true,
      width: 70,
      label: t('Genre'),
    },
  },
  {
    label: t('Rating'),
    value: {
      id: t('Rate'),
      dataKey: 'userRating',
      alignment: 'center',
      resizable: true,
      width: 150,
      label: t('Rating'),
    },
  },

  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      resizable: true,
      width: 300,
      label: t('Title'),
    },
  },
];

export const getArtistColumnListAuto = (t: TFunction) => [
  {
    label: '#',
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: '#',
    },
  },
  {
    label: t('Album Count'),
    value: {
      id: t('Album Count'),
      dataKey: 'albumCount',
      alignment: 'left',
      flexGrow: 1,
      label: t('Album Count'),
    },
  },
  {
    label: t('CoverArt'),
    value: {
      id: t('Art'),
      dataKey: 'coverart',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('CoverArt'),
    },
  },
  {
    label: t('Duration'),
    value: {
      id: t('Duration'),
      dataKey: 'duration',
      alignment: 'center',
      flexGrow: 2,
      label: t('Duration'),
    },
  },
  {
    label: t('Favorite'),
    value: {
      id: t('Fav'),
      dataKey: 'starred',
      alignment: 'center',
      flexGrow: 1,
      label: t('Favorite'),
    },
  },
  {
    label: t('Genre'),
    value: {
      id: t('Genre'),
      dataKey: 'genre',
      alignment: 'center',
      flexGrow: 2,
      label: t('Genre'),
    },
  },
  {
    label: t('Rating'),
    value: {
      id: t('Rate'),
      dataKey: 'userRating',
      alignment: 'center',
      flexGrow: 3,
      label: t('Rating'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      flexGrow: 5,
      label: t('Title'),
    },
  },
];

export const getArtistColumnPicker = (t: TFunction) => [
  { label: '#' },
  { label: t('Album Count') },
  { label: t('CoverArt') },
  { label: t('Duration') },
  { label: t('Favorite') },
  { label: t('Genre') },
  { label: t('Rating') },
  { label: t('Title') },
];

export const getGenreColumnPicker = (t: TFunction) => [
  { label: '#' },
  { label: t('Album Count') },
  { label: t('Title') },
  { label: t('Track Count') },
];

export const getGenreColumnList = (t: TFunction) => [
  {
    label: '#',
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: '#',
    },
  },
  {
    label: t('Album Count'),
    value: {
      id: t('Album Count'),
      dataKey: 'albumCount',
      alignment: 'left',
      resizable: true,
      width: 100,
      label: t('Album Count'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      resizable: true,
      width: 300,
      label: t('Title'),
    },
  },
  {
    label: t('Track Count'),
    value: {
      id: t('Tracks'),
      dataKey: 'songCount',
      alignment: 'center',
      resizable: true,
      width: 100,
      label: t('Track Count'),
    },
  },
];

export const getGenreColumnListAuto = (t: TFunction) => [
  {
    label: '#',
    value: {
      id: '#',
      dataKey: 'index',
      alignment: 'center',
      resizable: true,
      width: 50,
      label: '#',
    },
  },
  {
    label: t('Album Count'),
    value: {
      id: t('Albums'),
      dataKey: 'albumCount',
      alignment: 'left',
      flexGrow: 1,
      label: t('Album Count'),
    },
  },
  {
    label: t('Title'),
    value: {
      id: t('Title'),
      dataKey: 'title',
      alignment: 'left',
      flexGrow: 5,
      label: t('Title'),
    },
  },
  {
    label: t('Track Count'),
    value: {
      id: t('Tracks'),
      dataKey: 'songCount',
      alignment: 'center',
      flexGrow: 1,
      label: t('Track Count'),
    },
  },
];
