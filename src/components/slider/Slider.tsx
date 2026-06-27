import React, { useMemo, useState } from 'react';
import ReactSlider, { ReactSliderProps } from 'react-slider';
import styled from 'styled-components';
import format from 'format-duration';

interface SliderProps extends ReactSliderProps<number> {
  toolTipType?: 'text' | 'time';
  hasToolTip?: boolean;
}

interface StyledSliderExtraProps {
  isDragging?: boolean;
  hasToolTip?: boolean;
  index?: number;
}

// Cast to fix styled-components generic inference: force T=number (single-value slider)
const ReactSliderNumbered = ReactSlider as React.ComponentType<ReactSliderProps<number>>;
const StyledSlider = styled(ReactSliderNumbered)<StyledSliderExtraProps>`
  width: 100%;
  height: 25px;
  outline: none;

  .thumb {
    opacity: 1;
    top: 41%;

    &:after {
      content: attr(data-tooltip);
      top: -25px;
      left: -18px;
      color: var(--app-tooltip-color);
      background: var(--app-tooltip-bg);
      border-radius: 4px;
      padding: 2px 6px;
      white-space: nowrap;
      position: absolute;
      display: ${(props) => (props.isDragging && props.hasToolTip ? 'block' : 'none')};
    }

    &:focus-visible {
      outline: none;
      height: 13px;
      width: 13px;
      border: 1px var(--app-primary) solid;
      border-radius: 100%;
      text-align: center;
      background-color: var(--rs-slider-thumb-bg);
      transform: translate(-12px, -4px);
    }
  }

  .track-0 {
    background: ${(props) => props.isDragging && 'var(--app-primary)'};
  }

  .track {
    top: 41%;
  }

  &:hover {
    .track-0 {
      background: ${(props) => (props.index === 1 ? 'var(--rs-slider-bar)' : 'var(--app-primary)')};
    }
  }
`;

const StyledTrack = styled.div<{ $index: number }>`
  top: 0;
  bottom: 0;
  height: 5px;
  background: ${(props) =>
    props.$index === 1 ? 'var(--app-slider-bg)' : 'var(--app-slider-progress)'};
`;

interface ThumbState {
  value: number;
  valueNow: number;
  index: number;
}

interface TrackState {
  index: number;
  value: number;
}

interface MemoizedThumbProps {
  props: React.HTMLProps<HTMLDivElement>;
  state: ThumbState;
  toolTipType?: 'text' | 'time';
  tabIndex?: number;
}

const MemoizedThumb = ({ props, state, toolTipType }: MemoizedThumbProps) => {
  // eslint-disable-next-line react/prop-types -- key is a React internal prop, not a user-defined prop; rule fires incorrectly when key is destructured from an HTMLProps object
  const { key, ...thumbProps } = props;
  const { value } = state;
  const formattedValue = useMemo(() => {
    if (toolTipType === 'text') {
      return value;
    }

    return format(value * 1000);
  }, [toolTipType, value]);

  return <div key={key} {...thumbProps} data-tooltip={formattedValue} />;
};

// eslint-disable-next-line react/prop-types -- key is a React internal prop; rule fires incorrectly for react-range render function signature
const Track = ({ key, ...trackProps }: React.HTMLProps<HTMLDivElement>, state: TrackState) => (
  <StyledTrack key={key} {...trackProps} $index={state.index} />
);

const Thumb = (
  props: React.HTMLProps<HTMLDivElement>,
  state: ThumbState,
  toolTipType?: 'text' | 'time'
) => (
  <MemoizedThumb key="slider" tabIndex={0} props={props} state={state} toolTipType={toolTipType} />
);

const Slider = ({ toolTipType = 'text', hasToolTip = true, ...rest }: SliderProps) => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <StyledSlider
      {...rest}
      defaultValue={0}
      renderTrack={Track}
      renderThumb={(props, state) => {
        return Thumb(props as React.HTMLProps<HTMLDivElement>, state, toolTipType);
      }}
      isDragging={isDragging}
      hasToolTip={hasToolTip}
      onBeforeChange={(e: number, index: number) => {
        if (rest.onBeforeChange) {
          rest.onBeforeChange(e, index);
        }
        setIsDragging(true);
      }}
      onAfterChange={(e: number, index: number) => {
        if (rest.onAfterChange) {
          rest.onAfterChange(e, index);
        }
        setIsDragging(false);
      }}
    />
  );
};

export default Slider;
