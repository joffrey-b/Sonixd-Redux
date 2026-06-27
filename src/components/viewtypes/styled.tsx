import styled from 'styled-components';
import { Button, Table } from 'rsuite';

export const TableLinkButton = styled(Button)<{
  $subtitle?: string;
  $active?: boolean;
  $font?: string;
}>`
  font-size: ${(props) => props.$font};
  background: transparent;
  max-width: 100%;
  padding: 0px;
  /* RSuite Button sets height: 2.25rem (36px) by default which inflates the row.
     height: auto + line-height: 1.2 reduce it to natural text height. */
  height: auto;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  color: ${(props) =>
    props.$subtitle === 'true' ? 'var(--rs-text-secondary)' : 'var(--rs-text-primary)'};

  &:hover,
  &:active,
  &:focus {
    color: ${(props) =>
      props.$subtitle === 'true'
        ? 'var(--rs-text-secondary)'
        : 'var(--rs-text-primary)'} !important;
    background: transparent !important;
    text-decoration: underline;
    cursor: pointer;
  }
`;

export const TableCellWrapper = styled.div<{
  $height?: number;
  $alignment?: string;
}>`
  flex: 1;
  min-width: 0;
  padding-right: 5px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  text-align: ${(props) => props.$alignment || 'left'};
  height: ${(props) => (props.$height ? `${props.$height}px` : undefined)};
  line-height: ${(props) => (props.$height ? `${props.$height}px` : undefined)};
`;

export const CombinedTitleContainer = styled.div<{ $height: number }>`
  width: 100%;

  .row-main {
    height: ${(props) => props.$height}px;
    display: flex;
    align-items: center;

    .col-cover {
      flex: 0 0 ${(props) => props.$height}px;
      width: ${(props) => props.$height}px;
      padding-right: 5px;
    }

    .col-text {
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      padding-left: 2px;
      padding-right: 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1px;

      .row-sub-secondarytext {
        font-size: smaller;
        overflow: hidden;
        white-space: nowrap;
      }
    }
  }
`;

export const CombinedTitleTextWrapper = styled.span`
  display: block;
  width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  &:focus-visible {
    outline: none;
    text-decoration: underline;
  }
`;

export const StyledTableHeaderCell = styled(Table.HeaderCell)`
  .rs-table-column-resize-spanner::before {
    border-color: transparent var(--rs-text-primary) transparent transparent !important;
  }

  .rs-table-column-resize-spanner::after {
    border-color: transparent transparent transparent var(--rs-text-primary) !important;
  }

  .rs-table-cell-content:hover .rs-table-column-resize-spanner:hover {
    background-color: var(--rs-text-primary) !important;
  }

  /* rsuite 6: sort icon uses a single SVG with class .rs-table-cell-header-icon-sort */
  .rs-table-cell-header-icon-sort {
    color: var(--rs-table-sort) !important;
  }
`;
