import React from 'react';
import { Panel, Button, IconButton } from 'rsuite';
import styled from 'styled-components';
import { LazyLoadImage, type LazyLoadImageProps } from 'react-lazy-load-image-component';

interface Card {
  $cardsize: number;
  $noInfoPanel?: boolean;
}

/* const getcardsize = (props: any) => {
  return props.$cardsize === 'xs'
    ? props.theme.primary.cardXs
    : props.$cardsize === 'sm'
    ? props.theme.primary.cardSm
    : props.$cardsize === 'md'
    ? props.theme.primary.cardMd
    : props.$cardsize === 'lg'
    ? props.theme.primary.cardLg
    : props.theme.primary.cardSm;
}; */

export const CardPanel = styled(Panel)<Card>`
  border-top-left-radius: var(--app-card-img-radius) !important;
  border-top-right-radius: var(--app-card-img-radius) !important;
  border-bottom-left-radius: var(--app-card-info-radius) !important;
  border-bottom-right-radius: var(--app-card-info-radius) !important;

  text-align: center;
  width: ${(props) => `${Number(props.$cardsize) + 2}px`};
  height: ${(props) => `${Number(props.$cardsize) + (props.$noInfoPanel ? 5 : 55)}px`};
  border: var(--app-card-border);

  /* Hover effects inspired from https://codepen.io/SabAsan/pen/bGNrmzq */
  /* &:after {
    pointer-events: none;
    display: block;
    content: '';
    z-index: -1;
    width: 100%;
    height: 120%;
    background: linear-gradient(
      226deg,
      rgba(255, 255, 255, 0.4) 0%,
      rgba(255, 255, 255, 0.4) 35%,
      rgba(255, 255, 255, 0.2) 42%,
      rgba(255, 255, 255, 0) 60%
    );
    transform: translatey(-170%);
    will-change: transform;
    transition: transform 0.65s cubic-bezier(0.18, 0.9, 0.58, 1);
  }

  &:hover:after {
    transform: translatey(-100%);
  } */

  &:hover {
    border-color: var(--app-primary) !important;
    transform: var(--app-card-hover-transform);
    filter: var(--app-card-hover-filter);
    transition: var(--app-card-hover-transition);
  }
`;

export const InfoPanel = styled(Panel)<Card>`
  border-radius: 0px;
  width: ${(props) => `${props.$cardsize}px`};
  border-radius: var(--app-card-info-radius) !important;
  border-top: var(--app-card-info-top) !important;
  border-right: var(--app-card-info-right) !important;
  border-bottom: var(--app-card-info-bottom) !important;
  border-left: var(--app-card-info-left) !important;
`;

export const ImgPanel = styled(Panel)<Card>`
  border-top: var(--app-card-img-top) !important;
  border-right: var(--app-card-img-right) !important;
  border-bottom: var(--app-card-img-bottom) !important;
  border-left: var(--app-card-img-left) !important;
  border-radius: var(--app-card-img-radius) !important;

  &:focus-visible {
    border-color: var(--app-primary) !important;
    outline: none !important;
  }

  &:hover {
    border-color: var(--app-primary) !important;

    .rs-btn {
      display: block;
    }

    img {
      filter: brightness(50%);
      -webkit-filter: brightness(50%);
    }

    #placeholder-wrapper {
      filter: brightness(50%);
      -webkit-filter: brightness(50%);
    }
  }
`;

export const InfoSpan = styled.div`
  color: var(--app-text-secondary);
`;

export const CardButton = styled(Button)`
  display: inline-block !important;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: 0s;
`;

export const CardTitleWrapper = styled.span`
  display: flex;
  width: 100%;
  justify-content: center;
`;

export const CardTitleButton = styled(CardButton)`
  padding-top: 10px;
  padding-bottom: 0px;
  height: auto;
  line-height: 1.2;
  color: var(--app-text) !important;

  &:hover,
  &:focus {
    text-decoration: none;
    color: ${(props) => (!props.onClick ? 'var(--app-text)' : 'var(--app-primary)')} !important;
  }

  &:focus-visible {
  }
`;

export const CardSubtitleButton = styled(CardButton)`
  padding-bottom: 5px;
  height: auto;
  line-height: 1.2;
  color: var(--app-text-secondary) !important;

  &:hover,
  &:focus,
  &:active {
    text-decoration: none;
    color: ${(props) =>
      !props.onClick ? 'var(--app-text-secondary)' : 'var(--app-primary)'} !important;
  }
`;

export const CardSubtitle = styled.div<Card>`
  user-select: none;
  padding-bottom: 5px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: ${(props) => `${props.$cardsize}px`};
`;

export const CardImg = styled.img<Card>`
  height: ${(props) => `${props.$cardsize}px`};
`;

// Cast required: @types/react-lazy-load-image-component bundles its own React 19 types
// internally, making FunctionComponent<LazyLoadImageProps> incompatible with styled-components
// v6's WebTarget which uses the project's React 18 types. The cast bridges the gap.
export const LazyCardImg = styled(LazyLoadImage as React.ComponentType<LazyLoadImageProps>)<Card>`
  height: ${(props) => `${props.$cardsize}px`};
`;

export const Overlay = styled.div<Card>`
  position: relative;
  height: ${(props) => `${props.$cardsize}px`};
  width: ${(props) => `${props.$cardsize}px`};

  &:hover {
    cursor: pointer;
  }

  .corner-triangle {
    position: absolute;
    background-color: var(--app-primary);
    box-shadow: 0 0 10px 8px rgba(0, 0, 0, 0.8);
    height: 80px;
    left: -50px;
    top: -50px;
    width: 80px;
    pointer-events: none;

    transform: rotate(-45deg);
    -webkit-transform: rotate(-45deg);
  }
`;

const OverlayButton = styled(IconButton)`
  display: none;
  position: absolute !important;
  opacity: var(--app-card-overlay-opacity);
  transform: translate(-50%, -50%);
  -ms-transform: translate(-50%, -50%);
  background: var(--app-card-overlay-bg);
  color: var(--app-card-overlay-color);
  border-radius: var(--app-btn-radius);

  &:hover {
    opacity: 1;
    background: var(--app-card-overlay-bg-hover);
    background-color: var(--app-card-overlay-bg-hover) !important;
    color: var(--app-card-overlay-color-hover);
  }
`;

export const PlayOverlayButton = styled(OverlayButton)`
  top: 50%;
  left: 50%;
`;

export const AppendOverlayButton = styled(OverlayButton)`
  top: 90%;
  left: 90%;
`;

export const AppendNextOverlayButton = styled(OverlayButton)`
  top: 90%;
  left: 70%;
`;

export const FavoriteOverlayButton = styled(OverlayButton)`
  top: 90%;
  left: 50%;
`;

export const ModalViewOverlayButton = styled(OverlayButton)`
  top: 10%;
  left: 90%;
`;

export const CardImgWrapper = styled.div<{ $size: number; opacity?: number }>`
  clip-path: inset(0 0);
  height: ${(props) => props.$size}px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: ${(props) => (props.opacity ? 'var(--app-primary)' : 'unset')};
  opacity: ${(props) => props.opacity};
`;
