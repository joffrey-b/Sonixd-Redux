import React from 'react';
import Book2Icon from '@rsuite/icons/legacy/Book2';
import ExternalLinkIcon from '@rsuite/icons/legacy/ExternalLink';
import HeartIcon from '@rsuite/icons/legacy/Heart';
import HeartOIcon from '@rsuite/icons/legacy/HeartO';
import ListUlIcon from '@rsuite/icons/legacy/ListUl';
import MusicIcon from '@rsuite/icons/legacy/Music';
import PlayIcon from '@rsuite/icons/legacy/Play';
import PlusIcon from '@rsuite/icons/legacy/Plus';
import PlusCircleIcon from '@rsuite/icons/legacy/PlusCircle';
import UserIcon from '@rsuite/icons/legacy/User';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import cacheImage from '../shared/cacheImage';
import { useAppDispatch } from '../../redux/hooks';
import useIsCached from '../../hooks/useIsCached';
import { settings } from '../shared/bridge';
import {
  CardPanel,
  InfoPanel,
  InfoSpan,
  CardTitleButton,
  CardSubtitleButton,
  CardSubtitle,
  CardImg,
  LazyCardImg,
  Overlay,
  PlayOverlayButton,
  FavoriteOverlayButton,
  AppendOverlayButton,
  ModalViewOverlayButton,
  AppendNextOverlayButton,
  CardImgWrapper,
  ImgPanel,
  CardTitleWrapper,
} from './styled';
import { addModalPage } from '../../redux/miscSlice';
import CustomTooltip from '../shared/CustomTooltip';
import { CoverArtWrapper, CustomImageGrid, CustomImageGridWrapper } from '../layout/styled';
import usePlayQueueHandler from '../../hooks/usePlayQueueHandler';
import { Item, Play } from '../../types';

