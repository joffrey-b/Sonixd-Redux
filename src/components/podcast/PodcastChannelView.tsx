import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ButtonToolbar, FlexboxGrid } from 'rsuite';
import AngleLeftIcon from '@rsuite/icons/legacy/AngleLeft';
import PlayIcon from '@rsuite/icons/legacy/Play';
import PlusIcon from '@rsuite/icons/legacy/Plus';
import PlusCircleIcon from '@rsuite/icons/legacy/PlusCircle';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import format from 'format-duration';
import { useAppSelector } from '../../redux/hooks';
import { apiController } from '../../api/controller';
import { notifyToast } from '../shared/toast';
import { StyledButton } from '../shared/styled';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import CenterLoader from '../loader/CenterLoader';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import { Item, Play, Song } from '../../types';

interface PodcastEpisode {
  episodeId: string;
  title: string;
  publishDate: string | null;
  duration: number;
  streamUrl: string | null;
}

interface PodcastChannel {
  id: string;
  title: string;
  episodes: PodcastEpisode[];
}

const PodcastChannelView = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const config = useAppSelector((state) => state.config);
  const navigate = useNavigate();
  const { handlePlayQueueAdd } = usePlayQueueHandler();

  const { isLoading, data: channels } = useQuery({
    queryKey: ['podcasts'],
    queryFn: () => apiController({ serverType: config.serverType, endpoint: 'getPodcasts' }),
    retry: false,
  });

  const channel = (channels as PodcastChannel[] | undefined)?.find((ch) => ch.id === id);

  const episodeToSong = (episode: PodcastEpisode): Song => ({
    id: episode.episodeId,
    uniqueId: `podcast-${episode.episodeId}`,
    type: Item.Music,
    title: episode.title,
    duration: episode.duration,
    streamUrl: episode.streamUrl ?? '',
    album: '',
    albumArtist: '',
    albumArtistId: '',
    artist: [],
    size: 0,
    created: '',
    image: '',
    isPodcast: true,
  });

  const handlePlay = (episode: PodcastEpisode, play: Play) => {
    if (!episode.streamUrl) {
      notifyToast('warning', t('This episode has not been downloaded yet.'));
      return;
    }
    handlePlayQueueAdd({ byData: [episodeToSong(episode)], play });
  };

  const handlePlayAll = (play: Play) => {
    const playable = channel?.episodes?.filter((ep) => ep.streamUrl) || [];
    if (playable.length === 0) {
      notifyToast('warning', t('No downloaded episodes to play.'));
      return;
    }
    handlePlayQueueAdd({ byData: playable.map(episodeToSong), play });
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
              <StyledButton appearance="subtle" size="sm" onClick={() => navigate('/podcasts')}>
                <AngleLeftIcon /> {t('All Podcasts')}
              </StyledButton>
              {channel && (
                <>
                  <StyledButton
                    appearance="primary"
                    size="sm"
                    onClick={() => handlePlayAll(Play.Play)}
                  >
                    <PlayIcon /> {t('Play All')}
                  </StyledButton>
                  <StyledButton
                    appearance="subtle"
                    size="sm"
                    onClick={() => handlePlayAll(Play.Later)}
                  >
                    <PlusIcon /> {t('Add All')}
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
      {!isLoading && channel && (channel.episodes?.length ?? 0) === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5 }}>
          {t('No episodes available.')}
        </div>
      )}
      {!isLoading && channel && (channel.episodes?.length ?? 0) > 0 && (
        <div style={{ padding: '10px 20px' }}>
          {channel.episodes.map((episode) => (
            <FlexboxGrid
              key={String(episode.episodeId)}
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
                    data-testid="episode-play-btn"
                    onClick={() => handlePlay(episode, Play.Play)}
                    disabled={!episode.streamUrl}
                  >
                    <PlayIcon />
                  </StyledButton>
                  <StyledButton
                    appearance="subtle"
                    size="sm"
                    onClick={() => handlePlay(episode, Play.Next)}
                    disabled={!episode.streamUrl}
                  >
                    <PlusCircleIcon />
                  </StyledButton>
                  <StyledButton
                    appearance="subtle"
                    size="sm"
                    onClick={() => handlePlay(episode, Play.Later)}
                    disabled={!episode.streamUrl}
                  >
                    <PlusIcon />
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
