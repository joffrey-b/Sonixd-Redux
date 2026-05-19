import React from 'react';
import { useQuery } from 'react-query';
import { ButtonToolbar, FlexboxGrid, Icon } from 'rsuite';
import { useTranslation } from 'react-i18next';
import { useHistory, useParams } from 'react-router-dom';
import format from 'format-duration';
import { useAppSelector } from '../../redux/hooks';
import { apiController } from '../../api/controller';
import { notifyToast } from '../shared/toast';
import { StyledButton } from '../shared/styled';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import CenterLoader from '../loader/CenterLoader';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import { Play } from '../../types';

const PodcastChannelView = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const config = useAppSelector((state) => state.config);
  const history = useHistory();
  const { handlePlayQueueAdd } = usePlayQueueHandler();

  const { isLoading, data: channels } = useQuery(
    ['podcasts'],
    () => apiController({ serverType: config.serverType, endpoint: 'getPodcasts' }),
    { retry: false }
  );

  const channel = channels?.find((ch: any) => ch.id === id);

  const handlePlay = (episode: any, play: Play) => {
    if (!episode.streamUrl) {
      notifyToast('warning', t('This episode has not been downloaded yet.'));
      return;
    }
    handlePlayQueueAdd({ byData: [episode], play });
  };

  const handlePlayAll = (play: Play) => {
    const playable = channel?.episodes?.filter((ep: any) => ep.streamUrl) || [];
    if (playable.length === 0) {
      notifyToast('warning', t('No downloaded episodes to play.'));
      return;
    }
    handlePlayQueueAdd({ byData: playable, play });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(dateStr));
  };

  return (
    <GenericPage
      header={
        <GenericPageHeader
          title={channel?.title || t('Loading...')}
          subtitle={
            <ButtonToolbar>
              <StyledButton appearance="subtle" size="sm" onClick={() => history.push('/podcasts')}>
                <Icon icon="angle-left" /> {t('All Podcasts')}
              </StyledButton>
              {channel && (
                <>
                  <StyledButton
                    appearance="primary"
                    size="sm"
                    onClick={() => handlePlayAll(Play.Play)}
                  >
                    <Icon icon="play" /> {t('Play All')}
                  </StyledButton>
                  <StyledButton
                    appearance="subtle"
                    size="sm"
                    onClick={() => handlePlayAll(Play.Later)}
                  >
                    <Icon icon="plus" /> {t('Add All')}
                  </StyledButton>
                </>
              )}
            </ButtonToolbar>
          }
        />
      }
    >
      {isLoading && <CenterLoader />}
      {!isLoading && !channel && (
        <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
          {t('Podcast not found.')}
        </div>
      )}
      {!isLoading && channel && channel.episodes.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
          {t('No episodes available.')}
        </div>
      )}
      {!isLoading && channel && channel.episodes.length > 0 && (
        <div style={{ padding: '10px 20px' }}>
          {channel.episodes.map((episode: any) => (
            <FlexboxGrid
              key={episode.episodeId}
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
                <div style={{ fontWeight: 500, fontSize: 14 }}>{episode.title}</div>
                <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
                  {formatDate(episode.publishDate)}
                  {episode.duration ? ` · ${format(episode.duration * 1000)}` : ''}
                  {!episode.streamUrl ? ` · ${t('Not downloaded')}` : ''}
                </div>
              </FlexboxGrid.Item>
              <FlexboxGrid.Item>
                <ButtonToolbar>
                  <StyledButton
                    appearance="primary"
                    size="sm"
                    onClick={() => handlePlay(episode, Play.Play)}
                    disabled={!episode.streamUrl}
                  >
                    <Icon icon="play" />
                  </StyledButton>
                  <StyledButton
                    appearance="subtle"
                    size="sm"
                    onClick={() => handlePlay(episode, Play.Next)}
                    disabled={!episode.streamUrl}
                  >
                    <Icon icon="plus-circle" />
                  </StyledButton>
                  <StyledButton
                    appearance="subtle"
                    size="sm"
                    onClick={() => handlePlay(episode, Play.Later)}
                    disabled={!episode.streamUrl}
                  >
                    <Icon icon="plus" />
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

export default PodcastChannelView;
