import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RowDataType } from 'rsuite-table';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { apiController } from '../api/controller';
import { setRate } from '../redux/playQueueSlice';
import { setPlaylistRate } from '../redux/playlistSlice';
import { updateRatingInCache } from './useLibraryCache';

interface RatableItem {
  id: string;
  userRating?: number;
  [key: string]: unknown;
}

type RatableCacheData = { data?: RatableItem[]; song?: RatableItem[] } | RatableItem[];

interface RatingOptions {
  queryKey?: readonly unknown[];
  rating: number;
  custom?: () => void;
}

const rateItem = (item: RatableItem, id: string, rating: number) =>
  item.id === id ? { ...item, userRating: rating } : item;

export const useRating = () => {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);

  const handleRating = useCallback(
    async (rowData: RowDataType, options: RatingOptions) => {
      await apiController({
        serverType: config.serverType,
        endpoint: 'setRating',
        args: { ids: [rowData.id], rating: options.rating },
      });

      if (options?.queryKey) {
        // Return new object references so TanStack Query v5 detects the change
        queryClient.setQueryData(options.queryKey, (oldData: RatableCacheData | undefined) => {
          if (!oldData) return oldData;

          if (!Array.isArray(oldData)) {
            if (oldData.data) {
              return {
                ...oldData,
                data: oldData.data.map((item) => rateItem(item, rowData.id, options.rating)),
              };
            }
            if (oldData.song) {
              return {
                ...oldData,
                song: oldData.song.map((item) => rateItem(item, rowData.id, options.rating)),
              };
            }
          } else {
            return oldData.map((item) => rateItem(item, rowData.id, options.rating));
          }

          return oldData;
        });
      }

      if (options?.custom) {
        options.custom();
      }

      await queryClient.refetchQueries({ queryKey: ['starred'], type: 'active' });
      await queryClient.refetchQueries({ queryKey: ['searchpage'], type: 'active' });

      dispatch(setRate({ id: [rowData.id], rating: options.rating }));
      dispatch(setPlaylistRate({ id: [rowData.id], rating: options.rating }));
      updateRatingInCache(rowData.id, options.rating);
    },
    [config.serverType, dispatch, queryClient]
  );

  return { handleRating };
};
