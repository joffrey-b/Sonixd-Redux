import React from 'react';
import { ButtonGroup } from 'rsuite';
import ListIcon from '@rsuite/icons/legacy/List';
import ThLargeIcon from '@rsuite/icons/legacy/ThLarge';
import { useTranslation } from 'react-i18next';
import { StyledButton } from '../shared/styled';
import { settings } from '../shared/bridge';

interface ViewTypeButtonsProps {
  handleListClick: () => void;
  handleGridClick: () => void;
  viewTypeSetting: string;
}

const ViewTypeButtons = ({
  handleListClick,
  handleGridClick,
  viewTypeSetting,
}: ViewTypeButtonsProps) => {
  const { t } = useTranslation();
  return (
    <ButtonGroup>
      <StyledButton
        size="sm"
        appearance="subtle"
        aria-label={t('List view')}
        onClick={async () => {
          handleListClick();
          localStorage.setItem(`${viewTypeSetting}ViewType`, 'list');
          settings.set(`${viewTypeSetting}ViewType`, 'list');
        }}
      >
        <ListIcon />
      </StyledButton>
      <StyledButton
        size="sm"
        appearance="subtle"
        aria-label={t('Grid view')}
        onClick={async () => {
          handleGridClick();
          localStorage.setItem(`${viewTypeSetting}ViewType`, 'grid');
          settings.set(`${viewTypeSetting}ViewType`, 'grid');
        }}
      >
        <ThLargeIcon />
      </StyledButton>
    </ButtonGroup>
  );
};

export default ViewTypeButtons;
