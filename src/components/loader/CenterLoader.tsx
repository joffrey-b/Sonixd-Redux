import React from 'react';
import { Loader } from 'rsuite';

const CenterLoader = ({ absolute }: { absolute?: boolean }) => {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: absolute ? 'absolute' : undefined,
        top: absolute ? 0 : undefined,
        left: absolute ? 0 : undefined,
        width: absolute ? '100%' : undefined,
      }}
    >
      <Loader />
    </div>
  );
};

export default CenterLoader;
