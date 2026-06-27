import React from 'react';
import styled from 'styled-components';
import BackwardIcon from '@rsuite/icons/legacy/Backward';
import ClockOIcon from '@rsuite/icons/legacy/ClockO';
import ForwardIcon from '@rsuite/icons/legacy/Forward';
import HeartIcon from '@rsuite/icons/legacy/Heart';
import HeartOIcon from '@rsuite/icons/legacy/HeartO';
import MusicIcon from '@rsuite/icons/legacy/Music';
import PauseCircleIcon from '@rsuite/icons/legacy/PauseCircle';
import PlayCircleIcon from '@rsuite/icons/legacy/PlayCircle';
import PlusSquareIcon from '@rsuite/icons/legacy/PlusSquare';
import RandomIcon from '@rsuite/icons/legacy/Random';
import RefreshIcon from '@rsuite/icons/legacy/Refresh';
import SpinnerIcon from '@rsuite/icons/legacy/Spinner';
import StepBackwardIcon from '@rsuite/icons/legacy/StepBackward';
import StepForwardIcon from '@rsuite/icons/legacy/StepForward';
import StopIcon from '@rsuite/icons/legacy/Stop';
import TasksIcon from '@rsuite/icons/legacy/Tasks';
import VolumeDownIcon from '@rsuite/icons/legacy/VolumeDown';
import VolumeOffIcon from '@rsuite/icons/legacy/VolumeOff';

interface IconProps {
  spin?: boolean;
  style?: React.CSSProperties;
}

const PLAYER_ICON_MAP: Record<string, React.ComponentType<IconProps>> = {
  backward: BackwardIcon,
  'clock-o': ClockOIcon,
  forward: ForwardIcon,
  heart: HeartIcon,
  'heart-o': HeartOIcon,
  music: MusicIcon,
  'pause-circle': PauseCircleIcon,
  'play-circle': PlayCircleIcon,
  'plus-square': PlusSquareIcon,
  random: RandomIcon,
  refresh: RefreshIcon,
  spinner: SpinnerIcon,
  'step-backward': StepBackwardIcon,
  'step-forward': StepForwardIcon,
  stop: StopIcon,
  tasks: TasksIcon,
};

const VOLUME_ICON_MAP: Record<string, React.ComponentType<IconProps>> = {
  'volume-down': VolumeDownIcon,
  'volume-off': VolumeOffIcon,
};

interface PlayerControlIconProps {
  icon: string;
  active?: string;
  disabled?: boolean;
  spin?: boolean;
  size?: string;
  fixedWidth?: boolean;
  onClick?: React.MouseEventHandler;
  onKeyDown?: React.KeyboardEventHandler;
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-pressed'?: boolean | 'true' | 'false';
  style?: React.CSSProperties;
  className?: string;
}

const PlayerControlIconWrapper = styled.span<{ $active?: string; disabled?: boolean }>`
  cursor: ${(props) => (props.disabled ? 'default' : 'pointer')};
  font-size: 12px;
  color: ${(props) =>
    props.$active === 'true' ? 'var(--app-primary)' : 'var(--app-playerbar-btn)'};
  padding-left: 10px;
  padding-right: 10px;
  display: inline-flex;
  align-items: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
  pointer-events: ${(props) => (props.disabled ? 'none' : 'auto')};

  &:hover {
    color: ${(props) =>
      props.$active === 'true' ? 'var(--app-primary)' : 'var(--app-playerbar-btn-hover)'};
  }

  &:focus-visible {
    outline: none;
    filter: brightness(0.7);
  }
`;

const RS4_SIZE_MAP: Record<string, string> = {
  lg: '1.33em',
  '2x': '2em',
  '3x': '3em',
  '4x': '4em',
  '5x': '5em',
};

export const PlayerControlIcon: React.FC<PlayerControlIconProps> = ({
  icon,
  active,
  disabled,
  spin,
  size,
  fixedWidth: _fixedWidth,
  ...rest
}) => {
  const IconComponent = PLAYER_ICON_MAP[icon];
  const fontSize = size ? (RS4_SIZE_MAP[size] ?? size) : undefined;
  return (
    <PlayerControlIconWrapper $active={active} disabled={disabled} {...rest}>
      {IconComponent && <IconComponent spin={spin} style={fontSize ? { fontSize } : undefined} />}
    </PlayerControlIconWrapper>
  );
};

const VolumeIconWrapper = styled.span`
  color: var(--app-playerbar-color);
  cursor: pointer;
  font-size: 12px;
  margin-right: 15px;
  padding: 0;
  display: inline-flex;
  align-items: center;
`;

