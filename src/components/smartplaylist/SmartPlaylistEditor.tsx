import React, { useRef, useMemo, useState } from 'react';
import { nanoid } from 'nanoid/non-secure';
import { Modal, Form, FormGroup, ControlLabel, ButtonToolbar, Toggle, Icon } from 'rsuite';
import { useTranslation } from 'react-i18next';
import {
  SmartPlaylist,
  SmartPlaylistRule,
  SmartPlaylistRuleField,
  SmartPlaylistRuleOperator,
  SmartPlaylistSortField,
} from '../../types';
import {
  StyledButton,
  StyledInput,
  StyledInputNumber,
  StyledInputPicker,
  StyledInputPickerContainer,
} from '../shared/styled';
import useLibraryCache from '../../hooks/useLibraryCache';

// Wraps a single picker in its own container so the dropdown menu is
// positioned correctly relative to that picker (same pattern as ColumnSort).
const PickerWrapper = ({
  children,
}: {
  children: (container: () => HTMLElement) => React.ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <StyledInputPickerContainer
      ref={ref}
      style={{ display: 'inline-block', position: 'relative', height: 32 }}
    >
      {children(() => ref.current as HTMLElement)}
    </StyledInputPickerContainer>
  );
};

const FIELD_OPTIONS: { label: string; value: SmartPlaylistRuleField }[] = [
  { label: 'Genre', value: 'genre' },
  { label: 'Year', value: 'year' },
  { label: 'Play Count', value: 'playCount' },
  { label: 'Rating', value: 'rating' },
  { label: 'Starred', value: 'starred' },
  { label: 'Duration (min)', value: 'duration' },
];

const OPERATORS_BY_FIELD: Record<
  SmartPlaylistRuleField,
  { label: string; value: SmartPlaylistRuleOperator }[]
> = {
  genre: [
    { label: 'is', value: 'is' },
    { label: 'is not', value: 'isNot' },
  ],
  year: [
    { label: 'is', value: 'is' },
    { label: 'between', value: 'between' },
    { label: '≥', value: 'gte' },
    { label: '>', value: 'gt' },
    { label: '≤', value: 'lte' },
    { label: '<', value: 'lt' },
  ],
  playCount: [
    { label: '≥', value: 'gte' },
    { label: '>', value: 'gt' },
    { label: '≤', value: 'lte' },
    { label: '<', value: 'lt' },
    { label: 'is', value: 'is' },
  ],
  rating: [
    { label: '≥', value: 'gte' },
    { label: '≤', value: 'lte' },
    { label: 'is', value: 'is' },
  ],
  starred: [{ label: 'is', value: 'is' }],
  duration: [
    { label: 'between', value: 'between' },
    { label: 'shorter than', value: 'lt' },
    { label: 'longer than', value: 'gt' },
  ],
};

const DEFAULT_OPERATOR: Record<SmartPlaylistRuleField, SmartPlaylistRuleOperator> = {
  genre: 'is',
  year: 'between',
  playCount: 'gte',
  rating: 'gte',
  starred: 'is',
  duration: 'between',
};

const DEFAULT_VALUE: Record<SmartPlaylistRuleField, string | number | boolean> = {
  genre: '',
  year: 2020,
  playCount: 10,
  rating: 3,
  starred: true,
  duration: 3,
};

const SORT_OPTIONS: { label: string; value: SmartPlaylistSortField }[] = [
  { label: 'Play Count', value: 'playCount' },
  { label: 'Year', value: 'year' },
  { label: 'Rating', value: 'rating' },
  { label: 'Duration', value: 'duration' },
  { label: 'Random', value: 'random' },
];

const newRule = (): SmartPlaylistRule => ({
  id: nanoid(),
  field: 'genre',
  operator: 'is',
  value: '',
});

interface Props {
  playlist?: SmartPlaylist;
  onClose: () => void;
  onSave: (playlist: Omit<SmartPlaylist, 'id'>) => void;
}