const Card = ({
  onClick,
  url,
  subUrl,
  hasHoverButtons,
  lazyLoad,
  playClick,
  size,
  cacheImages,
  cachePath,
  handleFavorite,
  notVisibleByDefault,
  noInfoPanel,
  noModalButton,
  ...rest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Card renders heterogeneous API data objects via ...rest; full typing requires pervasive casts throughout JSX
}: any) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const cachedImagePath =
    rest.details?.cacheType && rest.details?.id
      ? `${cachePath}${rest.details.cacheType}_${rest.details.id}.jpg`
      : '';
  const isCoverArtCached = useIsCached(cachedImagePath);

  const handleClick = () => {
    if (url) {
      navigate(url);
    }
  };

  const handleSubClick = () => {
    if (subUrl) navigate(subUrl);
  };

  const { handlePlayQueueAdd } = usePlayQueueHandler();

  const handleOpenModal = () => {
    dispatch(
      addModalPage({
        pageType: playClick.type,
        id: rest.details.id,
      })
    );
  };

  return (
    <>
      <CardPanel $cardsize={size} style={rest.style} $noInfoPanel={noInfoPanel}>
        <Overlay $cardsize={size}>
          <ImgPanel
            tabIndex={0}
            onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
              if (e.key === ' ' || e.key === 'Enter') {
                handleClick();
              }
            }}
          >
            {Array.isArray(rest.coverArt) ? (
              <CoverArtWrapper $size={size}>
                <CustomImageGridWrapper>
                  <CustomImageGrid $gridArea="1 / 1 / 2 / 2">
                    <LazyLoadImage
                      src={rest.coverArt[0]}
                      alt="header-img"
                      height={size / 2}
                      width={size / 2}
                    />
                  </CustomImageGrid>
                  <CustomImageGrid $gridArea="1 / 2 / 2 / 3">
                    <LazyLoadImage
                      src={rest.coverArt[1]}
                      alt="header-img"
                      height={size / 2}
                      width={size / 2}
                    />
                  </CustomImageGrid>
                  <CustomImageGrid $gridArea="2 / 1 / 3 / 2">
                    <LazyLoadImage
                      src={rest.coverArt[2]}
                      alt="header-img"
                      height={size / 2}
                      width={size / 2}
                    />
                  </CustomImageGrid>
                  <CustomImageGrid $gridArea="2 / 2 / 3 / 3">
                    <LazyLoadImage
                      src={rest.coverArt[3]}
                      alt="header-img"
                      height={size / 2}
                      width={size / 2}
                    />
                  </CustomImageGrid>
                </CustomImageGridWrapper>
              </CoverArtWrapper>
            ) : rest.coverArt?.match?.('placeholder') ? (
              <CardImgWrapper
                id="placeholder-wrapper"
                $size={size}
                opacity={0.4}
                onClick={handleClick}
              >
                {playClick.type === 'album' ? (
                  <Book2Icon style={{ fontSize: '4em' }} />
                ) : playClick.type === 'artist' ? (
                  <UserIcon style={{ fontSize: '4em' }} />
                ) : playClick.type === 'playlist' ? (
                  <ListUlIcon style={{ fontSize: '4em' }} />
                ) : (
                  <MusicIcon style={{ fontSize: '4em' }} />
                )}
              </CardImgWrapper>
            ) : (
              <CardImgWrapper $size={size} onClick={handleClick}>
                {lazyLoad ? (
                  <LazyCardImg
                    src={isCoverArtCached ? cachedImagePath : rest.coverArt}
                    alt="img"
                    effect="opacity"
                    $cardsize={size}
                    visibleByDefault={!notVisibleByDefault}
                    afterLoad={() => {
                      if (cacheImages && settings.get('cacheImages')) {
                        cacheImage(
                          `${rest.details.cacheType}_${rest.details.id}.jpg`,
                          rest.coverArt.replaceAll(/=150/gi, '=350')
                        );
                      }
                    }}
                  />
                ) : (
                  <CardImg src={rest.coverArt} alt="img" onClick={handleClick} $cardsize={size} />
                )}
              </CardImgWrapper>
            )}

            {hasHoverButtons && (
              <>
                {rest.details.starred && <div className="corner-triangle" />}
                <PlayOverlayButton
                  size="lg"
                  circle
                  aria-label={t('Play')}
                  icon={<PlayIcon />}
                  onClick={() => {
                    if (playClick.type === Item.Music) {
                      return handlePlayQueueAdd({
                        byData: [playClick],
                        play: Play.Play,
                      });
                    }
                    return handlePlayQueueAdd({
                      byItemType: { item: playClick.type, id: playClick.id },
                      play: Play.Play,
                    });
                  }}
                />

                <CustomTooltip text={t('Add to queue (later)')} delay={1000}>
                  <AppendOverlayButton
                    aria-label={t('Add to queue (later)')}
                    onClick={() => {
                      if (playClick.type === Item.Music) {
                        return handlePlayQueueAdd({
                          byData: [playClick],
                          play: Play.Later,
                        });
                      }
                      return handlePlayQueueAdd({
                        byItemType: { item: playClick.type, id: playClick.id },
                        play: Play.Later,
                      });
                    }}
                    size={size <= 160 ? 'xs' : 'sm'}
                    circle
                    icon={<PlusIcon />}
                  />
                </CustomTooltip>

                <CustomTooltip text={t('Add to queue (next)')} delay={1000}>
                  <AppendNextOverlayButton
                    aria-label={t('Add to queue (next)')}
                    onClick={() => {
                      if (playClick.type === Item.Music) {
                        return handlePlayQueueAdd({
                          byData: [playClick],
                          play: Play.Next,
                        });
                      }
                      return handlePlayQueueAdd({
                        byItemType: { item: playClick.type, id: playClick.id },
                        play: Play.Next,
                      });
                    }}
                    size={size <= 160 ? 'xs' : 'sm'}
                    icon={<PlusCircleIcon />}
                  />
                </CustomTooltip>

                {playClick.type !== 'playlist' && (
                  <CustomTooltip text={t('Toggle favorite')} delay={1000}>
                    <FavoriteOverlayButton
                      aria-label={
                        rest.details.starred ? t('Remove from favorites') : t('Add to favorites')
                      }
                      onClick={() => handleFavorite(rest.details)}
                      size={size <= 160 ? 'xs' : 'sm'}
                      icon={rest.details.starred ? <HeartIcon /> : <HeartOIcon />}
                    />
                  </CustomTooltip>
                )}
                {!rest.isModal && !noModalButton && (
                  <CustomTooltip text={t('View in modal')} delay={1000}>
                    <ModalViewOverlayButton
                      aria-label={t('View in modal')}
                      size={size <= 160 ? 'xs' : 'sm'}
                      icon={<ExternalLinkIcon />}
                      onClick={handleOpenModal}
                    />
                  </CustomTooltip>
                )}
              </>
            )}
          </ImgPanel>
        </Overlay>

        {!noInfoPanel && (
          <InfoPanel $cardsize={size}>
            <InfoSpan>
              <CardTitleWrapper>
                <CustomTooltip text={rest.title}>
                  <CardTitleButton
                    appearance="link"
                    tabIndex={-1}
                    size="sm"
                    onClick={handleClick}
                    $cardsize={size}
                  >
                    {rest.title}
                  </CardTitleButton>
                </CustomTooltip>
              </CardTitleWrapper>
            </InfoSpan>
            <InfoSpan>
              {subUrl ? (
                <CardTitleWrapper>
                  <CustomTooltip text={rest.subtitle}>
                    <CardSubtitleButton
                      appearance="link"
                      tabIndex={-1}
                      size="xs"
                      onClick={handleSubClick}
                      $cardsize={size}
                    >
                      {rest.subtitle}
                    </CardSubtitleButton>
                  </CustomTooltip>
                </CardTitleWrapper>
              ) : (
                <CardSubtitle $cardsize={size}>
                  {rest.subtitle != null && rest.subtitle !== 'undefined' ? (
                    rest.subtitle
                  ) : (
                    <span>&#8203;</span>
                  )}
                </CardSubtitle>
              )}
            </InfoSpan>
          </InfoPanel>
        )}
      </CardPanel>
    </>
  );
};

export default Card;
