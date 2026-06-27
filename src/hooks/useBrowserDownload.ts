import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clipboard, shell } from '../components/shared/bridge';
import { apiController } from '../api/controller';
import { notifyToast } from '../components/shared/toast';
import { useAppSelector } from '../redux/hooks';
import { Server } from '../types';

export const useBrowserDownload = () => {
  const { t } = useTranslation();
  const config = useAppSelector((state) => state.config);

  const handleDownload = useCallback(
    async (
      data: { id?: string; song?: { id: string; parent?: string }[] },
      type: 'copy' | 'download',
      playlist?: boolean
    ) => {
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

        if (type === 'download') {
          return downloadUrls.forEach((url) => {
            if (/^https?:\/\//i.test(url)) shell.openExternal(url);
          });
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
