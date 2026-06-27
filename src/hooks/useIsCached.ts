import { useQuery } from '@tanstack/react-query';
import { cache } from '../components/shared/bridge';

// Replaces the old synchronous fs.existsSync(filePath) check (which required
// nodeIntegration) with an async existence check through the bridge. Polls
// periodically rather than invalidating on every cache write/clear -- whether
// an image loads from the local cache or the server, the displayed result is
// identical, so a few seconds of staleness here is invisible to the user.
const useIsCached = (filePath: string): boolean => {
  const { data } = useQuery({
    queryKey: ['isCached', filePath],
    queryFn: () => cache.exists(filePath),
    enabled: filePath.length > 0,
    refetchInterval: 15000,
  });

  return Boolean(data);
};

export default useIsCached;
