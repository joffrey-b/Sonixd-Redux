import React from 'react';
import { useQuery } from 'react-query';
import { FlexboxGrid, Icon } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useAppSelector } from '../../redux/hooks';
import { apiController } from '../../api/controller';
import { notifyToast } from '../shared/toast';
import { StyledButton } from '../shared/styled';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import CenterLoader from '../loader/CenterLoader';

const PodcastList = () => {
  const { t } = useTranslation();
  const config = useAppSelector((state) => state.config);
  const history = useHistory();

  const {
    isLoading,
    isError,
    data: channels,
    refetch,
    isRefetching,
  } = useQuery(
    ['podcasts'],
    () => apiController({ serverType: config.serverType, endpoint: 'getPodcasts' }),
    { retry: false }
  );

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
                <Icon icon="refresh" /> {t('Refresh feeds')}
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
          {channels.map((channel: any) => (
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
              onClick={() => history.push(`/podcasts/${channel.id}`)}
            >
              <FlexboxGrid.Item style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={channel.image}
                  alt={channel.title}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                  onError={(e: any) => {
                    e.target.src = 'img/placeholder.png';
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
                <Icon icon="angle-right" style={{ opacity: 0.4 }} />
              </FlexboxGrid.Item>
            </FlexboxGrid>
          ))}
        </div>
      )}
    </GenericPage>
  );
};

export default PodcastList;
