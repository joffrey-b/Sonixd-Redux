import { useCallback } from 'react';
import { useAppSelector } from '../redux/hooks';
import { selectCachedSongIdSet } from '../redux/cachedSongsSlice';
import { selectDownloadedSongIdSet } from '../redux/downloadedSongsSlice';
import { isAvailableOffline } from '../shared/isAvailableOffline';

// Shared hook wrapping isAvailableOffline against the live Redux-held cached-
// and downloaded-songs Sets -- used by both the offline-status column and the
// skip-unavailable-songs queue filter (ADR Section 5.3), so neither
// reimplements the check.
const useIsAvailableOffline = (): ((songId: string) => boolean) => {
  const cachedSongIds = useAppSelector(selectCachedSongIdSet);
  const downloadedSongIds = useAppSelector(selectDownloadedSongIdSet);

  return useCallback(
    (songId: string) => isAvailableOffline(songId, cachedSongIds, downloadedSongIds),
    [cachedSongIds, downloadedSongIds]
  );
};

export default useIsAvailableOffline;
