import { useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import {
  clearSelected,
  setIsDragging,
  setSelected,
  toggleSelected,
} from '../redux/multiSelectSlice';
import { setStatus } from '../redux/playerSlice';
import { fixPlayer2Index, moveToIndex, setPlayerIndex } from '../redux/playQueueSlice';
import { moveToIndex as moveToIndexPlaylist } from '../redux/playlistSlice';
import type { Song } from '../types';
import { moveSelectedToIndex, sliceRangeByUniqueId } from '../shared/utils';

const useListClickHandler = <T extends { uniqueId: string }>(options?: {
  singleClick?: (e: MouseEvent, rowData: T, tableData: T[]) => void;
  doubleClick?: (rowData: T, e?: MouseEvent) => void;
  dnd?: 'playQueue' | 'playlist';
}) => {
  const dispatch = useAppDispatch();
  const multiSelect = useAppSelector((state) => state.multiSelect);
  // useRef so the timeout ID persists across re-renders — a plain let variable
  // would be reset to null on every render, breaking double-click detection.
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleRowClick = (e: MouseEvent, rowData: T, tableData: T[]) => {
    if (timeoutRef.current === null) {
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;

        if (!options?.singleClick) {
          if (e.ctrlKey) {
            dispatch(toggleSelected(rowData as unknown as Parameters<typeof toggleSelected>[0]));
          } else if (e.shiftKey) {
            dispatch(
              setSelected(
                sliceRangeByUniqueId(
                  tableData,
                  multiSelect.lastSelected.uniqueId,
                  rowData.uniqueId
                ) as unknown as Parameters<typeof setSelected>[0]
              )
            );
          }
        } else {
          options.singleClick(e, rowData, tableData);
        }
      }, 100);
    }
  };

  const handleRowDoubleClick = (rowData: T, e?: MouseEvent) => {
    window.clearTimeout(timeoutRef.current ?? undefined);
    timeoutRef.current = null;

    dispatch(clearSelected());

    if (!options?.doubleClick) {
      dispatch(setPlayerIndex(rowData as unknown as Song));
      dispatch(fixPlayer2Index());
      dispatch(setStatus('PLAYING'));
    } else {
      options.doubleClick(rowData, e);
    }
  };

  const handleDragEnd = (entries: Song[]) => {
    if (multiSelect.isDragging) {
      const reorderedQueue = moveSelectedToIndex(
        entries,
        multiSelect.selected,
        multiSelect.currentMouseOverId
      );

      if (options?.dnd === 'playQueue') {
        dispatch(moveToIndex(reorderedQueue));
      }

      if (options?.dnd === 'playlist') {
        dispatch(moveToIndexPlaylist(reorderedQueue));
      }

      dispatch(setIsDragging(false));
    }
  };

  return { handleRowClick, handleRowDoubleClick, handleDragEnd };
};

export default useListClickHandler;
