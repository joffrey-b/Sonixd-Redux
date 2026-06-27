import React from 'react';
import CachedCoverArt from './CachedCoverArt';
import { TableCellWrapper } from '../styled';

const CoverArtCell = ({
  rowData,
  rowIndex,
  column,
  misc,
  rowHeight,
  cacheImages,
  handleRowClick,
  handleRowDoubleClick,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table cell receives heterogeneous row data; full typing belongs in ListViewTable
}: any) => {
  return (
    <TableCellWrapper
      $height={rowHeight}
      $alignment={column.alignment}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseUp={onMouseUp}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        if (!column.dataKey?.match(/starred|userRating|genre|columnResizable|columnDefaultSort/)) {
          handleRowClick(e, {
            ...rowData,
            rowIndex,
          });
        }
      }}
      onDoubleClick={() => {
        if (!column.dataKey?.match(/starred|userRating|genre|columnResizable|columnDefaultSort/)) {
          handleRowDoubleClick({
            ...rowData,
            rowIndex,
          });
        }
      }}
    >
      <CachedCoverArt
        fileName={`${cacheImages.cacheType}_${rowData[cacheImages.cacheIdProperty]}.jpg`}
        fallbackSrc={rowData.image}
        cachePath={misc.imageCachePath}
        size={rowHeight - 10}
        cacheEnabled={cacheImages.enabled}
      />
    </TableCellWrapper>
  );
};

export default CoverArtCell;
