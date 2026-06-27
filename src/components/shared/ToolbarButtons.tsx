import React from 'react';
import AngleDownIcon from '@rsuite/icons/legacy/AngleDown';
import HeartIcon from '@rsuite/icons/legacy/Heart';
import HeartOIcon from '@rsuite/icons/legacy/HeartO';
import AngleUpIcon from '@rsuite/icons/legacy/AngleUp';
import CloseIcon from '@rsuite/icons/legacy/Close';
import DownloadIcon from '@rsuite/icons/legacy/Download';
import Edit2Icon from '@rsuite/icons/legacy/Edit2';
import FilterIcon from '@rsuite/icons/legacy/Filter';
import PlayIcon from '@rsuite/icons/legacy/Play';
import PlusIcon from '@rsuite/icons/legacy/Plus';
import PlusCircleIcon from '@rsuite/icons/legacy/PlusCircle';
import PlusSquareIcon from '@rsuite/icons/legacy/PlusSquare';
import RandomIcon from '@rsuite/icons/legacy/Random';
import RefreshIcon from '@rsuite/icons/legacy/Refresh';
import SaveIcon from '@rsuite/icons/legacy/Save';
import TrashIcon from '@rsuite/icons/legacy/Trash';
import Trash2Icon from '@rsuite/icons/legacy/Trash2';
import UndoIcon from '@rsuite/icons/legacy/Undo';
import i18n from '../../i18n/i18n';
import CustomTooltip from './CustomTooltip';
import { StyledButton, StyledIconButton } from './styled';

type IconButtonWrapperProps = React.ComponentProps<typeof StyledIconButton> & { text?: string };
// Omit transient styled-components props ($circle, $width) that are not passed by callers
type ButtonWrapperProps = Omit<React.ComponentProps<typeof StyledButton>, '$circle' | '$width'>;

export const PlayButton = ({ text, ...rest }: IconButtonWrapperProps) => {
  return (
    <CustomTooltip text={text || i18n.t('Play')}>
      <StyledIconButton
        icon={<PlayIcon />}
        aria-label={text || i18n.t('Play')}
        circle
        {...rest}
        tabIndex={0}
      />
    </CustomTooltip>
  );
};

export const PlayAppendButton = ({ text, ...rest }: IconButtonWrapperProps) => {
  return (
    <CustomTooltip text={text || i18n.t('Add to queue (later)')}>
      <StyledIconButton
        icon={<PlusIcon />}
        aria-label={text || i18n.t('Add to queue (later)')}
        circle
        {...rest}
        tabIndex={0}
      />
    </CustomTooltip>
  );
};

export const PlayAppendNextButton = ({ text, ...rest }: IconButtonWrapperProps) => {
  return (
    <CustomTooltip text={text || i18n.t('Add to queue (next)')}>
      <StyledIconButton
        icon={<PlusCircleIcon />}
        aria-label={text || i18n.t('Add to queue (next)')}
        circle
        {...rest}
        tabIndex={0}
      />
    </CustomTooltip>
  );
};

export const PlayShuffleAppendButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Add shuffled to queue')} onClick={rest.onClick}>
      <StyledIconButton
        icon={<PlusSquareIcon />}
        aria-label={i18n.t('Add shuffled to queue')}
        circle
        {...rest}
        tabIndex={0}
      />
    </CustomTooltip>
  );
};

