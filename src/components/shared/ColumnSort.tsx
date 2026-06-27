import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FlexboxGrid, RadioGroup } from 'rsuite';
import { FilterHeader } from '../library/AdvancedFilters';
import { StyledButton, StyledInputPickerContainer, StyledInputPicker, StyledRadio } from './styled';

interface ColumnSortProps {
  sortColumns: { label: string; dataKey: string }[];
  sortType?: string;
  sortColumn?: string;
  setSortType?: (v: string) => void;
  setSortColumn?: (v: string) => void;
  clearSortType?: () => void;
  disabledItemValues?: string[];
}

const ColumnSort = ({
  sortColumns,
  sortType,
  sortColumn,
  setSortType,
  setSortColumn,
  clearSortType,
  disabledItemValues,
}: ColumnSortProps) => {
  const { t } = useTranslation();
  const sortFilterPickerContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <FilterHeader>
        <FlexboxGrid justify="space-between">
          <FlexboxGrid.Item>{t('Sort')}</FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <StyledButton
              size="xs"
              appearance={sortColumn ? 'primary' : 'subtle'}
              disabled={!sortColumn}
              onClick={clearSortType}
            >
              {t('Reset')}
            </StyledButton>
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </FilterHeader>

      <RadioGroup inline defaultValue={sortType} onChange={(v) => setSortType?.(String(v))}>
        <StyledRadio value="asc">{t('ASC')}</StyledRadio>
        <StyledRadio value="desc">{t('DESC')}</StyledRadio>
      </RadioGroup>
      <StyledInputPickerContainer ref={sortFilterPickerContainerRef}>
        <StyledInputPicker
          container={() => sortFilterPickerContainerRef.current}
          data={sortColumns}
          value={sortColumn}
          labelKey="label"
          valueKey="dataKey"
          disabledItemValues={disabledItemValues}
          virtualized
          cleanable={false}
          style={{ width: '250px' }}
          placeholder={t('Select')}
          onChange={setSortColumn}
        />
      </StyledInputPickerContainer>
    </>
  );
};

export default ColumnSort;
