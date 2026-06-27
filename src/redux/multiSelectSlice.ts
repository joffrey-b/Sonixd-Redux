import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Selectable {
  uniqueId: string;
  [key: string]: unknown;
}

interface MultiSelect {
  lastSelected: Selectable;
  lastRangeSelected: {
    lastSelected: Selectable;
    lastRangeSelected: Selectable;
  };
  selected: Selectable[];
  currentMouseOverIndex?: number;
  currentMouseOverId?: string;
  isDragging: boolean;
  isSelectDragging: boolean;
}

const initialState: MultiSelect = {
  lastSelected: { uniqueId: '' },
  lastRangeSelected: {
    lastSelected: { uniqueId: '' },
    lastRangeSelected: { uniqueId: '' },
  },
  selected: [],
  currentMouseOverId: undefined,
  currentMouseOverIndex: undefined,
  isDragging: false,
  isSelectDragging: false,
};

const multiSelectSlice = createSlice({
  name: 'multiSelect',
  initialState,
  reducers: {
    setIsDragging: (state, action: PayloadAction<boolean>) => {
      state.isDragging = action.payload;
    },

    setIsSelectDragging: (state, action: PayloadAction<boolean>) => {
      state.isSelectDragging = action.payload;
    },

    setCurrentMouseOverId: (
      state,
      action: PayloadAction<{
        uniqueId: string | undefined;
        index: number | undefined;
      }>
    ) => {
      state.currentMouseOverId = action.payload.uniqueId;
      state.currentMouseOverIndex = action.payload.index;
    },

    setSelected: (state, action: PayloadAction<Selectable[]>) => {
      state.selected = action.payload;
    },

    setSelectedSingle: (state, action: PayloadAction<Selectable>) => {
      state.selected = [];
      state.lastSelected = { uniqueId: '' };
      state.lastRangeSelected = {
        lastSelected: { uniqueId: '' },
        lastRangeSelected: { uniqueId: '' },
      };

      state.lastSelected = action.payload;
      state.selected.push(action.payload);
    },

    appendSelected: (state, action: PayloadAction<Selectable[]>) => {
      action.payload.forEach((entry) => {
        const alreadySelected = state.selected.find((item) => item.uniqueId === entry.uniqueId);

        if (!alreadySelected) {
          state.selected.push(entry);
        }
      });
    },

    setRangeSelected: (state, action: PayloadAction<Selectable>) => {
      state.lastRangeSelected.lastSelected = state.lastSelected;
      state.lastRangeSelected.lastRangeSelected = action.payload;
    },

    toggleSelectedSingle: (state, action: PayloadAction<Selectable>) => {
      if (action.payload.uniqueId === state.selected[0]?.uniqueId) {
        state.selected = [];
      } else {
        state.selected = [];
        state.lastSelected = { uniqueId: '' };
        state.lastRangeSelected = {
          lastSelected: { uniqueId: '' },
          lastRangeSelected: { uniqueId: '' },
        };

        state.lastSelected = action.payload;
        state.selected.push(action.payload);
      }
    },

    toggleSelected: (state, action: PayloadAction<Selectable>) => {
      if (state.selected.find((item) => item.uniqueId === action.payload.uniqueId)) {
        const indexOfItem = state.selected.findIndex(
          (item) => item.uniqueId === action.payload.uniqueId
        );

        if (indexOfItem >= 0) {
          state.selected.splice(indexOfItem, 1);
        }
      } else {
        state.selected.push(action.payload);
        state.lastSelected = action.payload;
      }
    },

    toggleRangeSelected: (state, action: PayloadAction<Selectable[]>) => {
      if (state.lastSelected.uniqueId === state.lastRangeSelected.lastSelected.uniqueId) {
        const beginningIndex = action.payload.findIndex(
          (e) => e.uniqueId === state.lastSelected.uniqueId
        );

        const endingIndex = action.payload.findIndex(
          (e) => e.uniqueId === state.lastRangeSelected.lastRangeSelected.uniqueId
        );

        // Handle both selection directions
        const newSlice =
          beginningIndex < endingIndex
            ? action.payload.slice(beginningIndex, endingIndex + 1)
            : action.payload.slice(endingIndex, beginningIndex + 1);

        state.selected = newSlice;
      } else {
        const existingIds = new Set(state.selected.map((item) => item.uniqueId));
        action.payload.forEach((item) => {
          if (!existingIds.has(item.uniqueId)) {
            state.selected.push(item);
            existingIds.add(item.uniqueId);
          }
        });
      }
    },

    clearSelected: () => initialState,
  },
});

export const {
  setSelected,
  setSelectedSingle,
  appendSelected,
  setRangeSelected,
  toggleSelected,
  toggleSelectedSingle,
  toggleRangeSelected,
  clearSelected,
  setCurrentMouseOverId,
  setIsDragging,
  setIsSelectDragging,
} = multiSelectSlice.actions;
export default multiSelectSlice.reducer;