export const SaveButton = ({ text, ...rest }: ButtonWrapperProps & { text?: string }) => {
  return (
    <CustomTooltip text={text || i18n.t('Save')}>
      <StyledButton aria-label={text || i18n.t('Save')} {...rest} tabIndex={0}>
        <SaveIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const EditButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Edit')}>
      <StyledButton aria-label={i18n.t('Edit')} {...rest} tabIndex={0}>
        <Edit2Icon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const UndoButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Reset')}>
      <StyledButton aria-label={i18n.t('Reset')} {...rest} tabIndex={0}>
        <UndoIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const DeleteButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Delete')}>
      <StyledButton aria-label={i18n.t('Delete')} {...rest} tabIndex={0}>
        <TrashIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const FavoriteButton = ({
  isFavorite,
  ...rest
}: ButtonWrapperProps & { isFavorite?: unknown }) => {
  return (
    <CustomTooltip text={i18n.t('Toggle favorite')}>
      <StyledButton
        aria-label={isFavorite ? i18n.t('Remove from favorites') : i18n.t('Add to favorites')}
        tabIndex={0}
        {...rest}
      >
        {isFavorite ? <HeartIcon /> : <HeartOIcon />}
      </StyledButton>
    </CustomTooltip>
  );
};

export const DownloadButton = ({
  downloadSize,
  ...rest
}: ButtonWrapperProps & { downloadSize?: string | number }) => {
  return (
    <CustomTooltip
      text={
        downloadSize ? i18n.t('Download ({{downloadSize}})', { downloadSize }) : i18n.t('Download')
      }
    >
      <StyledButton
        aria-label={
          downloadSize
            ? i18n.t('Download ({{downloadSize}})', { downloadSize })
            : i18n.t('Download')
        }
        {...rest}
        tabIndex={0}
      >
        <DownloadIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const ShuffleButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Shuffle queue')}>
      <StyledButton aria-label={i18n.t('Shuffle queue')} tabIndex={0} {...rest}>
        <RandomIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const ClearQueueButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Clear queue')}>
      <StyledButton aria-label={i18n.t('Clear queue')} tabIndex={0} {...rest}>
        <Trash2Icon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const AddPlaylistButton = ({ ...rest }) => {
  return (
    <StyledButton tabIndex={0} {...rest}>
      <PlusSquareIcon style={{ marginRight: '10px' }} />
      {i18n.t('Add playlist')}
    </StyledButton>
  );
};

export const RefreshButton = ({ ...rest }) => {
  return (
    <StyledButton tabIndex={0} {...rest}>
      <RefreshIcon style={{ marginRight: '10px' }} />
      {i18n.t('Refresh')}
    </StyledButton>
  );
};

export const FilterButton = ({ ...rest }) => {
  return (
    <StyledButton tabIndex={0} {...rest}>
      <FilterIcon style={{ marginRight: '10px' }} />
      {i18n.t('Filter')}
    </StyledButton>
  );
};

export const AutoPlaylistButton = ({
  noText,
  ...rest
}: ButtonWrapperProps & { noText?: boolean }) => {
  return (
    <CustomTooltip text={i18n.t('Play Random')}>
      <StyledButton aria-label={i18n.t('Play Random')} tabIndex={0} {...rest}>
        <PlusSquareIcon style={{ marginRight: noText ? '0px' : '10px' }} />
        {!noText && i18n.t('Play Random')}
      </StyledButton>
    </CustomTooltip>
  );
};

export const MoveUpButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Move selected up')}>
      <StyledButton aria-label={i18n.t('Move selected up')} {...rest} tabIndex={0}>
        <AngleUpIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const MoveDownButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Move selected down')}>
      <StyledButton aria-label={i18n.t('Move selected down')} {...rest} tabIndex={0}>
        <AngleDownIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const MoveTopButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Move up')}>
      <StyledButton aria-label={i18n.t('Move up')} {...rest} tabIndex={0}>
        <AngleUpIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const MoveBottomButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Move down')}>
      <StyledButton aria-label={i18n.t('Move down')} {...rest} tabIndex={0}>
        <AngleDownIcon />
      </StyledButton>
    </CustomTooltip>
  );
};

export const RemoveSelectedButton = ({ ...rest }) => {
  return (
    <CustomTooltip text={i18n.t('Remove selected')}>
      <StyledButton aria-label={i18n.t('Remove selected')} {...rest} tabIndex={0}>
        <CloseIcon />
      </StyledButton>
    </CustomTooltip>
  );
};
