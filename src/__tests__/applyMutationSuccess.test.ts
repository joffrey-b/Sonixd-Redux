jest.mock('../hooks/useLibraryCache', () => ({
  updateRatingInCache: jest.fn(),
  updateStarredInCache: jest.fn(),
}));

import { applyRatingSuccess, applyFavoriteSuccess } from '../shared/applyMutationSuccess';
import { updateRatingInCache, updateStarredInCache } from '../hooks/useLibraryCache';

const mockUpdateRatingInCache = updateRatingInCache as jest.Mock;
const mockUpdateStarredInCache = updateStarredInCache as jest.Mock;

describe('applyMutationSuccess (Fix 1)', () => {
  beforeEach(() => {
    mockUpdateRatingInCache.mockReset();
    mockUpdateStarredInCache.mockReset();
  });

  it('invalidates queries beyond just starred/searchpage after a rating change', async () => {
    const dispatch = jest.fn();
    const refetchQueries = jest.fn().mockResolvedValue(undefined);
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);

    await applyRatingSuccess({ id: 'song1', rating: 4 }, dispatch, {
      refetchQueries,
      invalidateQueries,
    });

    // The two explicit, view-specific refetches still run (StarredView/
    // SearchView) -- Fix 1 is additive, not a replacement.
    expect(refetchQueries).toHaveBeenCalledWith({ queryKey: ['starred'], type: 'active' });
    expect(refetchQueries).toHaveBeenCalledWith({ queryKey: ['searchpage'], type: 'active' });
    // The new, unfiltered call is what reaches every OTHER view (Album,
    // Artist, MusicList, ArtistList, Folder, Playlist, Dashboard, ...) that
    // has no shared queryKey prefix a scoped call could target instead.
    expect(invalidateQueries).toHaveBeenCalledWith();
  });

  it('invalidates queries beyond just starred/searchpage after a favorite change', async () => {
    const dispatch = jest.fn();
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);

    await applyFavoriteSuccess({ id: 'song1', starred: true }, dispatch, { invalidateQueries });

    // useFavorite.ts never had a generic refetch at all -- this unfiltered
    // call is entirely new coverage for the replay path.
    expect(invalidateQueries).toHaveBeenCalledWith();
    expect(dispatch).toHaveBeenCalled();
    expect(mockUpdateStarredInCache).toHaveBeenCalledWith('song1', true);
  });
});

describe('applyRatingSuccess ordering (Fix 7)', () => {
  beforeEach(() => {
    mockUpdateRatingInCache.mockReset();
  });

  it('runs the generic refetches before the Redux dispatch and cache update', async () => {
    const dispatch = jest.fn();
    const refetchQueries = jest.fn().mockResolvedValue(undefined);
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);

    await applyRatingSuccess({ id: 'song1', rating: 4 }, dispatch, {
      refetchQueries,
      invalidateQueries,
    });

    // Restored to match the original pre-extraction useRating.ts order.
    const lastRefetchOrder = Math.max(...refetchQueries.mock.invocationCallOrder);
    const invalidateOrder = invalidateQueries.mock.invocationCallOrder[0];
    const firstDispatchOrder = Math.min(...dispatch.mock.invocationCallOrder);
    const cacheOrder = mockUpdateRatingInCache.mock.invocationCallOrder[0];

    expect(lastRefetchOrder).toBeLessThan(firstDispatchOrder);
    expect(lastRefetchOrder).toBeLessThan(cacheOrder);
    expect(invalidateOrder).toBeLessThan(firstDispatchOrder);
    expect(invalidateOrder).toBeLessThan(cacheOrder);
  });
});
