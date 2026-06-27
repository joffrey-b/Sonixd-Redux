import React from 'react';
import { Tooltip, Whisper } from 'rsuite';
import styled from 'styled-components';
import { useAppSelector } from '../../redux/hooks';

const StyledTooltip = styled(Tooltip)`
  .rs-tooltip-inner {
    background-color: var(--app-tooltip-bg);
    color: var(--app-tooltip-color);
    border-radius: var(--app-tooltip-radius);
    border: var(--app-tooltip-border);
  }
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props are forwarded to rsuite Whisper via ...rest; duplicating WhisperProps here is unnecessary
const CustomTooltip = ({ children, text, delay, placement, disabled, ...rest }: any) => {
  const config = useAppSelector((state) => state.config);
  return (
    <Whisper
      trigger={disabled ? 'none' : 'hover'}
      delay={delay || 500}
      speaker={
        <StyledTooltip style={{ fontFamily: config.lookAndFeel.font }}>{text}</StyledTooltip>
      }
      placement={placement || 'top'}
      {...rest}
    >
      {children}
    </Whisper>
  );
};

export default CustomTooltip;
