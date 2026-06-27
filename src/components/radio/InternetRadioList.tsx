import React from 'react';
import { shell } from '../shared/bridge';
import { useQuery } from '@tanstack/react-query';
import { ButtonToolbar, FlexboxGrid } from 'rsuite';
import PlayIcon from '@rsuite/icons/legacy/Play';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../redux/hooks';
import { apiController } from '../../api/controller';
import { StyledIconButton } from '../shared/styled';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import CenterLoader from '../loader/CenterLoader';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import { notifyToast } from '../shared/toast';
import { Item, Play } from '../../types';

interface RadioStation {
  id: string;
  title: string;
  streamUrl: string;
  homePageUrl: string | null;
}

const InternetRadioList = () => {
  const { t } = useTranslation();
  const config = useAppSelector((state) => state.config);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jukebox slice is optional and not part of RootState; checked defensively at runtime
  const isJukebox = useAppSelector((state: any) => state.jukebox?.enabled ?? false);
  const { handlePlayQueueAdd } = usePlayQueueHandler();

  const { isLoading, data: stations } = useQuery({
    queryKey: ['internetRadioStations'],
    queryFn: () =>
      apiController({ serverType: config.serverType, endpoint: 'getInternetRadioStations' }),
  });

  const handlePlay = (station: RadioStation) => {
    if (isJukebox) {
      notifyToast('info', t('Internet radio is not supported in jukebox mode.'));
      return;
    }
    handlePlayQueueAdd({
      byData: [
        {
          id: station.id,
          title: station.title,
          album: t('Internet Radio'),
          albumArtist: '',
          albumArtistId: '',
          artist: [],
          size: 0,
          created: '',
          streamUrl: station.streamUrl,
          image: 'img/placeholder.png',
          type: Item.Music,
          uniqueId: station.id,
          isRadio: true,
        },
      ],
      play: Play.Play,
    });
  };

  return (
    <GenericPage header={<GenericPageHeader title={t('Internet Radio')} />}>
      {isLoading && <CenterLoader />}
      {!isLoading && (!stations || stations.length === 0) && (
        <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
          {t('No internet radio stations configured on your server.')}
        </div>
      )}
      {!isLoading && stations && stations.length > 0 && (
        <div style={{ padding: '10px 20px' }}>
          {stations.map((station: RadioStation) => (
            <FlexboxGrid
              key={station.id}
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
                <div style={{ fontWeight: 500, fontSize: 14 }}>{station.title}</div>
                {station.homePageUrl && (
                  <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (station.homePageUrl && /^https?:\/\//i.test(station.homePageUrl)) {
                          shell.openExternal(station.homePageUrl);
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'inherit',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: 'inherit',
                        opacity: 0.8,
                      }}
                    >
                      {station.homePageUrl}
                    </button>
                  </div>
                )}
              </FlexboxGrid.Item>
              <FlexboxGrid.Item>
                <ButtonToolbar>
                  <StyledIconButton
                    data-testid="radio-play-button"
                    icon={<PlayIcon />}
                    appearance="primary"
                    size="sm"
                    circle
                    onClick={() => handlePlay(station)}
                  />
                </ButtonToolbar>
              </FlexboxGrid.Item>
            </FlexboxGrid>
          ))}
        </div>
      )}
    </GenericPage>
  );
};

export default InternetRadioList;