const RuleValueInput = ({
  rule,
  onChange,
  showErrors,
}: {
  rule: SmartPlaylistRule;
  onChange: (updated: Partial<SmartPlaylistRule>) => void;
  showErrors: boolean;
}) => {
  const { t } = useTranslation();
  const { field, operator, value, value2 } = rule;

  if (field === 'starred') {
    return (
      <Toggle
        checked={Boolean(value)}
        checkedChildren={t('Yes')}
        unCheckedChildren={t('No')}
        onChange={(v) => onChange({ value: v })}
      />
    );
  }

  if (field === 'genre') {
    const isEmpty = showErrors && !String(value).trim();
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <StyledInput
          width={160}
          value={String(value)}
          placeholder={t('e.g. Rock')}
          onChange={(v: string) => onChange({ value: v })}
          style={{ height: 32, borderColor: isEmpty ? '#f44336' : undefined }}
        />
        {isEmpty && (
          <span
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              fontSize: 11,
              color: '#f44336',
              marginTop: 2,
              whiteSpace: 'nowrap',
            }}
          >
            {t('Required')}
          </span>
        )}
      </div>
    );
  }

  if (field === 'rating') {
    return (
      <PickerWrapper>
        {(container) => (
          <StyledInputPicker
            cleanable={false}
            searchable={false}
            container={container}
            value={Number(value)}
            data={[1, 2, 3, 4, 5].map((n) => ({ label: `${n} ★`, value: n }))}
            onChange={(v: number) => onChange({ value: v ?? 1 })}
            width={100}
          />
        )}
      </PickerWrapper>
    );
  }

  if (operator === 'between') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StyledInputNumber
          width={160}
          value={Number(value)}
          min={field === 'year' ? 1900 : 0}
          max={field === 'year' ? 2200 : undefined}
          step={1}
          style={{ height: 32, width: 160 }}
          onChange={(v: any) => onChange({ value: Number(v) })}
        />
        <span style={{ opacity: 0.6 }}>{t('and')}</span>
        <StyledInputNumber
          width={160}
          value={Number(value2 ?? (field === 'year' ? 2024 : 8))}
          min={field === 'year' ? 1900 : 0}
          max={field === 'year' ? 2200 : undefined}
          step={1}
          style={{ height: 32, width: 160 }}
          onChange={(v: any) => onChange({ value2: Number(v) })}
        />
      </div>
    );
  }

  return (
    <StyledInputNumber
      width={160}
      value={Number(value)}
      min={field === 'year' ? 1900 : 0}
      max={field === 'year' ? 2200 : undefined}
      step={1}
      style={{ height: 32, width: 160 }}
      onChange={(v: any) => onChange({ value: Number(v) })}
    />
  );
};

