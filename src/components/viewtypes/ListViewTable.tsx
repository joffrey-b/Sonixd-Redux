import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import _ from 'lodash';
import styled from 'styled-components';
import { useHotkeys } from 'react-hotkeys-hook';
import { Table } from 'rsuite';
import BarsIcon from '@rsuite/icons/legacy/Bars';
import FolderOpenIcon from '@rsuite/icons/legacy/FolderOpen';
import HeartIcon from '@rsuite/icons/legacy/Heart';
import HeartOIcon from '@rsuite/icons/legacy/HeartO';
import Trash2Icon from '@rsuite/icons/legacy/Trash2';

import useLongPress from 'react-use/lib/useLongPress';
import {
  CombinedTitleContainer,
  CombinedTitleTextWrapper,
  TableLinkButton,
  StyledTableHeaderCell,
  TableCellWrapper,
} from './styled';
import {
  formatSongDuration,
  formatDate,
  convertByteToMegabyte,
  sliceRangeByUniqueId,
} from '../../shared/utils';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  fixPlayer2Index,
  setPlayerIndex,
  setSort,
  sortPlayQueue,
} from '../../redux/playQueueSlice';
import {
  SecondaryTextWrapper,
  StyledCheckbox,
  StyledIconButton,
  StyledIconToggle,
  StyledRate,
} from '../shared/styled';
import { addModalPage, setContextMenu } from '../../redux/miscSlice';
import type { ContextMenu as ContextMenuState } from '../../redux/miscSlice';
import {
  clearSelected,
  setCurrentMouseOverId,
  setIsDragging,
  setIsSelectDragging,
  setSelected,
  setSelectedSingle,
  toggleSelectedSingle,
} from '../../redux/multiSelectSlice';
import CustomTooltip from '../shared/CustomTooltip';
import { sortPlaylist } from '../../redux/playlistSlice';
import {
  removePlaybackFilter,
  setColumnList,
  setPageSort,
  setPlaybackFilter,
  ConfigPage,
  ColumnList,
  ColumnEntry,
} from '../../redux/configSlice';
import type { RowDataType, RowKeyType, TableInstance } from 'rsuite-table';
import { setStatus } from '../../redux/playerSlice';
import { GenericItem, Item } from '../../types';
import Paginator from '../shared/Paginator';
import { setFilter, setPagination } from '../../redux/viewSlice';
import CoverArtCell from './TableCells/CoverArtCell';
import CachedCoverArt from './TableCells/CachedCoverArt';
import TextCell from './TableCells/TextCell';
import LinkCell from './TableCells/LinkCell';
import CustomCell from './TableCells/CustomCell';
import { settings } from '../shared/bridge';

const StyledTable = styled(Table)<{ rowHeight: number; $isDragging?: boolean }>`
  .rs-table-row.selected {
    background: var(--app-selected-row) !important;
    // Resolve bug from rsuite-table where certain scrollpoints show a horizontal border
    height: ${(props) => `${props.rowHeight + 1}px !important`};
  }

  .col-default-hide {
    display: none;
  }

  .rs-table-row {
    &:hover {
      .col-default-hide {
        display: block !important;
      }

      .col-default-show {
        display: none;
      }
    }
  }

  .rs-table-row.dragover {
    box-shadow: inset 0px 5px 0px -3px var(--app-primary);
  }

  .rs-table-row.drop-after-last {
    box-shadow: inset 0px -5px 0px -3px var(--app-primary);
  }

  .rs-table-row.playing {
    color: var(--app-primary) !important;

    span {
      color: var(--app-primary) !important;
    }

    .rs-btn {
      color: var(--app-primary);
    }
  }

  .rs-table-cell:not(.rs-table-cell-header) {
    background: transparent;
  }

  /* Direct override — CSS variable cascade from RootContainer proved unreliable */
  .rs-table-cell-header {
    background-color: var(--app-table-header-bg) !important;
  }

  .rs-table-row,
  .rs-table-cell-group,
  .rs-table-cell {
    transition: none;
  }

  .rs-table-loader-wrapper {
    background-color: transparent;
  }

  .rs-table-loader-text {
    display: none;
  }

  // Prevent default drag
  -moz-user-select: -moz-none;
  -khtml-user-select: none;
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
`;

