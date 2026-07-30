jest.mock('../shared/offlineSubmission', () => ({
  submitRatingWithQueueFallback: jest.fn(),
}));
jest.mock('../hooks/useLibraryCache', () => ({
  updateRatingInCache: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureStore } from '@reduxjs/toolkit';
import { useRating } from '../hooks/useRating';
import { submitRatingWithQueueFallback } from '../shared/offlineSubmission';
import { updateRatingInCache } from '../hooks/useLibraryCache';
import configReducer from '../redux/configSlice';
import playQueueReducer from '../redux/playQueueSlice';
import playlistReducer from '../redux/playlistSlice';
import connectivityReducer from '../redux/connectivitySlice';
import { Server } from '../types';

const mockSubmit = submitRatingWithQueueFallback as jest.MockedFunction<
  typeof submitRatingWithQueueFallback
>;

function makeStore() {
  return configureStore({
    reducer: {
      config: configReducer,
      playQueue: playQueueReducer,
      playlist: playlistReducer,
      connectivity: connectivityReducer,
    },
    preloadedState: {
      config: { ...configReducer(undefined, { type: '@@INIT' }), serverType: Server.Subsonic },
      connectivity: { pingConfirmedUnreachable: false, isManuallyForced: false },
    },
  });
}

// Cast to a component type that accepts { store/client, children } directly
// -- avoids a strict createElement overload-resolution error when passing
// children as the third argument instead of inside props (this file is
// .ts, not .tsx, so JSX isn't available). Mirrors playerControls.test.ts's
// identical StoreProvider cast.
const StoreProvider = Provider as React.ComponentType<{
  store: ReturnType<typeof makeStore>;
  children?: React.ReactNode;
}>;
const QueryProvider = QueryClientProvider as React.ComponentType<{
  client: QueryClient;
  children?: React.ReactNode;
}>;

function renderUseRating() {
  const store = makeStore();
  const queryClient = new QueryClient();
  const refetchSpy = jest.spyOn(queryClient, 'refetchQueries');
  const setQueryDataSpy = jest.spyOn(queryClient, 'setQueryData');

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      StoreProvider,
      { store },
      React.createElement(QueryProvider, { client: queryClient }, children)
    );

  const { result } = renderHook(() => useRating(), { wrapper });
  return { result, refetchSpy, setQueryDataSpy };
}

describe('useRating -- error propagation after a queued (Fix 3) submission', () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    (updateRatingInCache as jest.Mock).mockReset();
  });

  it('does not run its refetch/optimistic-update logic when the submission call throws', async () => {
    mockSubmit.mockRejectedValue(new Error('offline'));
    const { result, refetchSpy, setQueryDataSpy } = renderUseRating();

    await act(async () => {
      await expect(
        result.current.handleRating({ id: 'song1' } as never, {
          rating: 4,
          queryKey: ['album', 'album1'],
        })
      ).rejects.toThrow('offline');
    });

    expect(setQueryDataSpy).not.toHaveBeenCalled();
    expect(refetchSpy).not.toHaveBeenCalled();
    expect(updateRatingInCache).not.toHaveBeenCalled();
  });

  it('does run its refetch/optimistic-update logic when the submission call succeeds', async () => {
    mockSubmit.mockResolvedValue(undefined);
    const { result, refetchSpy, setQueryDataSpy } = renderUseRating();

    await act(async () => {
      await result.current.handleRating({ id: 'song1' } as never, {
        rating: 4,
        queryKey: ['album', 'album1'],
      });
    });

    expect(setQueryDataSpy).toHaveBeenCalled();
    expect(refetchSpy).toHaveBeenCalled();
    expect(updateRatingInCache).toHaveBeenCalledWith('song1', 4);
  });
});
