// ADR Section 8.6: the downloads overview screen. Total space used, the full
// list of everything currently downloaded, one-click "clear all downloads"
// (Fix 5's bulk-delete isolation pattern at full scope), and live
// in-progress state as count-based progress + a spinner (Fix 3) -- not
// byte-level/throughput progress, per the ADR's explicit v1 scope decision.
//
// Placement (judgment call, no explicit ADR guidance): reached via a link
// from the new Downloads settings panel (DownloadConfig.tsx), not a new
// permanent sidebar/nav icon -- this is a settings-adjacent utility screen
// only meaningful to users who've actually configured a download folder,
// and Section 1's "should not be able to tell this was ever added"
// constraint argues against a new always-visible nav item for a feature
// most users won't touch (the same tension Phase 3 flagged for the
// offline-status column, resolved there in the other direction only because
// ADR Section 6 explicitly mandated it).
//
// Uses a plain HTML table, not this app's virtualized ListViewTable/rsuite-
// table -- that component's row virtualization only matters for the main
// library views (thousands of rows); this screen's list is bounded to
// whatever's actually downloaded, and rsuite-table's resize-measurement
// effect has a known jsdom incompatibility once real row data is present
// (confirmed empirically while writing Fix 5's own render+click tests).
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import GenericPage from '../layout/GenericPage';
import { StyledButton, StyledTag } from '../shared/styled';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { selectDownloadProgress } from '../../redux/downloadProgressSlice';
import { removeDownloadedSongIds } from '../../redux/downloadedSongsSlice';
import { removeDownloadedPathEntries } from '../../shared/downloadedPathIndex';
import {
  getDownloadManifestPath,
  readManifest,
  removeManifestEntries,
  DownloadManifestEntry,
} from '../../shared/downloadManifest';
import { recovery, downloadDir } from '../shared/bridge';
import { formatBytes } from '../../shared/utils';
import useBulkDownload from '../../hooks/useBulkDownload';

interface DownloadedEntryRow extends DownloadManifestEntry {
  songId: string;
}

const DownloadsOverview = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const downloadProgress = useAppSelector(selectDownloadProgress);
  const { removeDownloadedSongs } = useBulkDownload();
  const [entries, setEntries] = useState<DownloadedEntryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadManifest = useCallback(async () => {
    setIsLoading(true);
    const manifestPath = getDownloadManifestPath();
    const manifest = await readManifest(manifestPath, recovery.read);

    // Fix 6 resilience: verify each entry's file still exists before
    // showing it as downloaded; self-correct (remove) any stale entries
    // found here rather than displaying a row for a file that's gone.
    // Per-item isolation (Lesson #4): one entry's existence check throwing
    // (an unexpected IPC-layer error, not a normal "file missing" result --
    // bridge:download:exists itself never rejects for that case) must not
    // hide every other entry from the overview screen. Fails safe toward
    // "assume it still exists" on an uncertain check, rather than wrongly
    // deleting a valid manifest entry over a transient hiccup.
    const checked = await Promise.all(
      Object.entries(manifest).map(async ([songId, entry]) => {
        try {
          return { songId, entry, exists: await downloadDir.exists(entry.path) };
        } catch {
          return { songId, entry, exists: true };
        }
      })
    );

    const staleIds = checked.filter((checkedEntry) => !checkedEntry.exists).map((c) => c.songId);
    if (staleIds.length > 0) {
      removeDownloadedPathEntries(staleIds);
      dispatch(removeDownloadedSongIds(staleIds));
      removeManifestEntries(staleIds, manifestPath, recovery.read, recovery.write).catch(() => {});
    }

    setEntries(
      checked
        .filter((checkedEntry) => checkedEntry.exists)
        .map((checkedEntry) => ({ songId: checkedEntry.songId, ...checkedEntry.entry }))
    );
    setIsLoading(false);
  }, [dispatch]);

  useEffect(() => {
    loadManifest().catch(() => {});
  }, [loadManifest]);

  const totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);

  const handleClearAll = async () => {
    await removeDownloadedSongs(entries.map((entry) => entry.songId));
    await loadManifest();
  };

  return (
    <GenericPage
      header={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <h2>{t('Downloads')}</h2>
            <div data-testid="downloads-total-size">
              {t('Total space used')}: <StyledTag>{formatBytes(totalSize)}</StyledTag>
            </div>
            {downloadProgress.inProgress && (
              <div data-testid="downloads-in-progress">
                {t('Downloading... {{completed}} of {{total}}', {
                  completed: downloadProgress.completed,
                  total: downloadProgress.total,
                })}
              </div>
            )}
          </div>
          <StyledButton
            data-testid="downloads-clear-all"
            appearance="primary"
            disabled={entries.length === 0}
            onClick={handleClearAll}
          >
            {t('Clear all downloads')}
          </StyledButton>
        </div>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>{t('Loading...')}</div>
      ) : entries.length === 0 ? (
        <div
          data-testid="downloads-empty-message"
          style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}
        >
          {t('No downloads yet.')}
        </div>
      ) : (
        <table data-testid="downloads-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>{t('Title')}</th>
              <th style={{ textAlign: 'left' }}>{t('Artist')}</th>
              <th style={{ textAlign: 'left' }}>{t('Album')}</th>
              <th style={{ textAlign: 'right' }}>{t('Size')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.songId} data-testid="downloads-row">
                <td>{entry.title}</td>
                <td>{entry.artist}</td>
                <td>{entry.album}</td>
                <td style={{ textAlign: 'right' }}>{formatBytes(entry.size || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GenericPage>
  );
};

export default DownloadsOverview;
