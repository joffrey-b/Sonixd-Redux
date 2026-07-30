import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RowDataType } from 'rsuite-table';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { submitRatingWithQueueFallback } from '../shared/offlineSubmission';
import { applyRatingSuccess } from '../shared/applyMutationSuccess';
import { selectEffectiveOffline } from '../redux/connectivitySlice';

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
  const effectiveOffline = useAppSelector(selectEffectiveOffline);

  const handleRating = useCallback(
    async (rowData: RowDataType, options: RatingOptions) => {
      await submitRatingWithQueueFallback({
        serverType: config.serverType,
        id: rowData.id,
        rating: options.rating,
        effectiveOffline,
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

      // Shared with offlineQueueFlush.ts's replayEntry -- see
      // applyMutationSuccess.ts for why these specific side effects (and not
      // the queryKey-specific update above) are the ones extracted.
      await applyRatingSuccess({ id: rowData.id, rating: options.rating }, dispatch, queryClient);
    },
    [config.serverType, effectiveOffline, queryClient, dispatch]
  );

  return { handleRating };
};
