import React from 'react';
import { shell } from 'electron';
import { useQuery } from 'react-query';
import { ButtonToolbar, FlexboxGrid, Icon } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../redux/hooks';
import { apiController } from '../../api/controller';
import { StyledButton } from '../shared/styled';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import CenterLoader from '../loader/CenterLoader';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import { Play } from '../../types';

interface RadioStation {
  id: string;
  title: string;
  streamUrl: string;
  homePageUrl: string | null;
}

const InternetRadioList = () => {
  const { t } = useTranslation();
  const config = useAppSelector((state) => state.config);
  const { handlePlayQueueAdd } = usePlayQueueHandler();

  const { isLoading, data: stations } = useQuery(['internetRadioStations'], () =>
    apiController({ serverType: config.serverType, endpoint: 'getInternetRadioStations' })
  );

  const handlePlay = (station: RadioStation) => {
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
          type: 'music' as any,
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
                      onClick={() => shell.openExternal(station.homePageUrl!)}
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
                  <StyledButton appearance="primary" size="sm" onClick={() => handlePlay(station)}>
                    <Icon icon="play" />
                  </StyledButton>
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