interface VolumeIconProps {
  icon: string;
  onClick?: React.MouseEventHandler;
  size?: string;
}

export const VolumeIcon: React.FC<VolumeIconProps> = ({ icon, size, ...rest }) => {
  const IconComponent = VOLUME_ICON_MAP[icon];
  const fontSize = size ? (RS4_SIZE_MAP[size] ?? size) : undefined;
  return (
    <VolumeIconWrapper {...rest}>
      {IconComponent && <IconComponent style={fontSize ? { fontSize } : undefined} />}
    </VolumeIconWrapper>
  );
};

export const PlayerContainer = styled.div`
  background: var(--app-playerbar-bg);
  height: 100%;
  border-top: var(--app-playerbar-border-top);
  border-right: var(--app-playerbar-border-right);
  border-bottom: var(--app-playerbar-border-bottom);
  border-left: var(--app-playerbar-border-left);
  filter: var(--app-playerbar-filter);
`;

export const PlayerColumn = styled.div<{
  $left?: boolean;
  $center?: boolean;
  $right?: boolean;
  $height: string;
}>`
  user-select: none;
  height: ${(props) => props.$height};
  display: flex;
  align-items: center;
  justify-content: ${(props) =>
    props.$left ? 'flex-start' : props.$center ? 'center' : props.$right ? 'flex-end' : 'center'};
`;

export const CoverArtContainer = styled.div<{ $expand: boolean }>`
  height: 65px;
  width: 65px;
  .rs-btn {
    display: none;
  }

  &:hover {
    .rs-btn {
      display: ${(props) => (props.$expand ? 'block' : 'none')};
      position: absolute;
      top: 0;
      left: 0;
      border-radius: 0px !important;
    }
  }
`;

export const LinkButton = styled.a<{ $playing?: string; $subtitle?: string }>`
  border-radius: 0px;
  background: transparent;
  max-width: 100%;
  padding: 0px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  color: ${(props) =>
    props.$playing === 'true'
      ? 'var(--app-primary)'
      : props.$subtitle === 'true'
        ? 'var(--app-playerbar-color-secondary)'
        : 'var(--app-playerbar-color)'} !important;

  &:hover {
    text-decoration: underline;
  }

  &:hover,
  &:active,
  &:focus {
    background: transparent !important;
    color: var(--app-playerbar-color);
    cursor: pointer;
  }

  &:focus-visible {
    text-decoration: underline;
  }
`;

export const DurationSpan = styled.span`
  color: var(--app-playerbar-color);
`;

export const MiniViewContainer = styled.div<{ $display: string }>`
  user-select: none;
  pointer-events: ${(props) => (props.$display === 'true' ? 'all' : 'none')};
  position: absolute;
  bottom: 100px;
  right: 25px;
  padding: 8px;
  width: 400px;
  height: var(--app-miniplayer-height);
  background: var(--app-miniplayer-bg);
  border: 1px #000 solid;
  filter: drop-shadow(0px 1px 2px #121316);
  overflow: hidden auto;
  opacity: ${(props) => (props.$display === 'true' ? 'var(--app-miniplayer-opacity)' : 0)};
  color: var(--app-text) !important;
  z-index: 500;
`;

export const InfoViewPanel = styled.div<{ height?: string }>`
  background: rgba(150, 150, 150, 0.03);
  border-radius: 15px;
  padding: 20px;
  margin: 0 0 5px 0;
  height: ${(props) => props.height};
`;

export const SongTitle = styled.div`
  text-align: center;
  font-size: 20px;
  user-select: none;
`;

export const ArtistTitle = styled.h1`
  font-size: 28px;
  user-select: none;
`;

export const InfoGridContainer = styled.div`
  display: grid;
  margin-bottom: 5px;
  grid-auto-columns: 1fr;
  grid-template-columns: 1fr;
  grid-template-rows: 0.5fr 1fr;
  gap: 5px 0px;
  grid-template-areas:
    'Player'
    'Artist-Info';

  @media screen and (min-width: 800px) {
    grid-template-columns: 1fr 4fr;
    grid-template-rows: 1fr 1fr;
    grid-auto-columns: 1fr;
    gap: 0px 5px;
    grid-auto-flow: row;
    grid-template-areas:
      'Player Artist-Info'
      'Player Artist-Info';
  }
`;

export const InfoPlayerContainer = styled.div`
  grid-area: Player;
`;

export const ArtistInfoContainer = styled.div`
  grid-area: Artist-Info;
`;
