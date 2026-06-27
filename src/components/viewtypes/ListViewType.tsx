// Resize derived from @nimrod-cohen https://gitter.im/rsuite/rsuite?at=5e1cd3f165540a529a0f5deb
import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from 'react';

export interface TableRef {
  scrollY: number;
  scrollX: number;
  scrollTop: (top: number) => void;
  scrollLeft: (left: number) => void;
}

interface PaginationProps {
  recordsPerPage?: number;
  [key: string]: unknown;
}

interface ListViewTypeProps {
  data?: unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row data type is caller-specific; making this generic requires updating all ~12 call sites
  handleRowClick?: (e: MouseEvent, rowData: any, tableData: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row data type is caller-specific
  handleRowDoubleClick?: (rowData: any, e?: MouseEvent) => void;
  tableColumns?: unknown[];
  hasDraggableColumns?: boolean;
  tableHeight?: number;
  rowHeight?: number;
  virtualized?: boolean;
  fontSize?: number;
  cacheImages?: unknown;
  children?: React.ReactNode;
  page?: string;
  listType?: string;
  isModal?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drag entries are Song[] at call sites but RowDataType[] in ListViewTable
  handleDragEnd?: (entries: any[]) => void;
  dnd?: boolean;
  miniView?: boolean;
  disableContextMenu?: boolean;
  disabledContextMenuOptions?: ContextMenuOptions[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row data type is caller-specific
  handleFavorite?: (rowData: any) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row data type is caller-specific
  handleRating?: (rowData: any, rating: number) => unknown;
  initialScrollOffset?: number;
  onScroll?: (scrollIndex: number) => void;
  loading?: boolean;
  paginationProps?: PaginationProps | false;
  nowPlaying?: unknown;
  playlist?: unknown;
}

export interface ListViewHandle {
  table: React.MutableRefObject<TableRef | null>;
}
import { DOMHelper } from 'rsuite';
import type { RowDataType, RowKeyType, TableInstance } from 'rsuite-table';
import type { ColumnEntry, ColumnList } from '../../redux/configSlice';
import type { ContextMenuOptions } from '../../redux/miscSlice';

interface CacheImages {
  cacheType?: string;
  cacheIdProperty?: string;
  enabled: boolean;
}
import CenterLoader from '../loader/CenterLoader';
import ListViewTable from './ListViewTable';

const ListViewType = (
  {
    data,
    handleRowClick,
    handleRowDoubleClick,
    tableColumns,
    hasDraggableColumns,
    tableHeight,
    rowHeight,
    virtualized,
    fontSize,
    cacheImages,
    children,
    page,
    listType,
    isModal,
    handleDragEnd,
    dnd,
    miniView,
    disableContextMenu,
    disabledContextMenuOptions,
    handleFavorite,
    handleRating,
    initialScrollOffset,
    onScroll,
    loading,
    paginationProps,
    ...rest
  }: ListViewTypeProps,
  ref: React.ForwardedRef<ListViewHandle>
) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragDirection, setDragDirection] = useState('');
  const [dragSpeed, setDragSpeed] = useState('');
  const [height, setHeight] = useState(0);
  const [show, setShow] = useState(false);
  // const [scrollY, setScrollY] = useState(0);
  const { getHeight } = DOMHelper;
  const wrapperRef = useRef<HTMLDivElement>(null);

  // When CSS height:100% can't propagate through a flex chain with overflow:auto
  // parents (e.g. in production builds), getBoundingClientRect returns 0.
  // Fall back to computing available height from the element's viewport position.
  const computeHeight = useCallback(
    (hasPagination: boolean): number => {
      const paginationAdj = hasPagination ? 45 : 0;
      if (!wrapperRef.current) return 200;
      const measured = getHeight(wrapperRef.current);
      if (measured > 0) return measured - paginationAdj;
      const rect = wrapperRef.current.getBoundingClientRect();
      const playerBarHeight = 98;
      const available = Math.max(100, window.innerHeight - playerBarHeight - rect.top);
      return available - paginationAdj;
    },
    [getHeight]
  );

