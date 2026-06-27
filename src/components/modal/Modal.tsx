import React from 'react';
import { Modal } from 'rsuite';
import ArrowCircleLeftIcon from '@rsuite/icons/legacy/ArrowCircleLeft';
import styled from 'styled-components';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { decrementModalPage, hideModal, setContextMenu } from '../../redux/miscSlice';
import { StyledIconButton } from '../shared/styled';
import ArtistView from '../library/ArtistView';
import AlbumView from '../library/AlbumView';
import PlaylistView from '../playlist/PlaylistView';

const StyledModal = styled(Modal)<{ width?: string }>`
  color: var(--app-text) !important;
  overflow: hidden !important;

  .rs-modal-dialog {
    width: ${(props) => props.width};
    background: var(--app-bg) !important;
    margin: 0 !important;
  }

  /* RSuite wraps size="full" dialogs in a Fade component with no height, so
     position:absolute + height:100% collapses to zero. Use fixed+100vh instead. */
  &.rs-modal-full .rs-modal-dialog {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    height: 100vh !important;
    width: 100vw !important;
    z-index: var(--rs-zindex-modal) !important;
  }

  .rs-modal-body {
    margin-top: 0px;
    padding-bottom: 0px;
  }
`;

export const PageModal = () => {
  const dispatch = useAppDispatch();
  const misc = useAppSelector((state) => state.misc);

  return (
    <StyledModal
      width="750px"
      open={misc.modal.show}
      onClose={() => dispatch(hideModal())}
      onExit={() => dispatch(hideModal())}
      overflow
      size="full"
    >
      <Modal.Header onClick={() => dispatch(setContextMenu({ show: false }))}>
        <StyledIconButton
          appearance="subtle"
          icon={<ArrowCircleLeftIcon />}
          onClick={() => {
            dispatch(decrementModalPage());
          }}
        />
      </Modal.Header>
      <Modal.Body
        style={{ height: '800px' }}
        onClick={() => dispatch(setContextMenu({ show: false }))}
      >
        {misc.modal.currentPageIndex !== undefined &&
          misc.modalPages[misc.modal.currentPageIndex]?.pageType === 'artist' && (
            <ArtistView id={misc.modalPages[misc.modal.currentPageIndex].id} isModal />
          )}
        {misc.modal.currentPageIndex !== undefined &&
          misc.modalPages[misc.modal.currentPageIndex]?.pageType === 'album' && (
            <AlbumView id={misc.modalPages[misc.modal.currentPageIndex].id} isModal />
          )}
        {misc.modal.currentPageIndex !== undefined &&
          misc.modalPages[misc.modal.currentPageIndex]?.pageType === 'playlist' && (
            <PlaylistView id={misc.modalPages[misc.modal.currentPageIndex].id} isModal />
          )}
      </Modal.Body>
    </StyledModal>
  );
};

interface InfoModalProps {
  show: boolean;
  handleHide: () => void;
  width?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'full';
  children?: React.ReactNode;
}

export const InfoModal = ({ show, handleHide, width, size = 'full', children }: InfoModalProps) => {
  return (
    <StyledModal
      width={width}
      open={show}
      size={size}
      centered
      overflow={false}
      onClose={handleHide}
      onExit={handleHide}
    >
      <Modal.Body>{children}</Modal.Body>
    </StyledModal>
  );
};
