import React, { useCallback } from 'react';

interface ListScrollTarget {
  table: { current: { scrollTop: (pos: number) => void } | null };
}

const useListScroll = (ref: React.RefObject<ListScrollTarget | null>) => {
  const listScroll = useCallback(
    (position: number) => {
      setTimeout(() => {
        ref?.current?.table?.current?.scrollTop(position);
      });
    },
    [ref]
  );

  return { listScroll };
};

export default useListScroll;
