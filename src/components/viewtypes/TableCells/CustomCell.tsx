import React from 'react';
import { TableCellWrapper } from '../styled';

const CustomCell = ({
  rowData,
  rowIndex,
  column,
  rowHeight,
  handleRowClick,
  handleRowDoubleClick,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  nowPlaying,
  sortColumn,
  children,
  ...rest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table cell receives heterogeneous row data; full typing belongs in ListViewTable
}: any) => {
  return (
    <TableCellWrapper
      $height={rowHeight}
      $alignment={column.alignment}
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
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseUp={onMouseUp}
      {...rest}
    >
      {!children ? <span>&#8203;</span> : children}
    </TableCellWrapper>
  );
};

export default CustomCell;
