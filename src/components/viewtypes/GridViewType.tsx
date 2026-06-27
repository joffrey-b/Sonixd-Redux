// Referenced from: https://codesandbox.io/s/jjkz5y130w?file=/index.js:700-703
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import Card from '../card/Card';
import { useAppSelector } from '../../redux/hooks';
import Paginator from '../shared/Paginator';
import CenterLoader from '../loader/CenterLoader';
import { settings } from '../shared/bridge';
import type { RowDataType } from 'rsuite-table';

interface CardConfig {
  property: string;
  urlProperty?: string;
  prefix?: string;
  unit?: string;
}

interface PlayClickConfig {
  type?: string;
  idProperty: string;
}

interface ListRef {
  readonly element: HTMLDivElement | null;
  scrollToRow(config: {
    align?: 'end' | 'start' | 'center' | 'auto' | 'smart';
    behavior?: 'auto' | 'smooth' | 'instant';
    index: number;
  }): void;
}

interface PaginationProps {
  recordsPerPage?: number;
  [key: string]: unknown;
}

interface SharedGridProps {
  data: unknown[];
  cardTitle: CardConfig;
  cardSubtitle: CardConfig | false;
  playClick: PlayClickConfig;
  size: number;
  cacheType: string;
  handleFavorite?: (rowData: RowDataType) => unknown;
  musicFolderId?: string;
}

interface InternalGridProps extends SharedGridProps {
  cacheImages: boolean;
  cachePath: string;
}

interface GridCardProps extends InternalGridProps {
  alignment: string;
  columnCount: number;
  itemCount: number;
  cardWidth: number;
  cardHeight: number;
  gapSize: number;
  index: number;
  style: React.CSSProperties;
}

// In react-window v2, rowProps are spread as individual props into the row component.
// So we receive the full itemData object's keys directly, plus index, style, ariaAttributes.
const GridCard = ({
  data,
  cardTitle,
  cardSubtitle,
  playClick,
  size,
  alignment,
  columnCount,
  itemCount,
  cacheType,
  cardWidth,
  cardHeight,
  gapSize,
  cacheImages,
  cachePath,
  handleFavorite,
  musicFolderId,
  index,
  style,
}: GridCardProps) => {
  const startIndex = index * columnCount;
  const stopIndex = Math.min(itemCount - 1, startIndex + columnCount - 1);
  const cards = [];
  const items = data as Record<string, unknown>[];

  for (let i = startIndex; i <= stopIndex; i += 1) {
    const item = items[i];
    cards.push(
      <div
        key={`card-${i}`}
        data-testid="album-card"
        style={{
          flex: `0 0 ${cardWidth}px`,
          height: cardHeight,
          margin: `0 ${gapSize / 2}px`,
          display: 'flex',
          // This allows immediate pointer events after scrolling to override the default delay
          // https://github.com/bvaughn/react-window/issues/128#issuecomment-460166682
          pointerEvents: 'auto',
        }}
      >
        <Card
          title={item[cardTitle.property]}
          subtitle={
            cardSubtitle &&
            item[cardSubtitle.property] &&
            `${item[cardSubtitle.property]}${cardSubtitle.unit}`
          }
          coverArt={item.image}
          size={size}
          url={
            cardTitle.urlProperty ? `${cardTitle.prefix}/${item[cardTitle.urlProperty]}` : undefined
          }
          subUrl={
            cardSubtitle && cardSubtitle.urlProperty
              ? `${cardSubtitle.prefix}/${item[cardSubtitle.urlProperty]}`
              : undefined
          }
          lazyLoad
          hasHoverButtons
          playClick={{
            ...playClick,
            id: item[playClick.idProperty],
          }}
          details={{ cacheType, ...item }}
          cacheImages={cacheImages}
          cachePath={cachePath}
          handleFavorite={handleFavorite}
          musicFolderId={musicFolderId}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: alignment,
      }}
    >
      {cards}
    </div>
  );
};

interface ListWrapperProps extends InternalGridProps {
  gapSize: number;
  alignment: string;
  height: number;
  itemCount: number;
  width: number;
  initialScrollOffset: number;
  onScroll: (scrollTop: number) => void;
  gridRef?: React.MutableRefObject<ListRef | null>;
}

