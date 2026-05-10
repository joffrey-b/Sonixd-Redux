import React, { useState } from 'react';
import { ButtonToolbar, Icon, FlexboxGrid } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  addSmartPlaylist,
  updateSmartPlaylist,
  deleteSmartPlaylist,
  setLibrarySyncedAt,
} from '../../redux/smartPlaylistSlice';
import { notifyToast } from '../shared/toast';
import { StyledButton } from '../shared/styled';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import { SmartPlaylist, Play } from '../../types';
import { apiController } from '../../api/controller';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import useSmartPlaylist from '../../hooks/useSmartPlaylist';
import useLibraryCache from '../../hooks/useLibraryCache';
import SmartPlaylistEditor from './SmartPlaylistEditor';

const SORT_LABEL: Record<string, string> = {
  playCount: 'Play Count',
  year: 'Year',
  rating: 'Rating',
  duration: 'Duration',
  random: 'Random',
};

const SmartPlaylistRow = ({
  playlist,
  onPlay,
  onPlayNext,
  onPlayLater,
  onSaveToServer,
  isSaving,
  onEdit,
  onDelete,
}: {
  playlist: SmartPlaylist;
  onPlay: (p: SmartPlaylist) => void;
  onPlayNext: (p: SmartPlaylist) => void;
  onPlayLater: (p: SmartPlaylist) => void;
  onSaveToServer: (p: SmartPlaylist) => void;
  isSaving: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const sortLabel = SORT_LABEL[playlist.sort] || playlist.sort;
  const dirLabel = playlist.sortDirection === 'desc' ? '↓' : '↑';

  return (
    <FlexboxGrid
      align="middle"
      justify="space-between"
      style={{
        padding: '10px 14px',
        marginBottom: 6,
        borderRadius: 8,
        background: 'rgba(128,128,128,0.08)',
      }}
    >
      <FlexboxGrid.Item>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{playlist.name}</div>
        <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
          {playlist.rules.length} {t('rule', { count: playlist.rules.length })} • {t('Sort by')}{' '}
          {t(sortLabel)} {dirLabel} • {t('Limit')} {playlist.limit}
        </div>
      </FlexboxGrid.Item>
      <FlexboxGrid.Item>
        <ButtonToolbar>
          <StyledButton appearance="primary" size="sm" onClick={() => onPlay(playlist)}>
            <Icon icon="play" />
          </StyledButton>
          <StyledButton appearance="subtle" size="sm" onClick={() => onPlayNext(playlist)}>
            <Icon icon="plus-circle" />
          </StyledButton>
          <StyledButton appearance="subtle" size="sm" onClick={() => onPlayLater(playlist)}>
            <Icon icon="plus" />
          </StyledButton>
          <StyledButton
            appearance="subtle"
            size="sm"
            onClick={() => onSaveToServer(playlist)}
            loading={isSaving}
            title={t('Save to server')}
          >
            <Icon icon="cloud-upload" />
          </StyledButton>
          <StyledButton appearance="subtle" size="sm" onClick={onEdit}>
            <Icon icon="edit2" />
          </StyledButton>
          <StyledButton appearance="subtle" size="sm" onClick={onDelete}>
            <Icon icon="trash" />
          </StyledButton>
        </ButtonToolbar>
      </FlexboxGrid.Item>
    </FlexboxGrid>
  );
};

const SmartPlaylistList = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const playlists = useAppSelector((state) => state.smartPlaylist.playlists);
  const config = useAppSelector((state) => state.config);
  const { handlePlayQueueAdd } = usePlayQueueHandler();
  const { fetchSmartPlaylistSongs } = useSmartPlaylist();
  const { syncLibrary, hasCacheForCurrentServer } = useLibraryCache();
  const lastSynced = useAppSelector((state) => state.smartPlaylist.librarySyncedAt);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<SmartPlaylist | undefined>(undefined);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    fetched: number;
    total: number | null;
  } | null>(null);
  const usingCache = hasCacheForCurrentServer();

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ fetched: 0, total: null });
    try {
      const count = await syncLibrary((fetched, total) => setSyncProgress({ fetched, total }));
      dispatch(setLibrarySyncedAt(new Date().toISOString()));
      notifyToast('success', t('Library synced — {{count}} songs indexed.', { count }));
    } catch {
      notifyToast('error', t('Library sync failed.'));
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const runPlaylist = async (playlist: SmartPlaylist, play: Play): Promise<void> => {
    try {
      const songs = await fetchSmartPlaylistSongs(playlist);
      if (songs.length === 0) {
        notifyToast('warning', t('No songs matched the playlist rules.'));
        return;
      }
      handlePlayQueueAdd({ byData: songs, play });
    } catch {
      notifyToast('error', t('Failed to load playlist songs.'));
    }
  };

  const handleSaveToServer = async (playlist: SmartPlaylist) => {
    setSavingId(playlist.id);
    try {
      const songs = await fetchSmartPlaylistSongs(playlist);
      if (songs.length === 0) {
        notifyToast('warning', t('No songs matched the playlist rules.'));
        return;
      }

      const created = await apiController({
        serverType: config.serverType,
        endpoint: 'createPlaylist',
        args: { name: playlist.name },
      });

      // Subsonic returns { playlist: { id } }, Jellyfin returns { Id }
      const playlistId: string = created?.playlist?.id || created?.Id || created?.id;
      if (!playlistId) {
        notifyToast('error', t('Failed to create playlist on server.'));
        return;
      }

      await apiController({
        serverType: config.serverType,
        endpoint: 'updatePlaylistSongsLg',
        args: { id: playlistId, entry: songs },
      });

      notifyToast('success', t('Playlist saved to server.'));
    } catch {
      notifyToast('error', t('Failed to save playlist to server.'));
    } finally {
      setSavingId(null);
    }
  };

  const openCreate = () => {
    setEditingPlaylist(undefined);
    setEditorOpen(true);
  };

  const openEdit = (playlist: SmartPlaylist) => {
    setEditingPlaylist(playlist);
    setEditorOpen(true);
  };

  const handleSave = (data: Omit<SmartPlaylist, 'id'>) => {
    if (editingPlaylist) {
      dispatch(updateSmartPlaylist({ ...data, id: editingPlaylist.id }));
    } else {
      dispatch(addSmartPlaylist(data));
    }
    setEditorOpen(false);
  };

  return (
    <GenericPage
      header={
        <GenericPageHeader
          title={t('Smart Playlists')}
          subtitle={
            <div>
              <ButtonToolbar style={{ marginBottom: 6 }}>
                <StyledButton appearance="primary" onClick={openCreate}>
                  <Icon icon="plus" /> {t('New Playlist')}
                </StyledButton>
                <StyledButton appearance="subtle" onClick={handleSync} loading={syncing}>
                  <Icon icon="refresh" /> {syncing ? t('Syncing...') : t('Sync Library')}
                </StyledButton>
              </ButtonToolbar>
              <div style={{ fontSize: 12, opacity: 0.55 }}>
                {syncing && syncProgress
                  ? t('Syncing... {{fetched}} songs', { fetched: syncProgress.fetched })
                  : usingCache
                  ? t('Using local library cache') +
                    (lastSynced
                      ? ` — ${t('Last synced')} ${new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(lastSynced))}`
                      : '')
                  : t(
                      'No library cache — smart playlists use a random pool of 500 songs. Click Sync Library to enable full library search.'
                    )}
              </div>
            </div>
          }
        />
      }
    >
      {playlists.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
          {t('No smart playlists yet. Create one to get started.')}
        </div>
      ) : (
        <div style={{ padding: '10px 20px' }}>
          {playlists.map((pl: SmartPlaylist) => (
            <SmartPlaylistRow
              key={pl.id}
              playlist={pl}
              onPlay={(p) => runPlaylist(p, Play.Play)}
              onPlayNext={(p) => runPlaylist(p, Play.Next)}
              onPlayLater={(p) => runPlaylist(p, Play.Later)}
              onSaveToServer={handleSaveToServer}
              isSaving={savingId === pl.id}
              onEdit={() => openEdit(pl)}
              onDelete={() => dispatch(deleteSmartPlaylist(pl.id))}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <SmartPlaylistEditor
          playlist={editingPlaylist}
          onClose={() => setEditorOpen(false)}
          onSave={handleSave}
        />
      )}
    </GenericPage>
  );
};

export default SmartPlaylistList;
