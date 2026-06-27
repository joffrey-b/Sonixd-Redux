import React from 'react';
import { GenericItem } from '../../../types';
import CustomTooltip from '../../shared/CustomTooltip';
import { TableLinkButton, TableCellWrapper } from '../styled';

const LinkCell = ({
  linkProp,
  onClickLink,
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
  fontSize,
  cacheImages: _cacheImages,
  misc: _misc,
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
      {linkProp === 'genre' && rowData.genre?.length === 0 ? (
        <span>&#8203;</span>
      ) : Array.isArray(rowData[linkProp]) ? (
        rowData[linkProp].map((link: GenericItem, i: number) => (
          <span key={`${rowData.uniqueId}-${link.id}`}>
            {i > 0 && ', '}
            <CustomTooltip text={link.title}>
              <TableLinkButton
                $font={`${fontSize}px`}
                onClick={(e: MouseEvent) => onClickLink(e, i)}
              >
                {link.title}
              </TableLinkButton>
            </CustomTooltip>
          </span>
        ))
      ) : rowData[linkProp] ? (
        <CustomTooltip text={rowData[linkProp]}>
          <TableLinkButton $font={`${fontSize}px`} onClick={onClickLink}>
            {rowData[linkProp]}
          </TableLinkButton>
        </CustomTooltip>
      ) : (
        <span>&#8203;</span>
      )}
    </TableCellWrapper>
  );
};

export default LinkCell;
