import React from 'react';
import { Tag } from 'rsuite';
import CustomTooltip from './CustomTooltip';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props are forwarded to rsuite Tag via ...rest; duplicating TagProps here is unnecessary
const TagLink = ({ tooltip, children, ...rest }: any) => {
  return (
    <CustomTooltip text={tooltip}>
      <Tag {...rest}>{children}</Tag>
    </CustomTooltip>
  );
};

export default TagLink;
