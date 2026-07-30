jest.mock('../shared/connectivityPing', () => ({
  pingServer: jest.fn(),
}));
jest.mock('../shared/offlineQueueFlush', () => ({
  attemptQueueFlush: jest.fn(),
}));
jest.mock('../components/shared/toast', () => ({
  notifyToast: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import useConnectivityMonitor from '../hooks/useConnectivityMonitor';
import { pingServer } from '../shared/connectivityPing';
import { attemptQueueFlush } from '../shared/offlineQueueFlush';
import { notifyToast } from '../components/shared/toast';
import configReducer from '../redux/configSlice';
import connectivityReducer, { setManuallyForced } from '../redux/connectivitySlice';
import { Server } from '../types';

const mockPingServer = pingServer as jest.MockedFunction<typeof pingServer>;
const mockAttemptQueueFlush = attemptQueueFlush as jest.MockedFunction<typeof attemptQueueFlush>;

function makeStore(isManuallyForced = false) {
  return configureStore({
    reducer: { config: configReducer, connectivity: connectivityReducer },
    preloadedState: {
      config: { ...configReducer(undefined, { type: '@@INIT' }), serverType: Server.Subsonic },
      connectivity: { pingConfirmedUnreachable: false, isManuallyForced },
    },
  });
}

type Store = ReturnType<typeof makeStore>;
const StoreProvider = Provider as React.ComponentType<{ store: Store; children?: React.ReactNode }>;

// Fix 5 (Phase 2 fix session): useConnectivityMonitor now takes an injectable
// `enabled` parameter instead of hardcoding a `process.env.NODE_ENV === 'test'`
// check -- these tests pass it explicitly rather than mutating the real,
// shared process.env global (the previous approach risked cross-file test
// pollution if the old beforeAll/afterAll restoration was ever skipped).
function renderMonitor(store: Store, enabled = true) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, { store }, children);
  return renderHook(() => useConnectivityMonitor(enabled), { wrapper });
}

describe('useConnectivityMonitor -- flap protection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.get = (key: string) =>
      key === 'server' || key === 'serverBase64' ? 'configured' : undefined;
    mockPingServer.mockReset();
    mockAttemptQueueFlush.mockReset().mockResolvedValue(undefined);
    (notifyToast as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Audit fix (finding 2.4): a ping already in flight when the user flips
  // "Force offline mode" on used to still act on its result once it resolved
  // -- potentially clearing pingConfirmedUnreachable or triggering a
  // reconnection flush moments after the user explicitly asked the app to
  // stop touching the network. isManuallyForcedRef closes this by checking
  // the LATEST value (not the one captured when tick() was defined)
  // immediately after the ping resolves, before acting on it.
  it('ignores an in-flight ping result that resolves after the user turns Force offline mode on', async () => {
    let resolvePing: ((result: 'online' | 'unreachable' | 'auth-error') => void) | undefined;
    mockPingServer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePing = resolve;
        })
    );
    const store = makeStore(false);
    renderMonitor(store);

    // Kick off a tick whose ping call will stay pending until we resolve it
    // manually below.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(mockPingServer).toHaveBeenCalledTimes(1);

    // The user forces offline mode on WHILE that ping is still in flight.
    await act(async () => {
      store.dispatch(setManuallyForced(true));
    });

    // The stale ping now resolves 'online' -- must be ignored entirely: no
    // flush, and pingConfirmedUnreachable must not be touched by it.
    await act(async () => {
      resolvePing?.('online');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAttemptQueueFlush).not.toHaveBeenCalled();
  });

  it('a single ping failure does not by itself declare the server unreachable', async () => {
    mockPingServer.mockResolvedValue('unreachable');
    const store = makeStore();
    renderMonitor(store);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.getState().connectivity.pingConfirmedUnreachable).toBe(false);
    expect(notifyToast).toHaveBeenCalledWith('warning', expect.any(String));
  });

  it('two consecutive ping failures do declare the server unreachable', async () => {
    mockPingServer.mockResolvedValue('unreachable');
    const store = makeStore();
    renderMonitor(store);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    (notifyToast as jest.Mock).mockClear();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.getState().connectivity.pingConfirmedUnreachable).toBe(true);
    // The actual offline transition also gets its own toast, distinct from
    // the first failure's 30-second warning above.
    expect(notifyToast).toHaveBeenCalledWith('warning', expect.any(String));
  });

  it('does not re-toast the offline transition on every subsequent failed tick', async () => {
    mockPingServer.mockResolvedValue('unreachable');
    const store = makeStore();
    renderMonitor(store);

    // Three ticks: first failure warning, second failure transition toast,
    // third failure -- already offline, should stay silent.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    (notifyToast as jest.Mock).mockClear();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(notifyToast).not.toHaveBeenCalled();
  });

  it('a success between two failures resets the failure count', async () => {
    const store = makeStore();
    renderMonitor(store);

    mockPingServer.mockResolvedValueOnce('unreachable');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    mockPingServer.mockResolvedValueOnce('online');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    mockPingServer.mockResolvedValueOnce('unreachable');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Only 1 failure since the reset -- not yet the 2 consecutive required.
    expect(store.getState().connectivity.pingConfirmedUnreachable).toBe(false);
  });
});