const DragHandleCell = styled.span<{ $isDragging: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;

  .row-index {
    display: ${(props) => (props.$isDragging ? 'none' : 'inline')};
  }
  .drag-icon {
    display: ${(props) => (props.$isDragging ? 'inline-flex' : 'none')};
  }

  &:hover .row-index {
    display: none;
  }
  &:hover .drag-icon {
    display: inline-flex;
  }
`;

const DropZone = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
`;

interface CacheImages {
  cacheType?: string;
  cacheIdProperty?: string;
  enabled: boolean;
}

interface ColumnPickerItem {
  value: {
    dataKey: string;
    width?: number;
    flexGrow?: number;
  };
}

interface ListViewConfig {
  option: ColumnList;
  columnList: ColumnPickerItem[];
}

interface ListViewTableProps {
  tableRef?: React.RefObject<TableInstance<RowDataType, RowKeyType> & { scrollY?: number }>;
  height?: number;
  data: RowDataType[];
  virtualized?: boolean;
  rowHeight: number;
  fontSize: number;
  columns: ColumnEntry[];
  handleRowClick: (e: MouseEvent, rowData: RowDataType, tableData: RowDataType[]) => void;
  handleRowDoubleClick: (rowData: RowDataType) => void;
  cacheImages: CacheImages;
  autoHeight?: boolean;
  page?: string;
  listType?: ColumnList;
  isModal?: boolean;
  nowPlaying?: boolean;
  playlist?: boolean;
  config?: ListViewConfig;
  handleDragEnd?: (entries: RowDataType[]) => void;
  miniView?: boolean;
  dnd?: boolean;
  disableRowClick?: boolean;
  disableContextMenu?: boolean;
  disabledContextMenuOptions?: ContextMenuState['disabledOptions'];
  handleFavorite: (rowData: RowDataType) => void;
  handleRating: (rowData: RowDataType, value: number) => void;
  onScroll?: (offset: number) => void;
  loading?: boolean;
  paginationProps?: { recordsPerPage: number; [key: string]: unknown };
  affixHeader?: boolean;
}

const ListViewTable = ({
  tableRef,
  height,
  data,
  virtualized,
  rowHeight,
  fontSize,
  columns,
  handleRowClick,
  handleRowDoubleClick,
  cacheImages,
  autoHeight,
  page,
  listType,
  isModal,
  nowPlaying,
  playlist,
  config,
  handleDragEnd,
  miniView,
  dnd,
  disableRowClick,
  disableContextMenu,
  disabledContextMenuOptions,
  handleFavorite,
  handleRating,
  onScroll,
  loading,
  paginationProps,
  affixHeader,
}: ListViewTableProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const misc = useAppSelector((state) => state.misc);
  const configState = useAppSelector((state) => state.config);
  const playQueue = useAppSelector((state) => state.playQueue);
  const multiSelect = useAppSelector((state) => state.multiSelect);
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortType, setSortType] = useState<'asc' | 'desc' | undefined>();
  const [sortedData, setSortedData] = useState(data);
  const [sortedCount, setSortedCount] = useState(0);
  const [isOverDropZone, setIsOverDropZone] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const mouseYRef = useRef<number>(0);
  const dragScrollRafRef = useRef<number | null>(null);
  const currentDragDataRef = useRef<RowDataType[] | null>(null);
  const isDragOriginRef = useRef(false);

  useHotkeys(
    configState.hotkeys.selectAll ?? '',
    () => {
      if (multiSelect.selected.length === data.length) {
        dispatch(clearSelected());
      } else {
        dispatch(clearSelected());
        dispatch(
          setSelected(
            (sortColumn && !nowPlaying ? sortedData : data) as unknown as Parameters<
              typeof setSelected
            >[0]
          )
        );
      }
    },
    { preventDefault: true },
    [multiSelect.selected, data, configState.hotkeys.selectAll]
  );

  const handleSortColumn = (column: string, type: 'asc' | 'desc' = 'asc') => {
    if (!config) {
      setSortColumn(column);
      setSortType(type);
      if (nowPlaying) {
        dispatch(
          setSort({
            sortColumn: column,
            sortType: type,
          })
        );
      } else if (page) {
        dispatch(
          setPageSort({
            page: page as Parameters<typeof setPageSort>[0]['page'],
            sort: {
              sortColumn: column,
              sortType: type,
            },
          })
        );
      }

      if (column === (nowPlaying ? playQueue.sortColumn : sortColumn)) {
        setSortedCount(sortedCount + 1);

        if (sortedCount >= 1) {
          if (nowPlaying) {
            dispatch(
              setSort({
                sortColumn: undefined,
                sortType: 'asc',
              })
            );
          } else if (page) {
            dispatch(
              setPageSort({
                page: page as Parameters<typeof setPageSort>[0]['page'],
                sort: {
                  sortColumn: undefined,
                  sortType: 'asc',
                },
              })
            );
          }

          setSortColumn(undefined);
          setSortType('asc');
          setSortedCount(0);
        }
      } else {
        setSortedCount(0);
      }
    }
  };

  const handleSelectMouseDown = useCallback(
    (e: React.MouseEvent, rowData: RowDataType) => {
      if (!disableRowClick) {
        dispatch(setContextMenu({ show: false }));
        // If ctrl or shift is used, we want to ignore this drag selection handler and use the ones
        // provided in handleRowClick
        if (e.button === 0 && !e.ctrlKey && !e.shiftKey) {
          dispatch(
            toggleSelectedSingle(rowData as unknown as Parameters<typeof toggleSelectedSingle>[0])
          );
        }
      }
    },
    [disableRowClick, dispatch]
  );

  const handleSelectMouseUp = useCallback(() => {
    dispatch(setIsDragging(false));
    dispatch(setIsSelectDragging(false));
    document.body.style.cursor = 'default';
  }, [dispatch]);

  const handleStartSelectDrag = useLongPress(
    (event: TouchEvent | MouseEvent) => {
      // useLongPress.onMouseDown is typed as (e: any) => void; we pass { e, rowData }
      // via handleStartSelectDrag.onMouseDown({ e, rowData }) so the event is the custom shape.
      const { e, rowData } = event as unknown as {
        e: React.MouseEvent;
        rowData: RowDataType;
      };
      // Only allow left click
      if (e.button === 0) {
        dispatch(setSelectedSingle(rowData as unknown as Parameters<typeof setSelectedSingle>[0]));
        dispatch(setIsSelectDragging(true));
        document.body.style.cursor = 'crosshair';
      }
    },
    { isPreventDefault: true, delay: 150 }
  );

  const handleContinueSelectDrag = useMemo(
    () =>
      _.debounce((rowData: RowDataType) => {
        if (multiSelect.isSelectDragging) {
          dispatch(
            setSelected(
              sliceRangeByUniqueId(
                (sortColumn && !nowPlaying ? sortedData : data) as { uniqueId?: string }[],
                multiSelect.lastSelected.uniqueId,
                rowData.uniqueId as string
              ) as unknown as Parameters<typeof setSelected>[0]
            )
          );
        }
      }, 200),
    [
      data,
      dispatch,
      multiSelect.isSelectDragging,
      multiSelect.lastSelected.uniqueId,
      nowPlaying,
      sortColumn,
      sortedData,
    ]
  );

  useEffect(() => {
    if (!nowPlaying) {
      if (page) {
        setSortColumn(configState.sort[page as keyof ConfigPage['sort']]?.sortColumn);
        setSortType(configState.sort[page as keyof ConfigPage['sort']]?.sortType);
      }

      if (sortColumn && sortType) {
        // Since the column title(id) won't always match the actual column dataKey, we need to match it
        const actualSortColumn = columns.find((c) => c.id === sortColumn);
        if (actualSortColumn) {
          const sortColumnDataKey =
            actualSortColumn.dataKey === 'combinedtitle'
              ? 'title'
              : actualSortColumn.dataKey === 'artist'
                ? 'albumArtist'
                : actualSortColumn.dataKey === 'genre'
                  ? 'albumGenre'
                  : actualSortColumn.dataKey;

          const sortData = _.orderBy(
            data,
            [
              (entry: RowDataType) => {
                return typeof entry[sortColumnDataKey] === 'string'
                  ? (entry[sortColumnDataKey] as string).toLowerCase() || ''
                  : +(entry[sortColumnDataKey] as number) || '';
              },
            ],
            sortType
          );
          setSortedData(sortData);
        } else {
          setSortedData(data);
        }
      }
    }
  }, [columns, configState.sort, data, nowPlaying, page, sortColumn, sortType]);

  useEffect(() => {
    if (nowPlaying) {
      if (playQueue.sortColumn && playQueue.sortType) {
        const actualSortColumn = columns.find((c) => c.id === playQueue.sortColumn);
        if (actualSortColumn) {
          const sortColumnDataKey =
            actualSortColumn?.dataKey === 'combinedtitle'
              ? 'title'
              : actualSortColumn?.dataKey === 'artist'
                ? 'albumArtist'
                : actualSortColumn?.dataKey === 'genre'
                  ? 'albumGenre'
                  : actualSortColumn?.dataKey;

          dispatch(
            sortPlayQueue({
              columnDataKey: sortColumnDataKey,
              sortType: playQueue.sortType,
            })
          );
        } else {
          // Clear the sortedEntry[]
          dispatch(
            sortPlayQueue({
              columnDataKey: '',
              sortType: playQueue.sortType,
            })
          );
        }
        if (playQueue.currentPlayer === 1 && !playQueue.isFading) {
          dispatch(fixPlayer2Index());
        }
      }
    } else if (playlist) {
      if (sortColumn && sortType) {
        const actualSortColumn = columns.find((c) => c.id === sortColumn);
        if (!actualSortColumn) return;
        const sortColumnDataKey =
          actualSortColumn.dataKey === 'combinedtitle'
            ? 'title'
            : actualSortColumn.dataKey === 'artist'
              ? 'albumArtist'
              : actualSortColumn.dataKey === 'genre'
                ? 'albumGenre'
                : actualSortColumn.dataKey;

        dispatch(
          sortPlaylist({
            columnDataKey: sortColumnDataKey,
            sortType,
          })
        );
      } else {
        dispatch(
          sortPlaylist({
            columnDataKey: '',
            sortType: sortType ?? 'asc',
          })
        );
      }
    }
  }, [
    columns,
    dispatch,
    nowPlaying,
    playQueue.currentPlayer,
    playQueue.isFading,
    playQueue.sortColumn,
    playQueue.sortType,
    playlist,
    sortColumn,
    sortType,
  ]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mouseYRef.current = e.clientY;
    };
    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, []);

  useEffect(() => {
    currentDragDataRef.current = sortColumn && !nowPlaying ? sortedData : data;
  }, [sortColumn, nowPlaying, sortedData, data]);

  useEffect(() => {
    if (!dnd) return undefined;

    if (multiSelect.isDragging && isDragOriginRef.current) {
      const ZONE = 60;
      const SPEED = 8;

      const tick = () => {
        if (!tableContainerRef.current || !tableRef?.current) return;
        const rect = tableContainerRef.current.getBoundingClientRect();
        const y = mouseYRef.current;
        const currentY = Math.abs(tableRef.current.scrollY ?? 0);
        const maxScrollY = Math.max(
          0,
          (currentDragDataRef.current?.length ?? 0) * rowHeight - (height ?? 0) + 40
        );

        if (y > rect.top && y < rect.top + ZONE) {
          tableRef.current.scrollTop(Math.max(0, currentY - SPEED));
        } else if (y > rect.bottom - ZONE && y < rect.bottom && currentY < maxScrollY) {
          tableRef.current.scrollTop(currentY + SPEED);
        }

        dragScrollRafRef.current = requestAnimationFrame(tick);
      };

      dragScrollRafRef.current = requestAnimationFrame(tick);

      const onDocumentMouseUp = (e: MouseEvent) => {
        isDragOriginRef.current = false;
        document.body.style.cursor = 'default';
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const droppedInTable = tableContainerRef.current?.contains(dropTarget);
        const droppedInHeader =
          (dropTarget as Element)?.closest('.rs-table-header-row-wrapper') != null ||
          (dropTarget as Element)?.closest('.rs-table-affix-header') != null;
        if (droppedInTable && !droppedInHeader) {
          handleDragEnd?.(currentDragDataRef.current ?? []);
          if (nowPlaying && playQueue.currentPlayer === 1) {
            dispatch(fixPlayer2Index());
          }
        } else {
          dispatch(setIsDragging(false));
        }
      };

      document.addEventListener('mouseup', onDocumentMouseUp);

      return () => {
        document.removeEventListener('mouseup', onDocumentMouseUp);
        setIsOverDropZone(false);
        if (dragScrollRafRef.current !== null) {
          cancelAnimationFrame(dragScrollRafRef.current);
          dragScrollRafRef.current = null;
        }
      };
    }

    return () => {
      if (dragScrollRafRef.current !== null) {
        cancelAnimationFrame(dragScrollRafRef.current);
        dragScrollRafRef.current = null;
      }
    };
  }, [
    multiSelect.isDragging,
    dnd,
    tableRef,
    handleDragEnd,
    nowPlaying,
    dispatch,
    height,
    rowHeight,
    playQueue.currentPlayer,
  ]);

  return (
    <>
      <div ref={tableContainerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <StyledTable
          draggable="false"
          rowClassName={(rowData: RowDataType) => {
            const currentData = sortColumn && !nowPlaying ? sortedData : data;
            const isLastRow =
              dnd &&
              isOverDropZone &&
              rowData?.uniqueId === currentData[currentData.length - 1]?.uniqueId;
            return `${
              multiSelect?.selected.find((e) => e?.uniqueId === rowData?.uniqueId) ? 'selected' : ''
            } ${
              multiSelect?.currentMouseOverId === rowData?.uniqueId &&
              multiSelect?.isDragging &&
              multiSelect.currentMouseOverId
                ? 'dragover'
                : ''
            } ${rowData?.isDir ? 'isdir' : ''} ${
              (nowPlaying &&
                rowData?.uniqueId === playQueue.current?.uniqueId &&
                playQueue?.current) ||
              (!nowPlaying && rowData?.id === playQueue?.currentSongId && playQueue?.currentSongId)
                ? 'playing'
                : ''
            } ${isLastRow ? 'drop-after-last' : ''}`;
          }}
          loading={loading}
          ref={tableRef}
          height={height}
          data={sortColumn && !nowPlaying ? sortedData : data}
          virtualized={virtualized}
          rowHeight={rowHeight}
          hover={multiSelect.isDragging ? false : misc.highlightOnRowHover}
          cellBordered={false}
          bordered={false}
          affixHeader={affixHeader || true}
          autoHeight={autoHeight}
          affixHorizontalScrollbar
          shouldUpdateScroll={false}
          style={{ fontSize: `${fontSize}px` }}
          sortColumn={nowPlaying ? playQueue.sortColumn : sortColumn}
          sortType={nowPlaying ? playQueue.sortType : sortType}
          onSortColumn={handleSortColumn}
          onRowClick={(rowData: RowDataType, e: React.MouseEvent) => {
            if (!disableRowClick) {
              handleRowClick(
                e as unknown as MouseEvent,
                { ...rowData },
                sortColumn && !nowPlaying ? sortedData : data
              );
            }
          }}
          onScroll={(_scrollX: number, offset: number) => {
            if (onScroll) {
              onScroll(offset);
            }
          }}
          onRowContextMenu={(rowData: RowDataType, e: React.MouseEvent) => {
            e.preventDefault();

            if (!disableContextMenu) {
              let pageX;
              let pageY;
              // Use ContextMenu width from the component
              if (e.pageX + 190 >= window.innerWidth) {
                pageX = e.pageX - 190;
              } else {
                pageX = e.pageX;
              }

              // Use the calculated ContextMenu height
              // numOfButtons * 30 + props.numOfDividers * 1.5
              const contextMenuHeight = 12 * 30 + 3 * 1.5;
              if (e.pageY + contextMenuHeight >= window.innerHeight) {
                pageY = e.pageY - contextMenuHeight;
              } else {
                pageY = e.pageY;
              }

              if (
                (misc.contextMenu.show === false ||
                  (misc.contextMenu.details as { uniqueId?: string } | undefined)?.uniqueId !==
                    rowData.uniqueId) &&
                multiSelect.selected.filter((entry) => entry.uniqueId === rowData.uniqueId).length >
                  0
              ) {
                // Handle when right clicking a selected row
                dispatch(
                  setContextMenu({
                    show: true,
                    xPos: pageX,
                    yPos: pageY,
                    type: nowPlaying ? 'nowPlaying' : rowData.type,
                    details: rowData,
                    disabledOptions: disabledContextMenuOptions ?? [],
                  })
                );
              } else {
                // Handle when right clicking a non-selected row
                dispatch(
                  setSelectedSingle(rowData as unknown as Parameters<typeof setSelectedSingle>[0])
                );
                dispatch(
                  setContextMenu({
                    show: true,
                    xPos: pageX,
                    yPos: pageY,
                    type: nowPlaying ? 'nowPlaying' : rowData.type,
                    details: rowData,
                    disabledOptions: disabledContextMenuOptions ?? [],
                  })
                );
              }
            }
          }}
        >
          {columns.map((column) => (
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - rsuite Table.Column children typing mismatch with React 19
            <Table.Column
              key={column.dataKey}
              align={column.alignment}
              flexGrow={column.flexGrow}
              resizable={column.resizable}
              width={column.width}
              fixed={column.fixed}
              verticalAlign="middle"
              sortable
              onResize={(newWidth: number | undefined) => {
                const resizedColumnIndex = columns.findIndex((c) => c.dataKey === column.dataKey);

                if (!miniView) {
                  settings.set(`${listType}ListColumns[${resizedColumnIndex}].width`, newWidth);
                } else {
                  settings.set(`miniListColumns[${resizedColumnIndex}].width`, newWidth);
                }

                const newCols = configState.lookAndFeel.listView[
                  (miniView ? 'mini' : listType) as keyof typeof configState.lookAndFeel.listView
                ].columns.map((c) => {
                  if (c.dataKey === column.dataKey) {
                    const { width, ...props } = c;
                    return { width: newWidth, ...props };
                  }

                  return { ...c };
                });
                dispatch(
                  setColumnList({
                    listType: (miniView ? 'mini' : listType) as ColumnList,
                    entries: newCols,
                  })
                );
              }}
            >
              <StyledTableHeaderCell>{column.id}</StyledTableHeaderCell>

              {column.dataKey === 'index' ? (
                <Table.Cell dataKey={column.id}>
                  {(rowData: RowDataType, rowIndex = 0) => {
                    return (
                      <TableCellWrapper
                        style={{
                          cursor: multiSelect.isDragging ? 'grabbing' : dnd ? 'grab' : undefined,
                        }}
                        $height={rowHeight}
                        $alignment={column.alignment}
                        onClick={(e: React.MouseEvent) => {
                          if (!dnd) {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }
                        }}
                        onDoubleClick={() => {
                          if (!dnd) {
                            handleRowDoubleClick({
                              ...rowData,
                              rowIndex,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                            });
                          }
                        }}
                        onMouseEnter={() => handleContinueSelectDrag(rowData)}
                        onMouseOver={() => {
                          if (multiSelect.isDragging && dnd) {
                            dispatch(
                              setCurrentMouseOverId({
                                uniqueId: rowData.uniqueId,
                                index: rowIndex,
                              })
                            );
                          }
                        }}
                        onMouseLeave={() => {
                          if ((multiSelect.currentMouseOverId || multiSelect.isDragging) && dnd) {
                            dispatch(
                              setCurrentMouseOverId({
                                uniqueId: undefined,
                                index: undefined,
                              })
                            );
                          }
                        }}
                        onMouseDown={(e: React.MouseEvent) => {
                          if (dnd) {
                            document.body.style.cursor = 'grabbing';

                            if (e.button === 0) {
                              const isSelected = multiSelect.selected.find(
                                (item) => item.uniqueId === rowData.uniqueId
                              );

                              // Handle cases where we want to quickly drag/drop single rows
                              if (multiSelect.selected.length <= 1 || !isSelected) {
                                dispatch(
                                  setSelectedSingle(
                                    rowData as unknown as Parameters<typeof setSelectedSingle>[0]
                                  )
                                );
                                dispatch(
                                  setCurrentMouseOverId({
                                    uniqueId: rowData.uniqueId,
                                    index: rowIndex,
                                  })
                                );
                                isDragOriginRef.current = true;
                                dispatch(setIsDragging(true));
                              }

                              // Otherwise use regular multi-drag behavior
                              if (isSelected) {
                                dispatch(
                                  setCurrentMouseOverId({
                                    uniqueId: rowData.uniqueId,
                                    index: rowIndex,
                                  })
                                );
                                isDragOriginRef.current = true;
                                dispatch(setIsDragging(true));
                              }
                            }
                          } else {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }
                        }}
                        onMouseUp={() => {
                          if (!dnd) {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }
                        }}
                      >
                        {rowData.isDir ? (
                          <FolderOpenIcon
                            style={{ color: 'var(--rs-color-yellow)', fontSize: '1.20em' }}
                          />
                        ) : dnd ? (
                          <DragHandleCell $isDragging={multiSelect.isDragging}>
                            <span className="row-index">{rowIndex + 1}</span>
                            <span className="drag-icon">
                              <BarsIcon />
                            </span>
                          </DragHandleCell>
                        ) : (
                          rowIndex + 1
                        )}
                        {rowData['-empty']}
                      </TableCellWrapper>
                    );
                  }}
                </Table.Cell>
              ) : column.dataKey === 'combinedtitle' ? (
                <Table.Cell dataKey={column.id}>
                  {(rowData: RowDataType, rowIndex = 0) => {
                    return (
                      <CombinedTitleContainer
                        $height={rowHeight}
                        onClick={(e: React.MouseEvent) =>
                          handleRowClick(
                            e as unknown as MouseEvent,
                            {
                              ...rowData,
                              rowIndex,
                            },
                            sortColumn && !nowPlaying ? sortedData : data
                          )
                        }
                        onDoubleClick={() =>
                          handleRowDoubleClick({
                            ...rowData,
                            rowIndex,
                            tableData: sortColumn && !nowPlaying ? sortedData : data,
                          })
                        }
                        onMouseDown={(e: React.MouseEvent) => {
                          handleStartSelectDrag.onMouseDown({ e, rowData });
                          handleSelectMouseDown(e, rowData);
                        }}
                        onMouseEnter={() => handleContinueSelectDrag(rowData)}
                        onMouseUp={() => {
                          handleSelectMouseUp();
                          handleStartSelectDrag.onMouseUp();
                        }}
                      >
                        <div className="row-main">
                          <div className="col-cover">
                            <CachedCoverArt
                              fileName={`${cacheImages.cacheType}_${
                                rowData[cacheImages.cacheIdProperty as string]
                              }.jpg`}
                              fallbackSrc={rowData.image}
                              cachePath={misc.imageCachePath}
                              size={rowHeight - 10}
                              cacheEnabled={cacheImages.enabled}
                            />
                          </div>
                          <div className="col-text">
                            <CombinedTitleTextWrapper
                              tabIndex={0}
                              onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === ' ' || e.key === 'Enter') {
                                  e.preventDefault();
                                  if (nowPlaying) {
                                    dispatch(clearSelected());
                                    dispatch(
                                      setPlayerIndex(
                                        rowData as unknown as Parameters<typeof setPlayerIndex>[0]
                                      )
                                    );
                                    dispatch(fixPlayer2Index());
                                    dispatch(setStatus('PLAYING'));
                                  }
                                }
                              }}
                            >
                              {rowData.title || rowData.name}
                            </CombinedTitleTextWrapper>
                            <div className="row-sub-secondarytext">
                              {rowData.artist?.map((artist: GenericItem, i: number) => (
                                <SecondaryTextWrapper
                                  $subtitle="true"
                                  key={`${rowData.uniqueId}-${artist.id}`}
                                  style={{
                                    fontFamily: configState.lookAndFeel.font,
                                    fontSize: `${fontSize}px`,
                                  }}
                                >
                                  {i > 0 && ', '}
                                  <CustomTooltip text={artist.title}>
                                    <TableLinkButton
                                      $font={`${fontSize}px`}
                                      $subtitle="true"
                                      onClick={(e: React.MouseEvent) => {
                                        if (!e.ctrlKey && !e.shiftKey) {
                                          if (artist.id && !isModal) {
                                            navigate(`/library/artist/${artist.id}`);
                                          } else if (artist.id && isModal) {
                                            dispatch(
                                              addModalPage({
                                                pageType: 'artist',
                                                id: artist.id,
                                              })
                                            );
                                          }
                                        }
                                      }}
                                    >
                                      {artist.title}
                                    </TableLinkButton>
                                  </CustomTooltip>
                                </SecondaryTextWrapper>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CombinedTitleContainer>
                    );
                  }}
                </Table.Cell>
              ) : (
                <Table.Cell dataKey={column.id}>
                  {(rowData: RowDataType, rowIndex = 0) => {
                    // Playback filter columns -------------------------------------------------------
                    if (column.dataKey === 'filter') {
                      return <div style={{ userSelect: 'text' }}>{rowData.filter}</div>;
                    }

                    if (column.dataKey === 'filterDelete') {
                      return (
                        <>
                          <StyledIconButton
                            appearance="subtle"
                            icon={<Trash2Icon />}
                            onClick={() => {
                              dispatch(removePlaybackFilter({ filterName: rowData.filter }));
                            }}
                          />
                        </>
                      );
                    }

                    if (column.dataKey === 'filterEnabled') {
                      return (
                        <>
                          <StyledCheckbox
                            defaultChecked={
                              configState.playback.filters.find((f) => f.filter === rowData.filter)
                                ?.enabled === true
                            }
                            checked={
                              configState.playback.filters.find((f) => f.filter === rowData.filter)
                                ?.enabled === true
                            }
                            onChange={(_v: unknown, e: boolean) => {
                              dispatch(
                                setPlaybackFilter({
                                  filterName: rowData.filter as string,
                                  newFilter: {
                                    ...(configState.playback.filters.find(
                                      (f) => f.filter === rowData.filter
                                    ) as { filter: string; enabled: boolean }),
                                    enabled: e,
                                  },
                                })
                              );
                            }}
                          />
                        </>
                      );
                    }
                    // -------------------------------------------------------------------------------

                    // List-view column selector columns
                    if (column.dataKey === 'columnResizable' && config) {
                      return (
                        <>
                          <StyledCheckbox
                            defaultChecked={
                              configState.lookAndFeel.listView[
                                config.option as keyof typeof configState.lookAndFeel.listView
                              ].columns[
                                configState.lookAndFeel.listView[
                                  config.option as keyof typeof configState.lookAndFeel.listView
                                ].columns.findIndex((col) => col.dataKey === rowData.dataKey)
                              ]?.resizable === true
                            }
                            checked={
                              configState.lookAndFeel.listView[
                                config.option as keyof typeof configState.lookAndFeel.listView
                              ].columns[
                                configState.lookAndFeel.listView[
                                  config.option as keyof typeof configState.lookAndFeel.listView
                                ].columns.findIndex((col) => col.dataKey === rowData.dataKey)
                              ]?.resizable === true
                            }
                            onChange={(_v: unknown, e: boolean) => {
                              const cols = configState.lookAndFeel.listView[
                                config.option as keyof typeof configState.lookAndFeel.listView
                              ].columns.map((col) => {
                                if (rowData.dataKey === col.dataKey) {
                                  if (e === true) {
                                    const { flexGrow, ...newCols } = col;
                                    // rsuite 6: resizable columns require an explicit width.
                                    // col.width may be undefined if resizable was toggled off
                                    // previously (disable strips width). Fall back to the
                                    // original column definition's width from the column list.
                                    const colPickerIdx = config.columnList.findIndex(
                                      (picker) => picker.value.dataKey === rowData.dataKey
                                    );
                                    const defaultWidth =
                                      config.columnList[colPickerIdx]?.value.width || 100;
                                    return {
                                      ...newCols,
                                      resizable: e,
                                      width: col.width || defaultWidth,
                                    };
                                  }
                                  const columnPickerMatch = config.columnList.findIndex(
                                    (picker) => picker.value.dataKey === rowData.dataKey
                                  );
                                  const matchedFlexGrowValue =
                                    config.columnList[columnPickerMatch]?.value.flexGrow || 1;

                                  const { width, rowIndex: r, ...newCols } = col;

                                  return {
                                    ...newCols,
                                    flexGrow: matchedFlexGrowValue,
                                    resizable: e,
                                  };
                                }

                                return { ...col };
                              });

                              dispatch(setColumnList({ listType: config.option, entries: cols }));
                            }}
                          />
                        </>
                      );
                    }
                    // -------------------------------------------------------------------------------

                    // Misc --------------------------------------------------------------------------
                    if (column.dataKey === 'custom') {
                      return (
                        <div>{(column as ColumnEntry & { custom?: React.ReactNode }).custom}</div>
                      );
                    }
                    // -------------------------------------------------------------------------------

                    // List-view columns -------------------------------------------------------------
                    if (column.dataKey === 'coverart') {
                      return (
                        <CoverArtCell
                          rowData={rowData}
                          rowIndex={rowIndex}
                          column={column}
                          misc={misc}
                          rowHeight={rowHeight}
                          cacheImages={cacheImages}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                        />
                      );
                    }

                    if (column.dataKey === 'album') {
                      return (
                        <LinkCell
                          linkProp="album"
                          onClickLink={(e: React.MouseEvent) => {
                            if (!e.ctrlKey && !e.shiftKey) {
                              if (rowData.albumId && !isModal) {
                                navigate(`/library/album/${rowData.albumId}`);
                              } else if (rowData[0]?.id && isModal) {
                                dispatch(
                                  addModalPage({
                                    pageType: 'album',
                                    id: rowData[0]?.id,
                                  })
                                );
                              }
                            }
                          }}
                          rowData={rowData}
                          column={column}
                          misc={misc}
                          rowHeight={rowHeight}
                          cacheImages={cacheImages}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                          fontSize={fontSize}
                        />
                      );
                    }

                    if (column.dataKey === 'artist') {
                      return (
                        <LinkCell
                          linkProp="albumArtist"
                          onClickLink={(e: React.MouseEvent) => {
                            if (!e.ctrlKey && !e.shiftKey) {
                              if (rowData.albumArtistId && !isModal) {
                                navigate(`/library/artist/${rowData.albumArtistId}`);
                              } else if (rowData[0]?.id && isModal) {
                                dispatch(
                                  addModalPage({
                                    pageType: 'artist',
                                    id: rowData[0]?.id,
                                  })
                                );
                              }
                            }
                          }}
                          rowData={rowData}
                          column={column}
                          misc={misc}
                          rowHeight={rowHeight}
                          cacheImages={cacheImages}
                          handleRowClick={handleRowClick}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                          fontSize={fontSize}
                        />
                      );
                    }

                    if (column.dataKey === 'bitRate') {
                      return (
                        <CustomCell
                          rowData={rowData}
                          rowIndex={rowIndex}
                          column={column}
                          rowHeight={rowHeight}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                        >
                          {rowData[column.dataKey]} kbps
                        </CustomCell>
                      );
                    }

                    if (column.dataKey === 'changed' || column.dataKey === 'created') {
                      return (
                        <CustomCell
                          rowData={rowData}
                          rowIndex={rowIndex}
                          column={column}
                          rowHeight={rowHeight}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                        >
                          {formatDate(rowData[column.dataKey])}
                        </CustomCell>
                      );
                    }

                    if (column.dataKey === 'duration') {
                      return (
                        <CustomCell
                          rowData={rowData}
                          rowIndex={rowIndex}
                          column={column}
                          rowHeight={rowHeight}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                        >
                          {formatSongDuration(rowData.duration)}
                        </CustomCell>
                      );
                    }

                    if (column.dataKey === 'genre') {
                      return (
                        <LinkCell
                          linkProp="genre"
                          onClickLink={(e: React.MouseEvent, index: number) => {
                            if (!e.ctrlKey && !e.shiftKey) {
                              dispatch(
                                setFilter({
                                  listType: Item.Album,
                                  data: rowData.genre[index].title,
                                })
                              );
                              dispatch(
                                setPagination({
                                  listType: Item.Album,
                                  data: { activePage: 1 },
                                })
                              );

                              localStorage.setItem('scroll_list_albumList', '0');
                              localStorage.setItem('scroll_grid_albumList', '0');
                              setTimeout(() => {
                                navigate(`/library/album?sortType=${rowData.genre[index].title}`);
                              }, 50);
                            }
                          }}
                          rowData={rowData}
                          column={column}
                          misc={misc}
                          rowHeight={rowHeight}
                          cacheImages={cacheImages}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                          fontSize={fontSize}
                        />
                      );
                    }

                    if (column.dataKey === 'size') {
                      return (
                        <CustomCell
                          rowData={rowData}
                          rowIndex={rowIndex}
                          column={column}
                          rowHeight={rowHeight}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                        >
                          {convertByteToMegabyte(rowData[column.dataKey])} MB
                        </CustomCell>
                      );
                    }

                    if (column.dataKey === 'starred') {
                      return (
                        <CustomCell
                          rowData={rowData}
                          rowIndex={rowIndex}
                          column={column}
                          rowHeight={rowHeight}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                        >
                          {rowData.isDir ? (
                            <span>&#8203;</span>
                          ) : (
                            <StyledIconToggle
                              tabIndex={0}
                              data-testid={`star-${rowData?.title ?? ''}`}
                              $active={rowData?.starred ? 'true' : 'false'}
                              onClick={() => handleFavorite(rowData)}
                            >
                              {rowData?.starred ? <HeartIcon /> : <HeartOIcon />}
                            </StyledIconToggle>
                          )}
                        </CustomCell>
                      );
                    }

                    if (column.dataKey === 'userRating') {
                      return (
                        <CustomCell
                          rowData={rowData}
                          rowIndex={rowIndex}
                          column={column}
                          rowHeight={rowHeight}
                          handleRowClick={(e: React.MouseEvent) => {
                            handleRowClick(
                              e as unknown as MouseEvent,
                              {
                                ...rowData,
                                rowIndex,
                              },
                              sortColumn && !nowPlaying ? sortedData : data
                            );
                          }}
                          handleRowDoubleClick={() => {
                            handleRowDoubleClick({
                              ...rowData,
                              tableData: sortColumn && !nowPlaying ? sortedData : data,
                              rowIndex,
                            });
                          }}
                          onMouseDown={(e: React.MouseEvent) => {
                            handleStartSelectDrag.onMouseDown({ e, rowData });
                            handleSelectMouseDown(e, rowData);
                          }}
                          onMouseEnter={() => handleContinueSelectDrag(rowData)}
                          onMouseUp={() => {
                            handleSelectMouseUp();
                            handleStartSelectDrag.onMouseUp();
                          }}
                        >
                          <StyledRate
                            size="xs"
                            readOnly={false}
                            value={rowData.userRating ? rowData.userRating : 0}
                            defaultValue={rowData?.userRating ? rowData.userRating : 0}
                            onChange={(value: number) => handleRating(rowData, value)}
                          />
                        </CustomCell>
                      );
                    }

                    return (
                      <TextCell
                        rowData={rowData}
                        rowIndex={rowIndex}
                        column={column}
                        rowHeight={rowHeight}
                        style={column.dataKey === 'title' ? { paddingLeft: 10 } : undefined}
                        handleRowClick={(e: React.MouseEvent) => {
                          handleRowClick(
                            e as unknown as MouseEvent,
                            {
                              ...rowData,
                              rowIndex,
                            },
                            sortColumn && !nowPlaying ? sortedData : data
                          );
                        }}
                        handleRowDoubleClick={() => {
                          handleRowDoubleClick({
                            ...rowData,
                            rowIndex,
                            tableData: sortColumn && !nowPlaying ? sortedData : data,
                          });
                        }}
                        onMouseDown={(e: React.MouseEvent) => {
                          handleStartSelectDrag.onMouseDown({ e, rowData });
                          handleSelectMouseDown(e, rowData);
                        }}
                        onMouseEnter={() => handleContinueSelectDrag(rowData)}
                        onMouseUp={() => {
                          handleSelectMouseUp();
                          handleStartSelectDrag.onMouseUp();
                        }}
                      />
                    );
                    // -------------------------------------------------------------------------------
                  }}
                </Table.Cell>
              )}
            </Table.Column>
          ))}
        </StyledTable>
        {dnd &&
          multiSelect.isDragging &&
          (() => {
            const currentData = sortColumn && !nowPlaying ? sortedData : data;
            const contentBottom = 40 + (currentData?.length ?? 0) * rowHeight;
            const containerHeight = tableContainerRef.current?.clientHeight ?? 0;
            const style =
              contentBottom < containerHeight
                ? { top: contentBottom, bottom: 0 }
                : { height: 20, bottom: 0 };
            return (
              <DropZone
                style={style}
                onMouseEnter={() => {
                  dispatch(setCurrentMouseOverId({ uniqueId: undefined, index: undefined }));
                  setIsOverDropZone(true);
                }}
                onMouseLeave={() => setIsOverDropZone(false)}
              />
            );
          })()}
      </div>
      {paginationProps && paginationProps?.recordsPerPage !== 0 && (
        <Paginator {...paginationProps} />
      )}
    </>
  );
};

export default ListViewTable;
