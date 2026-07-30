// Extracted from index.tsx so non-component code (applyMutationSuccess.ts,
// used by both the live rating/favorite hooks and the offline queue's replay
// path) can invalidate/refetch the same cache instance the app actually
// renders from, rather than only being reachable via useQueryClient() inside
// a component.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});
