import multiSelectReducer, {
  setSelected,
  clearSelected,
  toggleSelected,
  toggleRangeSelected,
  setRangeSelected,
  setSelectedSingle,
  appendSelected,
  setIsDragging,
} from '../redux/multiSelectSlice';

interface Sel {
  uniqueId: string;
  [key: string]: unknown;
}

const item = (id: string): Sel => ({ uniqueId: id });

const getState = () => multiSelectReducer(undefined, { type: '@@INIT' });

describe('multiSelectSlice', () => {
  it('initialState has empty selected array and isDragging: false', () => {
    const state = getState();
    expect(state.selected).toEqual([]);
    expect(state.isDragging).toBe(false);
    expect(state.isSelectDragging).toBe(false);
  });

  it('setSelected replaces the selected array', () => {
    const state = multiSelectReducer(getState(), setSelected([item('a'), item('b')]));
    expect(state.selected.map((s) => s.uniqueId)).toEqual(['a', 'b']);
  });

  it('clearSelected empties the array and resets state', () => {
    let state = multiSelectReducer(getState(), setSelected([item('a'), item('b')]));
    state = multiSelectReducer(state, clearSelected());
    expect(state.selected).toEqual([]);
    expect(state.isDragging).toBe(false);
  });

  it('toggleSelected adds an item if not present', () => {
    const state = multiSelectReducer(getState(), toggleSelected(item('a')));
    expect(state.selected.map((s) => s.uniqueId)).toContain('a');
  });

  it('toggleSelected removes an item if already present', () => {
    let state = multiSelectReducer(getState(), toggleSelected(item('a')));
    state = multiSelectReducer(state, toggleSelected(item('a')));
    expect(state.selected.map((s) => s.uniqueId)).not.toContain('a');
  });

  it('toggleSelected can hold multiple items simultaneously', () => {
    let state = multiSelectReducer(getState(), toggleSelected(item('a')));
    state = multiSelectReducer(state, toggleSelected(item('b')));
    expect(state.selected.map((s) => s.uniqueId)).toContain('a');
    expect(state.selected.map((s) => s.uniqueId)).toContain('b');
  });

  it('toggleRangeSelected selects a contiguous range between two items', () => {
    const items = [item('a'), item('b'), item('c'), item('d'), item('e')];

    // First select 'b' as the anchor
    let state = multiSelectReducer(getState(), setSelectedSingle(item('b')));

    // Set last range selected to 'd'
    state = multiSelectReducer(state, setRangeSelected(item('d')));

    // Toggle range — should select b through d
    state = multiSelectReducer(state, toggleRangeSelected(items));

    const ids = state.selected.map((s) => s.uniqueId);
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).toContain('d');
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('e');
  });

  it('toggleRangeSelected does not produce duplicate entries', () => {
    const items = [item('a'), item('b'), item('c')];

    let state = multiSelectReducer(getState(), setSelectedSingle(item('a')));
    state = multiSelectReducer(state, setRangeSelected(item('c')));
    state = multiSelectReducer(state, toggleRangeSelected(items));

    const ids = state.selected.map((s) => s.uniqueId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('setIsDragging sets the isDragging flag', () => {
    const state = multiSelectReducer(getState(), setIsDragging(true));
    expect(state.isDragging).toBe(true);

    const state2 = multiSelectReducer(state, setIsDragging(false));
    expect(state2.isDragging).toBe(false);
  });

  it('appendSelected adds items without duplicates', () => {
    let state = multiSelectReducer(getState(), setSelected([item('a')]));
    state = multiSelectReducer(state, appendSelected([item('a'), item('b')]));

    const ids = state.selected.map((s) => s.uniqueId);
    expect(ids.filter((id) => id === 'a').length).toBe(1);
    expect(ids).toContain('b');
  });
});
