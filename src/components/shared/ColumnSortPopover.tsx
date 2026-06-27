import React from 'react';
import { Whisper } from 'rsuite';
import ColumnSort from './ColumnSort';
import Popup from './Popup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props are forwarded to ColumnSort via ...rest; typing all ColumnSort options here would duplicate its interface
const ColumnSortPopover = ({ children, ...rest }: any) => {
  return (
    <Whisper
      trigger="click"
      enterable
      placement="bottomEnd"
      preventOverflow
      speaker={
        <Popup width="275px" placement="bottomEnd">
          <ColumnSort {...rest} />
        </Popup>
      }
    >
      {children}
    </Whisper>
  );
};

export default ColumnSortPopover;