const SmartPlaylistEditor = ({ playlist, onClose, onSave }: Props) => {
  const { t } = useTranslation();
  const { hasCacheForCurrentServer } = useLibraryCache();
  const cacheAvailable = useMemo(() => hasCacheForCurrentServer(), [hasCacheForCurrentServer]);

  const [name, setName] = useState(playlist?.name ?? '');
  const [rules, setRules] = useState<SmartPlaylistRule[]>(playlist?.rules ?? []);
  const [sort, setSort] = useState<SmartPlaylistSortField>(playlist?.sort ?? 'playCount');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    playlist?.sortDirection ?? 'desc'
  );
  const [limit, setLimit] = useState(playlist?.limit ?? 50);
  const [saveAttempted, setSaveAttempted] = useState(false);

  const updateRule = (id: string, changes: Partial<SmartPlaylistRule>) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...changes };
        if (changes.field && changes.field !== r.field) {
          updated.operator = DEFAULT_OPERATOR[changes.field];
          updated.value = DEFAULT_VALUE[changes.field];
          updated.value2 = undefined;
        }
        if (changes.operator && changes.operator !== 'between') {
          updated.value2 = undefined;
        }
        if (updated.operator === 'between' && updated.value2 === undefined) {
          updated.value2 = updated.field === 'year' ? 2024 : 8;
        }
        return updated;
      })
    );
  };

  const removeRule = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));

  const hasInvalidRules = rules.some((r) => r.field === 'genre' && !String(r.value).trim());

  const handleSave = () => {
    if (!name.trim()) return;
    setSaveAttempted(true);
    if (hasInvalidRules) return;
    onSave({ name: name.trim(), rules, sort, sortDirection, limit });
  };

  return (
    <Modal show size="lg" onHide={onClose}>
      <Modal.Header>
        <Modal.Title>{playlist ? t('Edit Smart Playlist') : t('New Smart Playlist')}</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ overflow: 'visible' }}>
        <Form fluid>
          <FormGroup>
            <ControlLabel>{t('Name')}</ControlLabel>
            <StyledInput
              width={560}
              value={name}
              onChange={(v: string) => setName(v)}
              placeholder={t('Playlist name')}
            />
          </FormGroup>

          <FormGroup>
            <ControlLabel>{t('Rules')}</ControlLabel>
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
              >
                <PickerWrapper>
                  {(container) => (
                    <StyledInputPicker
                      cleanable={false}
                      searchable={false}
                      container={container}
                      value={rule.field}
                      data={FIELD_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                      onChange={(v: SmartPlaylistRuleField) => updateRule(rule.id, { field: v })}
                      width={140}
                    />
                  )}
                </PickerWrapper>
                <PickerWrapper>
                  {(container) => (
                    <StyledInputPicker
                      cleanable={false}
                      searchable={false}
                      container={container}
                      value={rule.operator}
                      data={OPERATORS_BY_FIELD[rule.field].map((o) => ({
                        ...o,
                        label: t(o.label),
                      }))}
                      onChange={(v: SmartPlaylistRuleOperator) =>
                        updateRule(rule.id, { operator: v })
                      }
                      width={120}
                    />
                  )}
                </PickerWrapper>
                <RuleValueInput
                  rule={rule}
                  onChange={(changes) => updateRule(rule.id, changes)}
                  showErrors={saveAttempted}
                />
                <StyledButton
                  appearance="subtle"
                  size="sm"
                  onClick={() => removeRule(rule.id)}
                  style={{ marginLeft: 4, flexShrink: 0 }}
                >
                  <Icon icon="close" />
                </StyledButton>
              </div>
            ))}
            <StyledButton
              appearance="subtle"
              size="sm"
              onClick={() => setRules((prev) => [...prev, newRule()])}
            >
              <Icon icon="plus" /> {t('Add Rule')}
            </StyledButton>
          </FormGroup>

          {sort === 'playCount' && rules.length === 0 && !cacheAvailable && (
            <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
              {t(
                'Tip: without rules, songs are drawn from a random pool of 500. Play Count sort ranks within that pool — not across your full library.'
              )}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <FormGroup>
              <ControlLabel>{t('Sort by')}</ControlLabel>
              <PickerWrapper>
                {(container) => (
                  <StyledInputPicker
                    cleanable={false}
                    searchable={false}
                    container={container}
                    value={sort}
                    data={SORT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                    onChange={(v: SmartPlaylistSortField) => setSort(v)}
                    width={140}
                  />
                )}
              </PickerWrapper>
            </FormGroup>
            <FormGroup>
              <ControlLabel>{t('Direction')}</ControlLabel>
              <PickerWrapper>
                {(container) => (
                  <StyledInputPicker
                    cleanable={false}
                    searchable={false}
                    container={container}
                    value={sortDirection}
                    data={[
                      { label: t('Descending'), value: 'desc' },
                      { label: t('Ascending'), value: 'asc' },
                    ]}
                    onChange={(v: 'asc' | 'desc') => setSortDirection(v)}
                    width={130}
                  />
                )}
              </PickerWrapper>
            </FormGroup>
            <FormGroup>
              <ControlLabel>{t('Limit')}</ControlLabel>
              <StyledInputNumber
                value={limit}
                min={1}
                step={50}
                style={{ height: 32 }}
                onChange={(v: any) => setLimit(Math.max(1, Number(v)))}
                width={100}
              />
            </FormGroup>
          </div>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <ButtonToolbar>
          <StyledButton appearance="primary" onClick={handleSave} disabled={!name.trim()}>
            {t('Save')}
          </StyledButton>
          <StyledButton appearance="subtle" onClick={onClose}>
            {t('Cancel')}
          </StyledButton>
        </ButtonToolbar>
      </Modal.Footer>
    </Modal>
  );
};

export default SmartPlaylistEditor;
