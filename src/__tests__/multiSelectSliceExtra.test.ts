import { configureStore } from '@reduxjs/toolkit';
import multiSelectReducer, {
  setSelected,
  setSelectedSingle,
  toggleSelected,
  toggleSelectedSingle,
  toggleRangeSelected,
  clearSelected,
  setCurrentMouseOverId,
  setIsSelectDragging,
  setRangeSelected,
} from '../redux/multiSelectSlice';

const item = (id: string) => ({ uniqueId: id });

const createStore = () => configureStore({ reducer: { multiSelect: multiSelectReducer } });

// ─── setIsSelectDragging ──────────────────────────────────────────────────────

describe('multiSelectSlice — setIsSelectDragging', () => {
  it('starts as false', () => {
    expect(createStore().getState().multiSelect.isSelectDragging).toBe(false);
  });

  it('sets isSelectDragging to true', () => {
    const store = createStore();
    store.dispatch(setIsSelectDragging(true));
    expect(store.getState().multiSelect.isSelectDragging).toBe(true);
  });

  it('sets isSelectDragging back to false', () => {
    const store = createStore();
    store.dispatch(setIsSelectDragging(true));
    store.dispatch(setIsSelectDragging(false));
    expect(store.getState().multiSelect.isSelectDragging).toBe(false);
  });
});

// ─── setCurrentMouseOverId ────────────────────────────────────────────────────

describe('multiSelectSlice — setCurrentMouseOverId', () => {
  it('starts with both id and index undefined', () => {
    const state = createStore().getState().multiSelect;
    expect(state.currentMouseOverId).toBeUndefined();
    expect(state.currentMouseOverIndex).toBeUndefined();
  });

  it('sets id and index together', () => {
    const store = createStore();
    store.dispatch(setCurrentMouseOverId({ uniqueId: 'row-5', index: 5 }));
    const state = store.getState().multiSelect;
    expect(state.currentMouseOverId).toBe('row-5');
    expect(state.currentMouseOverIndex).toBe(5);
  });

  it('clears id and index by passing undefined', () => {
    const store = createStore();
    store.dispatch(setCurrentMouseOverId({ uniqueId: 'row-5', index: 5 }));
    store.dispatch(setCurrentMouseOverId({ uniqueId: undefined, index: undefined }));
    const state = store.getState().multiSelect;
    expect(state.currentMouseOverId).toBeUndefined();
    expect(state.currentMouseOverIndex).toBeUndefined();
  });
});

// ─── setSelectedSingle ────────────────────────────────────────────────────────

describe('multiSelectSlice — setSelectedSingle', () => {
  it('selects a single item and clears any previous selection', () => {
    const store = createStore();
    store.dispatch(setSelected([item('a'), item('b')]));
    store.dispatch(setSelectedSingle(item('c')));
    const state = store.getState().multiSelect;
    expect(state.selected).toHaveLength(1);
    expect(state.selected[0].uniqueId).toBe('c');
  });

  it('sets lastSelected to the new item', () => {
    const store = createStore();
    store.dispatch(setSelectedSingle(item('x')));
    expect(store.getState().multiSelect.lastSelected.uniqueId).toBe('x');
  });

  it('resets lastRangeSelected when selecting single', () => {
    const store = createStore();
    store.dispatch(setSelectedSingle(item('a')));
    store.dispatch(setRangeSelected(item('c')));
    store.dispatch(setSelectedSingle(item('x')));
    const state = store.getState().multiSelect;
    expect(state.lastRangeSelected.lastRangeSelected.uniqueId).toBe('');
  });
});

// ─── toggleSelectedSingle ─────────────────────────────────────────────────────

describe('multiSelectSlice — toggleSelectedSingle', () => {
  it('selects item if nothing is selected', () => {
    const store = createStore();
    store.dispatch(toggleSelectedSingle(item('a')));
    expect(store.getState().multiSelect.selected).toHaveLength(1);
    expect(store.getState().multiSelect.selected[0].uniqueId).toBe('a');
  });

  it('deselects item if it is the current single selection', () => {
    const store = createStore();
    store.dispatch(toggleSelectedSingle(item('a')));
    store.dispatch(toggleSelectedSingle(item('a')));
    expect(store.getState().multiSelect.selected).toHaveLength(0);
  });

  it('replaces selection with a different item', () => {
    const store = createStore();
    store.dispatch(toggleSelectedSingle(item('a')));
    store.dispatch(toggleSelectedSingle(item('b')));
    const state = store.getState().multiSelect;
    expect(state.selected).toHaveLength(1);
    expect(state.selected[0].uniqueId).toBe('b');
  });
});

// ─── toggleRangeSelected edge cases ───────────────────────────────────────────

describe('toggleRangeSelected — edge cases', () => {
  const list = [item('a'), item('b'), item('c'), item('d'), item('e')];

  it('range from same index to same index selects just that item', () => {
    const store = createStore();
    store.dispatch(setSelectedSingle(item('c')));
    store.dispatch(setRangeSelected(item('c')));
    store.dispatch(toggleRangeSelected(list));
    expect(store.getState().multiSelect.selected.map((e) => e.uniqueId)).toEqual(['c']);
  });

  it('range in reverse order (end before start) still selects correctly', () => {
    const store = createStore();
    // lastSelected = 'd', lastRangeSelected = 'b' → should select b,c,d
    store.dispatch(setSelectedSingle(item('d')));
    store.dispatch(setRangeSelected(item('b')));
    store.dispatch(toggleRangeSelected(list));
    const ids = store.getState().multiSelect.selected.map((e) => e.uniqueId);
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).toContain('d');
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('e');
  });

  it('range selection does not produce duplicates', () => {
    const store = createStore();
    store.dispatch(setSelectedSingle(item('a')));
    store.dispatch(setRangeSelected(item('c')));
    store.dispatch(toggleRangeSelected(list));
    store.dispatch(setRangeSelected(item('c')));
    // dispatch again should not double-up since it replaces the slice
    store.dispatch(toggleRangeSelected(list));
    const ids = store.getState().multiSelect.selected.map((e) => e.uniqueId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('clearSelected after range selection leaves empty state', () => {
    const store = createStore();
    store.dispatch(setSelectedSingle(item('a')));
    store.dispatch(setRangeSelected(item('e')));
    store.dispatch(toggleRangeSelected(list));
    store.dispatch(clearSelected());
    expect(store.getState().multiSelect.selected).toHaveLength(0);
  });
});

// ─── integration: setSelected then toggleSelected ─────────────────────────────

describe('multiSelectSlice — integration flows', () => {
  it('setSelected then toggleSelected removes an already-selected item', () => {
    const store = createStore();
    store.dispatch(setSelected([item('a'), item('b')]));
    store.dispatch(toggleSelected(item('a')));
    const ids = store.getState().multiSelect.selected.map((e) => e.uniqueId);
    expect(ids).not.toContain('a');
    expect(ids).toContain('b');
  });

  it('setSelected then toggleSelected adds an unselected item', () => {
    const store = createStore();
    store.dispatch(setSelected([item('a')]));
    store.dispatch(toggleSelected(item('b')));
    const ids = store.getState().multiSelect.selected.map((e) => e.uniqueId);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });
});
