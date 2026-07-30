import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clipboard } from '../components/shared/bridge';
import { apiController } from '../api/controller';
import { notifyToast } from '../components/shared/toast';
import { useAppSelector } from '../redux/hooks';
import { Server } from '../types';

// Copy-to-clipboard only -- the 'download' branch (shell.openExternal of a
// zip URL) was removed once PlaylistView.tsx's Download button was rewired
// to the offline per-song download fan-out (ADR Section 8.3), which was this
// hook's only 'download'-type caller. The `type` param is gone with it;
// `playlist` stays since 'copy' still needs the same per-server-shape
// branching.
export const useBrowserDownload = () => {
  const { t } = useTranslation();
  const config = useAppSelector((state) => state.config);

  const handleDownload = useCallback(
    async (data: { id?: string; song?: { id: string; parent?: string }[] }, playlist?: boolean) => {
      try {
        const downloadUrls = [];

        if (config.serverType === Server.Jellyfin) {
          if (data.song) {
            for (let i = 0; i < data.song.length; i += 1) {
              downloadUrls.push(
                await apiController({
                  serverType: Server.Jellyfin,
                  endpoint: 'getDownloadUrl',
                  args: { id: data.song[i].id },
                })
              );
            }
          }
        }

        if (config.serverType === Server.Subsonic) {
          if (playlist) {
            // This matches Navidrome's playlist GUID Id format
            if (data.id?.includes('-')) {
              downloadUrls.push(
                await apiController({
                  serverType: Server.Subsonic,
                  endpoint: 'getDownloadUrl',
                  args: { id: data.id },
                })
              );
            } else if (data.song) {
              for (let i = 0; i < data.song.length; i += 1) {
                downloadUrls.push(
                  await apiController({
                    serverType: Server.Subsonic,
                    endpoint: 'getDownloadUrl',
                    args: { id: data.song[i].id },
                  })
                );
              }
            }
          }
          // If not Navidrome (this assumes Airsonic), then we need to use a song's parent
          // to download. This is because Airsonic does not support downloading via album ids
          // that are provided by /getAlbum or /getAlbumList2
          else if (data.song?.[0]?.parent) {
            downloadUrls.push(
              await apiController({
                serverType: Server.Subsonic,
                endpoint: 'getDownloadUrl',
                args: { id: data.song[0].parent },
              })
            );
          } else if (data.song) {
            downloadUrls.push(
              await apiController({
                serverType: Server.Subsonic,
                endpoint: 'getDownloadUrl',
                args: { id: data.song[0]?.parent },
              })
            );
          }
        }

        if (downloadUrls.length === 0) {
          return notifyToast('warning', t('No parent album found'));
        }

        clipboard.writeText(downloadUrls.join('\n'));
        return notifyToast('info', t('Download links copied!'));
      } catch (err) {
        notifyToast('error', err);
      }
    },
    [config.serverType, t]
  );

  return { handleDownload };
};
