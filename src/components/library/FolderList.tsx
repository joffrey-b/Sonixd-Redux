import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ButtonToolbar } from 'rsuite';
import LevelUpIcon from '@rsuite/icons/legacy/LevelUp';
import { useTranslation } from 'react-i18next';
import ListViewType from '../viewtypes/ListViewType';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import GenericPage from '../layout/GenericPage';
import GenericPageHeader from '../layout/GenericPageHeader';
import { StyledButton, StyledInputPicker, StyledInputPickerContainer } from '../shared/styled';
import { fixPlayer2Index, setPlayQueueByRowClick } from '../../redux/playQueueSlice';
import { setStatus } from '../../redux/playerSlice';
import useSearchQuery from '../../hooks/useSearchQuery';
import { setCurrentViewedFolder } from '../../redux/folderSlice';
import useRouterQuery from '../../hooks/useRouterQuery';
import { Server, Song } from '../../types';
import type { RowDataType } from 'rsuite-table';
import { apiController } from '../../api/controller';
import CenterLoader from '../loader/CenterLoader';
import useListClickHandler from '../../hooks/useListClickHandler';
import useFavorite from '../../hooks/useFavorite';
import { useRating } from '../../hooks/useRating';
import { settings } from '../shared/bridge';

const FolderList = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const query = useRouterQuery();
  const queryClient = useQueryClient();
  const folder = useAppSelector((state) => state.folder);
  const config = useAppSelector((state) => state.config);
  const misc = useAppSelector((state) => state.misc);
  const [musicFolder, setMusicFolder] = useState(folder.musicFolder);
  const folderPickerContainerRef = useRef(null);

  const {
    isLoading,
    isError,
    data: indexData,
    error,
  } = useQuery({
    queryKey: ['indexes', musicFolder],
    queryFn: () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getIndexes',
        args: config.serverType === Server.Subsonic ? { musicFolderId: musicFolder } : null,
      }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- folderData has heterogeneous shape (id, title, parent, child) that varies between Subsonic/Jellyfin
  const { isLoading: isLoadingFolderData, data: folderData }: any = useQuery({
    queryKey: ['folder', folder.currentViewedFolder],
    queryFn: () =>
      apiController({
        serverType: config.serverType,
        endpoint: 'getMusicDirectory',
        args: { id: folder.currentViewedFolder },
      }),
    enabled: Boolean(folder.currentViewedFolder),
  });

  const { isLoading: isLoadingMusicFolders, data: musicFolders } = useQuery({
    queryKey: ['musicFolders'],
    queryFn: () => apiController({ serverType: config.serverType, endpoint: 'getMusicFolders' }),
  });

  const filteredData = useSearchQuery(
    misc.searchQuery,
    folderData?.id ? folderData?.child : indexData,
    ['title', 'artist', 'album', 'year', 'genre', 'path']
  );

  useEffect(() => {
    if (query.get('folderId') !== 'null') {
      dispatch(setCurrentViewedFolder(query.get('folderId') || ''));
    }
  }, [dispatch, query]);

  const { handleRowClick, handleRowDoubleClick } = useListClickHandler({
    doubleClick: (rowData: RowDataType) => {
      if (rowData.isDir) {
        navigate(`/library/folder?folderId=${rowData.id}`);
        dispatch(setCurrentViewedFolder(rowData.id));
      } else {
        const selected = folderData?.id ? folderData?.child : indexData?.child;
        dispatch(
          setPlayQueueByRowClick({
            entries: (selected || []).filter((entry: Song) => entry?.isDir === false),
            currentIndex: rowData.rowIndex,
            currentSongId: rowData.id,
            uniqueSongId: rowData.uniqueId,
            filters: config.playback.filters,
          })
        );
        dispatch(setStatus('PLAYING'));
        dispatch(fixPlayer2Index());
      }
    },
  });

  const { handleFavorite } = useFavorite();
  const { handleRating } = useRating();

  return (
    <>
      {(isLoading || isLoadingMusicFolders) && <CenterLoader />}
      {isError && <div>{(error as Error)?.message || 'Failed to load.'}</div>}
      {!isLoading && indexData && (
        <GenericPage
          hideDivider
          header={
            <GenericPageHeader
              title={`${
                folderData?.title
                  ? folderData.title
                  : isLoadingFolderData
                    ? t('Loading...')
                    : t('Select a folder')
              }`}
              showTitleTooltip
              subtitle={
                <>
                  <StyledInputPickerContainer ref={folderPickerContainerRef}>
                    <ButtonToolbar>
                      <StyledInputPicker
                        container={() => folderPickerContainerRef.current}
                        size="sm"
                        width={180}
                        data={musicFolders}
                        defaultValue={musicFolder}
                        valueKey="id"
                        labelKey="title"
                        placeholder={t('Select')}
                        onChange={(e: string) => {
                          setMusicFolder(e);
                        }}
                        disabled={config.serverType === Server.Jellyfin}
                      />

                      <StyledButton
                        data-testid="folder-go-up-button"
                        size="sm"
                        onClick={() => {
                          navigate(
                            `/library/folder?folderId=${
                              folderData?.parent ? folderData.parent : ''
                            }`
                          );
                          dispatch(
                            setCurrentViewedFolder(folderData?.parent ? folderData.parent : '')
                          );
                        }}
                      >
                        <LevelUpIcon style={{ marginRight: '10px' }} />
                        {t('Go up')}
                      </StyledButton>
                    </ButtonToolbar>
                  </StyledInputPickerContainer>
                </>
              }
            />
          }
        >
          <ListViewType
            data={
              misc.searchQuery !== ''
                ? filteredData
                : folder.currentViewedFolder
                  ? folderData?.child
                  : indexData
            }
            loading={isLoadingFolderData}
            tableColumns={settings.get('musicListColumns')}
            rowHeight={Number(settings.get('musicListRowHeight'))}
            fontSize={Number(settings.get('musicListFontSize'))}
            handleRowClick={handleRowClick}
            handleRowDoubleClick={handleRowDoubleClick}
            handleFavorite={(rowData: RowDataType) =>
              handleFavorite(rowData, {
                custom: () => {
                  queryClient.setQueryData(
                    ['folder', folder.currentViewedFolder],
                    (oldData: { child?: { id: string; starred?: number }[] }) => {
                      if (!oldData?.child) return oldData;
                      const newStarred = rowData.starred ? undefined : Date.now();
                      return {
                        ...oldData,
                        child: oldData.child.map((item) =>
                          item.id === rowData.id ? { ...item, starred: newStarred } : item
                        ),
                      };
                    }
                  );
                },
              })
            }
            handleRating={(rowData: RowDataType, rating: number) =>
              handleRating(rowData, { queryKey: ['folder', folder.currentViewedFolder], rating })
            }
            cacheImages={{
              enabled: settings.get('cacheImages'),
              cacheType: 'folder',
              cacheIdProperty: 'id',
            }}
            page="folderListPage"
            listType="music"
            virtualized
            disabledContextMenuOptions={[
              'addToFavorites',
              'removeFromFavorites',
              'viewInModal',
              'moveSelectedTo',
              'removeSelected',
              'deletePlaylist',
              'viewInFolder',
            ]}
          />
        </GenericPage>
      )}
    </>
  );
};

export default FolderList;