describe('useConnectivityMonitor -- auth-error handling (Fix 6)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.get = (key: string) =>
      key === 'server' || key === 'serverBase64' ? 'configured' : undefined;
    mockPingServer.mockReset();
    mockAttemptQueueFlush.mockReset().mockResolvedValue(undefined);
    (notifyToast as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resets the failure count on an auth-error result without flipping pingConfirmedUnreachable', async () => {
    const store = makeStore();
    renderMonitor(store);

    // One genuine failure first, to prove auth-error actually resets it
    // rather than the count coincidentally already being 0.
    mockPingServer.mockResolvedValueOnce('unreachable');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    mockPingServer.mockResolvedValueOnce('auth-error');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.getState().connectivity.pingConfirmedUnreachable).toBe(false);

    // A further genuine failure should count as only the FIRST since the
    // reset, not the second -- proving the auth-error genuinely cleared the
    // counter rather than merely not incrementing it.
    mockPingServer.mockResolvedValueOnce('unreachable');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.getState().connectivity.pingConfirmedUnreachable).toBe(false);
  });

  it('does not trigger a reconnection flush on an auth-error result', async () => {
    mockPingServer.mockResolvedValue('unreachable');
    const store = makeStore();
    renderMonitor(store);

    // Two failures -> pingConfirmedUnreachable becomes true.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(store.getState().connectivity.pingConfirmedUnreachable).toBe(true);

    // Next tick returns auth-error, not online -- must not be treated as a
    // reconnection (replaying a queue against rejected credentials would
    // just fail identically every time).
    mockPingServer.mockResolvedValue('auth-error');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAttemptQueueFlush).not.toHaveBeenCalled();
  });
});

describe('useConnectivityMonitor -- reconnection flush trigger', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.get = (key: string) =>
      key === 'server' || key === 'serverBase64' ? 'configured' : undefined;
    mockPingServer.mockReset();
    mockAttemptQueueFlush.mockReset().mockResolvedValue(undefined);
    (notifyToast as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls attemptQueueFlush when a ping succeeds after a prior unreachable state', async () => {
    mockPingServer.mockResolvedValue('unreachable');
    const store = makeStore();
    renderMonitor(store);

    // Two failures -> pingConfirmedUnreachable becomes true.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(store.getState().connectivity.pingConfirmedUnreachable).toBe(true);
    expect(mockAttemptQueueFlush).not.toHaveBeenCalled();

    // Next tick succeeds -> reconnection.
    mockPingServer.mockResolvedValue('online');
    (notifyToast as jest.Mock).mockClear();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAttemptQueueFlush).toHaveBeenCalled();
    expect(notifyToast).toHaveBeenCalledWith('info', expect.any(String));
  });

  it('does not toast on a successful ping when the state was already online', async () => {
    mockPingServer.mockResolvedValue('online');
    const store = makeStore();
    renderMonitor(store);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.getState().connectivity.pingConfirmedUnreachable).toBe(false);
    expect(notifyToast).not.toHaveBeenCalled();
  });

  it('calls attemptQueueFlush immediately when the manual toggle is turned off', async () => {
    const store = makeStore(true);
    renderMonitor(store);

    mockPingServer.mockResolvedValue('online');

    await act(async () => {
      store.dispatch(setManuallyForced(false));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPingServer).toHaveBeenCalled();
    expect(mockAttemptQueueFlush).toHaveBeenCalled();
  });

  it('does not call attemptQueueFlush on a ping success when the state was already online', async () => {
    mockPingServer.mockResolvedValue('online');
    const store = makeStore();
    renderMonitor(store);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAttemptQueueFlush).not.toHaveBeenCalled();
  });
});

describe('useConnectivityMonitor -- enabled parameter (Fix 5)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.get = (key: string) =>
      key === 'server' || key === 'serverBase64' ? 'configured' : undefined;
    mockPingServer.mockReset().mockResolvedValue('online');
    mockAttemptQueueFlush.mockReset().mockResolvedValue(undefined);
    (notifyToast as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not schedule any ping when enabled is false', async () => {
    const store = makeStore();
    renderMonitor(store, false);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPingServer).not.toHaveBeenCalled();
  });

  it('schedules pings normally when enabled is true (the default)', async () => {
    const store = makeStore();
    // No second argument -- exercises the actual default, not just an
    // explicit `true`.
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(StoreProvider, { store }, children);
    renderHook(() => useConnectivityMonitor(), { wrapper });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPingServer).toHaveBeenCalled();
  });
});
