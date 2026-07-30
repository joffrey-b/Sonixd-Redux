// The "apply a successful outcome to the UI" side effects that useRating.ts/
// useFavorite.ts already ran after a live, successful call -- extracted so
// offlineQueueFlush.ts's replayEntry can trigger the exact same UI updates
// after a successful *replay*, not just a live call (Phase 1's own audit
// flagged this gap: a replayed rating/favorite change updated the server
// correctly but nothing told any mounted UI to reflect it).
//
// Deliberately excludes the queryKey-specific optimistic setQueryData update
// and options.custom() callback both hooks also run -- those depend on which
// view triggered the live call (a caller-supplied queryKey a replay has no
// equivalent of), so they stay in the hooks themselves. Everything here is
// the queryKey-independent subset: Redux dispatch, the local library-cache
// update, and the query invalidation described below.
//
// dispatch is a required, injected parameter rather than this module reaching
// for the app's singleton store itself -- useRating.ts/useFavorite.ts pass
// their own useAppDispatch() (the same dispatch their existing tests already
// exercise against a local test store), and offlineQueueFlush.ts's replayEntry
// passes either an injected test dispatch or its own lazily-resolved default
// (see offlineQueueFlush.ts's loadDefaultDispatch). Reaching for the real
// redux/store.ts singleton directly from here would run its configureStore()
// call (and electron-redux's stateSyncEnhancer(), which needs a real
// __ElectronReduxBridge global) the moment this module loads in ANY context,
// including hook unit tests that build their own local, lighter-weight store.
import type { QueryClient } from '@tanstack/react-query';
import { setRate, setStar } from '../redux/playQueueSlice';
import { setPlaylistRate, setPlaylistStar } from '../redux/playlistSlice';
import { updateRatingInCache, updateStarredInCache } from '../hooks/useLibraryCache';
import { queryClient as defaultQueryClient } from './queryClient';

export type UIEffectDispatch = (action: unknown) => void;

type InvalidatingQueryClient = Pick<QueryClient, 'refetchQueries' | 'invalidateQueries'>;

export const applyRatingSuccess = async (
  args: { id: string; rating: number },
  dispatch: UIEffectDispatch,
  // Defaults to the app-wide singleton (shared/queryClient.ts) -- the same
  // instance index.tsx hands to <QueryClientProvider>, correct for real usage
  // (offlineQueueFlush.ts's replayEntry). useRating.ts instead passes its own
  // useQueryClient() explicitly, since its tests provide a local, per-test
  // QueryClient that a hardcoded singleton reference here couldn't see.
  queryClient: InvalidatingQueryClient = defaultQueryClient
): Promise<void> => {
  const { id, rating } = args;

  // Restored to the original pre-extraction order (useRating.ts ran these
  // refetches before the Redux dispatch/cache-update below) -- no functional
  // reason was found for the reversal an earlier draft introduced.
  await queryClient.refetchQueries({ queryKey: ['starred'], type: 'active' });
  await queryClient.refetchQueries({ queryKey: ['searchpage'], type: 'active' });

  // The two explicit refetches above only ever covered StarredView/
  // SearchView. Every other view that renders song ratings (AlbumView,
  // ArtistView, MusicList, ArtistList, FolderList, PlaylistView, Dashboard,
  // ...) relies on its own view-specific queryKey for its own optimistic
  // setQueryData update -- reachable only from the live call site (which has
  // a caller-supplied queryKey), never from a replay, which has none.
  // Investigation (grepping every handleRating/handleFavorite call site)
  // found ~14 genuinely distinct top-level query-key prefixes with no shared
  // namespace/tag a single scoped invalidateQueries predicate could target,
  // so an unfiltered call is used instead. Confirmed directly against the
  // installed @tanstack/query-core source (queryClient.cjs:
  // `type: filters?.refetchType ?? filters?.type ?? "active"`) that this
  // only actively refetches currently-MOUNTED queries by default -- inactive
  // ones are just marked stale and refetch naturally next time they mount --
  // so this does not cause wasteful background refetching of views the user
  // isn't currently looking at. This is in addition to, not a replacement
  // for, the two explicit refetches above (kept for clarity of intent, even
  // though this call alone now also covers them).
  await queryClient.invalidateQueries();

  dispatch(setRate({ id: [id], rating }));
  dispatch(setPlaylistRate({ id: [id], rating }));
  updateRatingInCache(id, rating);
};

export const applyFavoriteSuccess = async (
  args: { id: string; starred: boolean },
  dispatch: UIEffectDispatch,
  // See applyRatingSuccess's comment above for the full rationale.
  // useFavorite.ts never had a generic refetch at all (only the
  // queryKey-specific optimistic update), so this is new coverage for the
  // replay path, not a reordering of anything that existed before.
  queryClient: Pick<QueryClient, 'invalidateQueries'> = defaultQueryClient
): Promise<void> => {
  const { id, starred } = args;

  await queryClient.invalidateQueries();

  dispatch(setStar({ id: [id], type: starred ? 'star' : 'unstar' }));
  dispatch(setPlaylistStar({ id: [id], type: starred ? 'star' : 'unstar' }));
  updateStarredInCache(id, starred);
};
