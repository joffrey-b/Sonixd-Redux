import _ from 'lodash';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonToolbar, Divider, FlexboxGrid, Form, RadioGroup } from 'rsuite';
import styled from 'styled-components';
import { useAppDispatch } from '../../redux/hooks';
import { Item, Album } from '../../types';
import { setAdvancedFilters as setAdvancedFiltersCreator } from '../../redux/viewSlice';
import type { AdvancedFilters as AdvancedFiltersState } from '../../redux/viewSlice';
type SetAdvancedFilters = typeof setAdvancedFiltersCreator;

interface FilteredData {
  filteredData: Album[];
  byArtistData: Album[];
  byArtistBaseData: Album[];
  byGenreData: Album[];
  byStarredData: Album[];
  byYearData: Album[];
}

interface TagSummary {
  id: string;
  title: string;
  count: number;
}
import {
  StyledButton,
  StyledCheckbox,
  StyledCheckPicker,
  StyledInputNumber,
  StyledInputPickerContainer,
  StyledRadio,
  StyledToggle,
} from '../shared/styled';

export const FilterHeader = styled.div`
  font-size: 16px;
  font-weight: bold;
  line-height: unset;
`;

const AdvancedFilters = ({
  filteredData,
  originalData,
  filter,
  setAdvancedFilters,
}: {
  filteredData: FilteredData;
  originalData: Album[];
  filter: AdvancedFiltersState;
  setAdvancedFilters: SetAdvancedFilters;
}) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [availableGenres, setAvailableGenres] = useState<TagSummary[]>([]);
  const [availableArtists, setAvailableArtists] = useState<TagSummary[]>([]);
  const [genreListData, setGenreListData] = useState<Album[]>([]);
  const [artistListData, setArtistListData] = useState<Album[]>([]);
  const genreFilterPickerContainerRef = useRef<HTMLDivElement | null>(null);
  const artistFilterPickerContainerRef = useRef<HTMLDivElement | null>(null);

  // Filter flow from TOP to BOTTOM (see useAdvancedFilter hook)
  // 1. byStarredData
  // 2. byGenreData
  // 3. byArtistData
  // 4. byYearData
  // 5. filteredData <- Same as previous (byYearData)

  useEffect(() => {
    if (filter.enabled) {
      if (filter.properties.artist.type === 'and') {
        return setArtistListData(filteredData.byArtistData);
      }

      if (filter.properties.starred) {
        return setArtistListData(filteredData.byGenreData);
      }

      if (filter.properties.artist.type === 'or') {
        return setArtistListData(filteredData.byGenreData);
      }
    }

    return setArtistListData(originalData);
  }, [
    filter.enabled,
    filter.properties.artist.list.length,
    filter.properties.artist.type,
    filter.properties.starred,
    filteredData.byArtistData,
    filteredData.byGenreData,
    originalData,
  ]);

  useEffect(() => {
    if (filter.enabled) {
      if (filter.properties.starred) {
        if (filter.properties.genre.type === 'and') {
          return setGenreListData(filteredData.filteredData);
        }
        return setGenreListData(filteredData.byArtistData);
      }

      if (filter.properties.artist.list.length > 0) {
        if (filter.properties.genre.type === 'and') {
          return setGenreListData(filteredData.filteredData);
        }
        return setGenreListData(filteredData.byArtistBaseData);
      }

      if (filter.properties.genre.list.length > 0) {
        if (filter.properties.genre.type === 'and') {
          return setGenreListData(filteredData.byGenreData);
        }
      }
    }

    return setGenreListData(originalData);
  }, [
    filter.enabled,
    filter.properties.artist.list.length,
    filter.properties.genre.list.length,
    filter.properties.genre.type,
    filter.properties.starred,
    filteredData,
    originalData,
  ]);

  useEffect(() => {
    const allGenres = _.compact(_.flatten(_.map(genreListData, 'genre')));
    const counts = _.countBy(allGenres, 'title');
    const uniqueGenres = _.orderBy(_.uniqBy(allGenres, 'title'), [
      (entry) => {
        return typeof entry.title === 'string'
          ? entry.title.toLowerCase() || ''
          : +entry.title || '';
      },
    ]);

    setAvailableGenres(
      uniqueGenres.map((genre) => {
        return {
          id: genre.id,
          title: genre.title,
          count: counts[genre.title],
        };
      })
    );
  }, [genreListData]);

  useEffect(() => {
    const allArtists = _.compact(_.flatten(_.map(artistListData, 'artist')));
    const counts = _.countBy(allArtists, 'id');
    const uniqueArtists = _.orderBy(_.uniqBy(allArtists, 'id'), [
      (entry) => {
        return typeof entry.title === 'string'
          ? entry.title.toLowerCase() || ''
          : +entry.title || '';
      },
    ]);

    setAvailableArtists(
      uniqueArtists.map((artist) => {
        return {
          id: artist.id,
          title: artist.title,
          count: counts[artist.id],
        };
      })
    );
  }, [artistListData]);

  return (
    <div>
      <FilterHeader>
        <FlexboxGrid justify="space-between">
          <FlexboxGrid.Item>Filters</FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <StyledToggle
              data-testid="album-filter-enabled-toggle"
              size="md"
              checkedChildren="On"
              unCheckedChildren="Off"
              defaultChecked={filter.enabled}
              checked={filter.enabled}
              onChange={(e: boolean) => {
                dispatch(setAdvancedFilters({ listType: Item.Album, filter: 'enabled', value: e }));
              }}
            />
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </FilterHeader>
      <StyledCheckbox
        defaultChecked={filter.properties.starred}
        checked={filter.properties.starred}
        onChange={(_v: unknown, e: boolean) => {
          dispatch(
            setAdvancedFilters({
              listType: Item.Album,
              filter: 'starred',
              value: e,
            })
          );
        }}
      >
        {t('Is favorite')}
      </StyledCheckbox>
      <StyledCheckbox
        defaultChecked={filter.properties.notStarred}
        checked={filter.properties.notStarred}
        onChange={(_v: unknown, e: boolean) => {
          dispatch(
            setAdvancedFilters({
              listType: Item.Album,
              filter: 'notStarred',
              value: e,
            })
          );
        }}
      >
        {t('Is not favorite')}
      </StyledCheckbox>
      <Divider />
      <FilterHeader>
        <FlexboxGrid justify="space-between">
          <FlexboxGrid.Item>{t('Genres')}</FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <StyledButton
              data-testid="album-filter-genre-reset-button"
              size="xs"
              appearance={filter.properties.genre.list.length > 0 ? 'primary' : 'subtle'}
              disabled={filter.properties.genre.list.length === 0}
              onClick={() => {
                dispatch(
                  setAdvancedFilters({
                    listType: Item.Album,
                    filter: 'genre',
                    value: { ...filter.properties.genre, list: [] },
                  })
                );
              }}
            >
              Reset
            </StyledButton>
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </FilterHeader>
      <RadioGroup
        inline
        defaultValue={filter.properties.genre.type}
        onChange={(e) => {
          dispatch(
            setAdvancedFilters({
              listType: Item.Album,
              filter: 'genre',
              value: { ...filter.properties.genre, type: e as string },
            })
          );
        }}
      >
        <StyledRadio value="and">{t('AND')}</StyledRadio>
        <StyledRadio value="or">{t('OR')}</StyledRadio>
      </RadioGroup>
      <div style={{ position: 'relative' }}>
        {/* Hidden native multi-select — same e2e-testability workaround as
            player-backend-select in PlaybackConfig.tsx, extended to a
            multi-select since this is a CheckPicker (checkbox list), not a
            single-value picker. Wrapped together with the picker container
            in this shared relatively-positioned parent so the select's
            absolute positioning actually resolves against it (it's hidden
            either way, but a sibling-only position:relative on just the
            picker container wouldn't establish that context). */}
        <select
          data-testid="album-filter-genre-select"
          multiple
          value={filter.properties.genre.list}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            dispatch(
              setAdvancedFilters({
                listType: Item.Album,
                filter: 'genre',
                value: { ...filter.properties.genre, list: selected },
              })
            );
          }}
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            opacity: 0.01,
            top: 0,
            left: 0,
          }}
          aria-hidden="true"
          tabIndex={-1}
        >
          {availableGenres.map((g) => (
            <option key={g.title} value={g.title}>
              {g.title}
            </option>
          ))}
        </select>
        <StyledInputPickerContainer ref={genreFilterPickerContainerRef}>
          <ButtonToolbar>
            <StyledCheckPicker
              container={() => genreFilterPickerContainerRef.current as HTMLElement}
              data={_.concat(
                availableGenres,
                _.compact(
                  (filter.properties.genre.list as string[]).map((genre) => {
                    if (!_.includes(_.map(availableGenres, 'title'), genre)) {
                      return { title: genre };
                    }

                    return undefined;
                  })
                )
              )}
              value={filter.properties.genre.list}
              labelKey="title"
              valueKey="title"
              virtualized
              cleanable={false}
              onEntered={() => {
                (
                  document.querySelectorAll('.rs-picker-search-bar-input')[0] as HTMLElement
                ).focus();
              }}
              renderMenuItem={(label: React.ReactNode, item: { count?: number }) => {
                return (
                  <div>
                    {label} ({item.count || 0})
                  </div>
                );
              }}
              sticky
              style={{ width: '250px' }}
              onChange={(e) => {
                dispatch(
                  setAdvancedFilters({
                    listType: Item.Album,
                    filter: 'genre',
                    value: { ...filter.properties.genre, list: e as string[] },
                  })
                );
              }}
            />
          </ButtonToolbar>
        </StyledInputPickerContainer>
      </div>
      <Divider />
      <FilterHeader>
        <FlexboxGrid justify="space-between">
          <FlexboxGrid.Item>{t('Artists')}</FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <StyledButton
              size="xs"
              appearance={filter.properties.artist.list.length > 0 ? 'primary' : 'subtle'}
              disabled={filter.properties.artist.list.length === 0}
              onClick={() => {
                dispatch(
                  setAdvancedFilters({
                    listType: Item.Album,
                    filter: 'artist',
                    value: { ...filter.properties.artist, list: [] },
                  })
                );
              }}
            >
              Reset
            </StyledButton>
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </FilterHeader>
      <RadioGroup
        inline
        defaultValue={filter.properties.artist.type}
        onChange={(e) => {
          dispatch(
            setAdvancedFilters({
              listType: Item.Album,
              filter: 'artist',
              value: { ...filter.properties.artist, type: e as string },
            })
          );
        }}
      >
        <StyledRadio value="and">{t('AND')}</StyledRadio>
        <StyledRadio value="or">{t('OR')}</StyledRadio>
      </RadioGroup>
      <StyledInputPickerContainer ref={artistFilterPickerContainerRef}>
        <ButtonToolbar>
          <StyledCheckPicker
            container={() => artistFilterPickerContainerRef.current as HTMLElement}
            data={_.concat(
              availableArtists,
              _.compact(
                (filter.properties.artist.list as string[]).map((artistId) => {
                  if (!_.includes(_.map(availableArtists, 'id'), artistId)) {
                    return { title: artistId, id: artistId };
                  }

                  return undefined;
                })
              )
            )}
            value={filter.properties.artist.list}
            labelKey="title"
            valueKey="id"
            virtualized
            cleanable={false}
            onEntered={() => {
              (document.querySelectorAll('.rs-picker-search-bar-input')[0] as HTMLElement).focus();
            }}
            renderMenuItem={(label: React.ReactNode, item: { count?: number }) => {
              return (
                <div>
                  {label} ({item.count || 0})
                </div>
              );
            }}
            sticky
            style={{ width: '250px' }}
            onChange={(e) => {
              dispatch(
                setAdvancedFilters({
                  listType: Item.Album,
                  filter: 'artist',
                  value: { ...filter.properties.artist, list: e as string[] },
                })
              );
            }}
          />
        </ButtonToolbar>
      </StyledInputPickerContainer>
      <Divider />
      <FilterHeader>
        <FlexboxGrid justify="space-between">
          <FlexboxGrid.Item>{t('Years')}</FlexboxGrid.Item>
          <FlexboxGrid.Item>
            <StyledButton
              size="xs"
              appearance={
                filter.properties.year.from === 0 && filter.properties.year.to === 0
                  ? 'subtle'
                  : 'primary'
              }
              disabled={filter.properties.year.from === 0 && filter.properties.year.to === 0}
              onClick={() => {
                dispatch(
                  setAdvancedFilters({
                    listType: Item.Album,
                    filter: 'year',
                    value: { from: 0, to: 0 },
                  })
                );
              }}
            >
              {t('Reset')}
            </StyledButton>
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </FilterHeader>
      <FlexboxGrid justify="space-between">
        <FlexboxGrid.Item>
          <Form.ControlLabel>{t('From')}</Form.ControlLabel>
          <StyledInputNumber
            data-testid="album-filter-year-from"
            $width={100}
            min={0}
            max={3000}
            step={1}
            defaultValue={filter.properties.year.from}
            value={filter.properties.year.from}
            onChange={(e: number) => {
              dispatch(
                setAdvancedFilters({
                  listType: Item.Album,
                  filter: 'year',
                  value: { ...filter.properties.year, from: Number(e) },
                })
              );
            }}
          />
        </FlexboxGrid.Item>
        <FlexboxGrid.Item>
          <Form.ControlLabel>{t('To')}</Form.ControlLabel>
          <StyledInputNumber
            data-testid="album-filter-year-to"
            $width={100}
            min={0}
            max={3000}
            step={1}
            defaultValue={filter.properties.year.to}
            value={filter.properties.year.to}
            onChange={(e: number) => {
              dispatch(
                setAdvancedFilters({
                  listType: Item.Album,
                  filter: 'year',
                  value: { ...filter.properties.year, to: Number(e) },
                })
              );
            }}
          />
        </FlexboxGrid.Item>
      </FlexboxGrid>
    </div>
  );
};

export default AdvancedFilters;
