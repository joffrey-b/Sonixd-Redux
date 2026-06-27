import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlexboxGrid } from 'rsuite';
import AngleRightIcon from '@rsuite/icons/legacy/AngleRight';
import RefreshIcon from '@rsuite/icons/legacy/Refresh';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../redux/hooks';
import { apiController } from '../../api/controller';

interface PodcastChannelSummary {
  id: string;
  title: string;
  image: string;
  episodes: { length: number }[];
}
import { notifyToast } from '../shared/toast';
import { StyledButton } from '../shared/styled';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import CenterLoader from '../loader/CenterLoader';

const PodcastList = () => {
  const { t } = useTranslation();
  const config = useAppSelector((state) => state.config);
  const navigate = useNavigate();

  const {
    isLoading,
    isError,
    data: channels,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['podcasts'],
    queryFn: () => apiController({ serverType: config.serverType, endpoint: 'getPodcasts' }),
    retry: false,
  });

  const handleRefresh = async () => {
    await apiController({ serverType: config.serverType, endpoint: 'refreshPodcasts' });
    await refetch();
    notifyToast('success', t('Podcast feeds refreshed.'));
  };

  return (
    <GenericPage
      header={
        <GenericPageHeader
          title={t('Podcasts')}
          subtitle={
            !isError && (
              <StyledButton
                appearance="subtle"
                size="sm"
                onClick={handleRefresh}
                loading={isLoading || isRefetching}
              >
                <RefreshIcon /> {t('Refresh feeds')}
              </StyledButton>
            )
          }
        />
      }
    >
      {isLoading && <CenterLoader />}
      {!isLoading && isError && (
        <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
          {t('Podcasts are not supported by your server.')}
        </div>
      )}
      {!isLoading && !isError && (!channels || channels.length === 0) && (
        <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
          {t('No podcasts configured on your server.')}
        </div>
      )}
      {!isLoading && channels && channels.length > 0 && (
        <div style={{ padding: '10px 20px' }}>
          {(channels as PodcastChannelSummary[]).map((channel) => (
            <FlexboxGrid
              key={channel.id}
              align="middle"
              justify="space-between"
              style={{
                padding: '10px 14px',
                marginBottom: 6,
                borderRadius: 8,
                background: 'rgba(128,128,128,0.08)',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/podcasts/${channel.id}`)}
            >
              <FlexboxGrid.Item style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={channel.image}
                  role="presentation"
                  alt=""
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    e.currentTarget.src = 'img/placeholder.png';
                  }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{channel.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
                    {t('episode', { count: channel.episodes.length })}
                  </div>
                </div>
              </FlexboxGrid.Item>
              <FlexboxGrid.Item>
                <AngleRightIcon style={{ opacity: 0.4 }} />
              </FlexboxGrid.Item>
            </FlexboxGrid>
          ))}
        </div>
      )}
    </GenericPage>
  );
};

export default PodcastList;
