import React, { useCallback } from 'react';

interface GridScrollTarget {
  scrollToRow(config: { index: number; behavior?: string }): void;
}

// react-window v2 imperative API uses scrollToRow({ index }) instead of scrollTo(offset).
// This hook is only ever called with position=0 (scroll to top).
const useGridScroll = (ref: React.RefObject<GridScrollTarget | null>) => {
  const gridScroll = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_position: number) => {
      setTimeout(() => {
        ref?.current?.scrollToRow({ index: 0, behavior: 'instant' });
      });
    },
    [ref]
  );

  return { gridScroll };
};

export default useGridScroll;