  const tableRef = useRef<TableRef | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  useImperativeHandle(ref, () => ({
    get table() {
      return tableRef;
    },
  }));

  useEffect(() => {
    function handleResize() {
      setShow(false);
      window.clearTimeout(resizeTimerRef.current ?? undefined);
      resizeTimerRef.current = window.setTimeout(() => {
        setShow(true);
        // tableRef?.current?.scrollTop(Math.abs(scrollY));
      }, 500);

      setHeight(computeHeight(!!(paginationProps && paginationProps?.recordsPerPage !== 0)));
    }
    if (!tableHeight) {
      if (!miniView) {
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
        };
      }
    }

    return undefined;
  }, [computeHeight, tableHeight, miniView, paginationProps]);

  useEffect(() => {
    const hasPagination = !!(paginationProps && paginationProps?.recordsPerPage !== 0);
    if (!isModal && !tableHeight) {
      window.requestAnimationFrame(() => {
        setHeight(computeHeight(hasPagination));
        setShow(true);
      });
    } else {
      setTimeout(() => {
        window.requestAnimationFrame(() => {
          setHeight(computeHeight(hasPagination));
          setShow(true);
        });
      }, 250);
    }
  }, [computeHeight, tableHeight, isModal, paginationProps]);

  useEffect(() => {
    let scrollDistance = 0;
    switch (dragSpeed) {
      case 'slow':
        scrollDistance = 15;
        break;
      case 'medium':
        scrollDistance = 30;
        break;
      case 'fast':
        scrollDistance = 60;
        break;
      case 'fastest':
        scrollDistance = 240;
        break;
      default:
        scrollDistance = 15;
        break;
    }

    if (isDragging) {
      const interval = setInterval(() => {
        const tbl = tableRef.current;
        if (!tbl) return;
        const currentScrollY = Math.abs(tbl.scrollY);
        const currentScrollX = Math.abs(tbl.scrollX);
        if (dragDirection.match(/down|up/)) {
          // console.log(`currentScrollY + scrollDistance`, currentScrollY + scrollDistance);
          tbl.scrollTop(
            dragDirection === 'down'
              ? currentScrollY + scrollDistance
              : dragDirection === 'up' && currentScrollY - scrollDistance > 0
                ? currentScrollY - scrollDistance
                : 0
          );
        }

        if (dragDirection.match(/left|right/)) {
          tbl.scrollLeft(
            dragDirection === 'right'
              ? currentScrollX + 60
              : dragDirection === 'left' && currentScrollX - 60 > 0
                ? currentScrollX - 60
                : 0
          );
        }

        // setScrollY(currentScroll);
      }, 20);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [dragDirection, dragSpeed, isDragging]);

  useEffect(() => {
    tableRef.current?.scrollTop(initialScrollOffset ?? 0);
  }, [initialScrollOffset]);

  return (
    <>
      {!show && <CenterLoader />}
      <div
        role="presentation"
        style={{
          flexGrow: 1,
          height: '100%',
          cursor: isDragging ? 'all-scroll' : undefined,
        }}
        ref={wrapperRef}
        onMouseDown={(e) => {
          e.preventDefault();
          if (e.button === 1) {
            setIsDragging(!isDragging);
          }
          if (e.button === 0 && isDragging) {
            setIsDragging(false);
          }
        }}
      >
        <div
          id="scroll-top"
          role="presentation"
          style={{
            position: 'absolute',
            height: '40%',
            width: '90%',
            top: 0,
            left: '5%',
            right: 0,
            zIndex: isDragging ? 1 : undefined,
          }}
          onMouseEnter={() => {
            setDragDirection('up');
          }}
          onMouseLeave={() => {
            setDragDirection('none');
          }}
        >
          <div
            id="scroll-top-fastest"
            role="presentation"
            style={{ height: 'calc(100% / 4)' }}
            onMouseEnter={() => {
              setDragSpeed('fastest');
            }}
          />
          <div
            id="scroll-top-fast"
            role="presentation"
            style={{ height: 'calc(100% / 4)' }}
            onMouseEnter={() => {
              setDragSpeed('fast');
            }}
          />
          <div
            id="scroll-top-medium"
            role="presentation"
            style={{ height: 'calc(100% / 4)' }}
            onMouseEnter={() => {
              setDragSpeed('medium');
            }}
          />
          <div
            id="scroll-top-slow"
            role="presentation"
            style={{ height: 'calc(100% / 4)' }}
            onMouseEnter={() => {
              setDragSpeed('slow');
            }}
          />
        </div>
        <div
          id="scroll-left"
          role="presentation"
          style={{
            position: 'absolute',
            height: '100%',
            width: '5%',
            top: 0,
            left: 0,
            zIndex: isDragging ? 1 : undefined,
          }}
          onMouseEnter={() => {
            setDragDirection('left');
          }}
          onMouseLeave={() => {
            setDragDirection('none');
          }}
        />
        <div
          id="scroll-right"
          role="presentation"
          style={{
            position: 'absolute',
            height: '100%',
            width: '5%',
            top: 0,
            right: 0,
            zIndex: isDragging ? 1 : undefined,
          }}
          onMouseEnter={() => {
            setDragDirection('right');
          }}
          onMouseLeave={() => {
            setDragDirection('none');
          }}
        />
        <div
          id="scroll-neutral"
          role="presentation"
          style={{
            position: 'absolute',
            height: '20%',
            width: '90%',
            top: '40%',
            left: '5%',
            right: 0,
            zIndex: isDragging ? 1 : undefined,
          }}
          onMouseEnter={() => {
            setDragDirection('none');
          }}
        />
        <div
          id="scroll-bottom"
          role="presentation"
          style={{
            position: 'absolute',
            height: '40%',
            width: '90%',
            bottom: 0,
            left: '5%',
            right: 0,
            zIndex: isDragging ? 1 : undefined,
          }}
          onMouseEnter={() => {
            setDragDirection('down');
          }}
          onMouseLeave={() => {
            setDragDirection('none');
          }}
        >
          <div
            id="scroll-bottom-slow"
            role="presentation"
            style={{ height: 'calc(100% / 4)' }}
            onMouseEnter={() => {
              setDragSpeed('slow');
            }}
          />
          <div
            id="scroll-bottom-medium"
            role="presentation"
            style={{ height: 'calc(100% / 4)' }}
            onMouseEnter={() => {
              setDragSpeed('medium');
            }}
          />
          <div
            id="scroll-bottom-fast"
            role="presentation"
            style={{ height: 'calc(100% / 4)' }}
            onMouseEnter={() => {
              setDragSpeed('fast');
            }}
          />
          <div
            id="scroll-bottom-fastest"
            role="presentation"
            style={{ height: 'calc(100% / 4)' }}
            onMouseEnter={() => {
              setDragSpeed('fastest');
            }}
          />
        </div>

        {show && (
          <ListViewTable
            tableRef={
              tableRef as unknown as React.RefObject<
                TableInstance<RowDataType, RowKeyType> & { scrollY?: number }
              >
            }
            height={tableHeight || height}
            data={(data ?? []) as RowDataType[]}
            virtualized
            rowHeight={rowHeight ?? 0}
            fontSize={fontSize ?? 14}
            columns={(tableColumns ?? []) as ColumnEntry[]}
            handleRowClick={handleRowClick ?? (() => {})}
            handleRowDoubleClick={handleRowDoubleClick ?? (() => {})}
            cacheImages={cacheImages as CacheImages}
            page={page}
            listType={listType as ColumnList | undefined}
            nowPlaying={rest.nowPlaying as boolean | undefined}
            playlist={rest.playlist as boolean | undefined}
            isModal={isModal}
            handleDragEnd={handleDragEnd}
            dnd={dnd}
            miniView={miniView}
            disableContextMenu={disableContextMenu}
            disabledContextMenuOptions={disabledContextMenuOptions}
            handleFavorite={handleFavorite ?? (() => {})}
            handleRating={handleRating ?? (() => {})}
            onScroll={onScroll || (() => {})}
            paginationProps={
              paginationProps as { recordsPerPage: number; [key: string]: unknown } | undefined
            }
            loading={loading}
          />
        )}
      </div>
    </>
  );
};

export default forwardRef(ListViewType);