function ListWrapper({
  data,
  cardTitle,
  cardSubtitle,
  playClick,
  size,
  gapSize,
  alignment,
  height,
  itemCount,
  width,
  cacheType,
  cacheImages,
  cachePath,
  handleFavorite,
  musicFolderId,
  initialScrollOffset,
  onScroll,
  gridRef,
}: ListWrapperProps) {
  const cardHeight = size + 55;
  const cardWidth = size;
  // How many cards can we show per row, given the current width?
  const columnCount = Math.floor((width - gapSize + 3) / (cardWidth + gapSize + 2));
  const rowCount = Math.ceil(itemCount / columnCount);

  // Fall back to a local ref when no external gridRef is provided so that
  // scroll persistence (initialScrollOffset / onScroll) always works.
  const localRef = useRef<ListRef | null>(null);
  const effectiveRef = gridRef ?? localRef;

  const itemData = useMemo(
    () => ({
      data,
      cardTitle,
      cardSubtitle,
      playClick,
      size,
      alignment,
      columnCount,
      itemCount,
      cacheType,
      cardWidth,
      cardHeight,
      gapSize,
      cacheImages,
      cachePath,
      handleFavorite,
      musicFolderId,
    }),
    [
      cardHeight,
      cardWidth,
      cacheType,
      cardSubtitle,
      cardTitle,
      columnCount,
      data,
      itemCount,
      playClick,
      size,
      gapSize,
      alignment,
      cacheImages,
      cachePath,
      handleFavorite,
      musicFolderId,
    ]
  );

  // react-window v2 removed initialScrollOffset and onScroll props.
  // We replicate them: restore the saved pixel offset once on mount (converted
  // to a row index), and forward native scroll events to the onScroll callback.
  useEffect(() => {
    const el = effectiveRef?.current?.element as HTMLElement | null | undefined;
    if (!el) return undefined;

    // Restore initial scroll position by converting pixel offset → row index.
    if (initialScrollOffset > 0) {
      const rowHeight = cardHeight + gapSize;
      const rowIndex = Math.max(0, Math.round(initialScrollOffset / rowHeight));
      effectiveRef.current?.scrollToRow({ index: rowIndex, behavior: 'instant' });
    }

    // Forward native scroll events so callers can persist the position.
    const handleScroll = () => {
      onScroll(el.scrollTop);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; scroll listener is attached to the DOM element, re-attaching on prop changes would double-register
  }, []);

  return (
    <div style={{ height, width }}>
      <List
        listRef={effectiveRef}
        className="List"
        rowCount={rowCount}
        rowHeight={cardHeight + gapSize}
        rowProps={itemData as never}
        rowComponent={GridCard}
        overscanCount={4}
      />
    </div>
  );
}

interface GridViewTypeProps extends SharedGridProps {
  initialScrollOffset?: number;
  onScroll?: (scrollTop: number) => void;
  paginationProps?: PaginationProps | false;
  loading?: boolean;
  gridRef?: React.MutableRefObject<ListRef | null>;
  isModal?: boolean;
}

const GridViewType = ({
  data,
  cardTitle,
  cardSubtitle,
  playClick,
  size,
  cacheType,
  handleFavorite,
  initialScrollOffset,
  onScroll,
  paginationProps,
  loading,
  gridRef,
}: GridViewTypeProps) => {
  const cacheImages = Boolean(settings.get('cacheImages'));
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const folder = useAppSelector((state) => state.folder);
  const [musicFolder, setMusicFolder] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (folder.applied.artists) {
      setMusicFolder(folder.musicFolder);
    }
  }, [folder]);

  return (
    <>
      <AutoSizer
        renderProp={({ height, width }) => (
          <>
            {data?.length && !loading ? (
              <ListWrapper
                height={
                  (height ?? 0) -
                  (paginationProps && paginationProps?.recordsPerPage !== 0 ? 45 : 0)
                }
                itemCount={data?.length}
                width={width ?? 0}
                data={data}
                cardTitle={cardTitle}
                cardSubtitle={cardSubtitle}
                playClick={playClick}
                size={size}
                gapSize={config.lookAndFeel.gridView.gapSize}
                alignment={config.lookAndFeel.gridView.alignment}
                cacheType={cacheType}
                cacheImages={cacheImages}
                cachePath={misc.imageCachePath}
                handleFavorite={handleFavorite}
                musicFolderId={musicFolder}
                initialScrollOffset={initialScrollOffset ?? 0}
                onScroll={onScroll || (() => {})}
                gridRef={gridRef}
              />
            ) : loading ? (
              <CenterLoader absolute />
            ) : (
              <></>
            )}

            {paginationProps && paginationProps?.recordsPerPage !== 0 && (
              <div style={{ height: data?.length ? '45px' : height, width, position: 'relative' }}>
                <Paginator {...paginationProps} bottom="true" />
              </div>
            )}
          </>
        )}
      />
    </>
  );
};

export default GridViewType;
