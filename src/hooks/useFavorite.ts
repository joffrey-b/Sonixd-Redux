import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RowDataType } from 'rsuite-table';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { apiController } from '../api/controller';
import { setStar } from '../redux/playQueueSlice';
import { setPlaylistStar } from '../redux/playlistSlice';
import { updateStarredInCache } from './useLibraryCache';

interface StarrableItem {
  id: string;
  starred?: number;
  [key: string]: unknown;
}

const starItem = (item: StarrableItem, id: string, favorite: boolean) =>
  item.id === id ? { ...item, starred: favorite ? Date.now() : undefined } : item;

interface FavoriteOptions {
  queryKey?: readonly unknown[];
  custom?: () => void;
}

type StarrableCacheData =
  | { data?: StarrableItem[]; album?: StarrableItem[]; song?: StarrableItem[] }
  | StarrableItem[];

const useFavorite = () => {
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);
  const queryClient = useQueryClient();

  const handleFavorite = useCallback(
    async (rowData: RowDataType, options?: FavoriteOptions) => {
      const favorite = !rowData.starred;

      await apiController({
        serverType: config.serverType,
        endpoint: favorite ? 'star' : 'unstar',
        args: { id: rowData.id, type: rowData.type },
      });

      if (options?.queryKey) {
        // Return new object references so TanStack Query v5 detects the change
        queryClient.setQueryData(options.queryKey, (oldData: StarrableCacheData | undefined) => {
          if (!oldData) return oldData;

          if (!Array.isArray(oldData)) {
            if (oldData.data) {
              return {
                ...oldData,
                data: oldData.data.map((item) => starItem(item, rowData.id, favorite)),
              };
            }
            if (oldData.album) {
              return {
                ...oldData,
                album: oldData.album.map((item) => starItem(item, rowData.id, favorite)),
              };
            }
            if (oldData.song) {
              return {
                ...oldData,
                song: oldData.song.map((item) => starItem(item, rowData.id, favorite)),
              };
            }
          } else {
            return oldData.map((item) => starItem(item, rowData.id, favorite));
          }

          return oldData;
        });
      }

      if (options?.custom) {
        options.custom();
      }

      dispatch(setStar({ id: [rowData.id], type: favorite ? 'star' : 'unstar' }));
      dispatch(setPlaylistStar({ id: [rowData.id], type: favorite ? 'star' : 'unstar' }));
      updateStarredInCache(rowData.id, favorite);
    },
    [config.serverType, dispatch, queryClient]
  );

  return { handleFavorite };
};

export default useFavorite;
