import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { settings } from '../components/shared/bridge';
import connectivityReducer, {
  setPingConfirmedUnreachable,
  setManuallyForced,
  selectEffectiveOffline,
} from '../redux/connectivitySlice';

const getInitialState = () => connectivityReducer(undefined, { type: '@@INIT' });

describe('connectivity slice -- effectiveOffline derivation', () => {
  it('effectiveOffline is false when neither unreachable nor manually forced', () => {
    const state = getInitialState();
    expect(selectEffectiveOffline({ connectivity: state })).toBe(false);
  });

  it('effectiveOffline is true when manually forced, regardless of ping state', () => {
    const state = connectivityReducer(getInitialState(), setManuallyForced(true));
    expect(state.pingConfirmedUnreachable).toBe(false);
    expect(selectEffectiveOffline({ connectivity: state })).toBe(true);
  });

  it('effectiveOffline is true when ping-confirmed-unreachable, regardless of manual toggle', () => {
    const state = connectivityReducer(getInitialState(), setPingConfirmedUnreachable(true));
    expect(state.isManuallyForced).toBe(false);
    expect(selectEffectiveOffline({ connectivity: state })).toBe(true);
  });

  it('effectiveOffline is true when both are true', () => {
    let state = connectivityReducer(getInitialState(), setManuallyForced(true));
    state = connectivityReducer(state, setPingConfirmedUnreachable(true));
    expect(selectEffectiveOffline({ connectivity: state })).toBe(true);
  });
});

// Mirrors smartPlaylistSlice's own persistence contract: a listener middleware
// (not the reducer itself) writes to settings on specific actions. This local
// store replicates store.ts's connectivity listener exactly (see store.ts) --
// importing store.ts directly isn't done here, matching this codebase's
// existing convention (smartPlaylistSlice.test.ts also never imports store.ts,
// only asserting the reducer itself calls no settings.set()).
function makeTestStoreWithListener() {
  const listener = createListenerMiddleware();
  listener.startListening({
    actionCreator: setManuallyForced,
    effect: (action) => {
      settings.set('forceOfflineMode', action.payload);
    },
  });

  return configureStore({
    reducer: { connectivity: connectivityReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listener.middleware),
  });
}

describe('connectivity slice -- persistence contract (mirrors smartPlaylistSlice)', () => {
  it('isManuallyForced persists via the listener middleware, matching the smartPlaylistSlice pattern', () => {
    const mockSet = jest.fn();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.set = mockSet;

    const store = makeTestStoreWithListener();
    store.dispatch(setManuallyForced(true));

    expect(mockSet).toHaveBeenCalledWith('forceOfflineMode', true);
  });

  it('pingConfirmedUnreachable is not included in whatever gets persisted', () => {
    const mockSet = jest.fn();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.set = mockSet;

    const store = makeTestStoreWithListener();
    store.dispatch(setPingConfirmedUnreachable(true));

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('the reducer itself does not call settings.set() directly', () => {
    const mockSet = jest.fn();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.set = mockSet;

    connectivityReducer(getInitialState(), setManuallyForced(true));

    expect(mockSet).not.toHaveBeenCalled();
  });
});
