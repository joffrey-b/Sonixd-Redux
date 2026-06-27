import { renderHook, act } from '@testing-library/react';
import useScrobbleTimer from '../hooks/useScrobbleTimer';

describe('scrobble timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not fire scrobble before the timer threshold', () => {
    const onScrobble = jest.fn();
    renderHook(() =>
      useScrobbleTimer({
        duration: 180,
        threshold: 50,
        playerStatus: 'PLAYING',
        trackId: 'track-1',
        scrobbleEnabled: true,
        onScrobble,
      })
    );

    // Advance to just before the threshold (50% of 180s = 90s = 90000ms)
    jest.advanceTimersByTime(89_999);
    expect(onScrobble).not.toHaveBeenCalled();
  });

  it('fires scrobble exactly once at the threshold time', () => {
    const onScrobble = jest.fn();
    renderHook(() =>
      useScrobbleTimer({
        duration: 180,
        threshold: 50,
        playerStatus: 'PLAYING',
        trackId: 'track-1',
        scrobbleEnabled: true,
        onScrobble,
      })
    );

    act(() => {
      jest.advanceTimersByTime(90_000);
    });

    expect(onScrobble).toHaveBeenCalledTimes(1);
  });

  it('does not fire a second time after timer has fired', () => {
    const onScrobble = jest.fn();
    renderHook(() =>
      useScrobbleTimer({
        duration: 180,
        threshold: 50,
        playerStatus: 'PLAYING',
        trackId: 'track-1',
        scrobbleEnabled: true,
        onScrobble,
      })
    );

    act(() => {
      jest.advanceTimersByTime(180_000);
    });

    expect(onScrobble).toHaveBeenCalledTimes(1);
  });

  it('cancels and resets the timer when a new track starts', () => {
    const onScrobble = jest.fn();
    const { rerender } = renderHook(
      ({ trackId }: { trackId: string }) =>
        useScrobbleTimer({
          duration: 180,
          threshold: 50,
          playerStatus: 'PLAYING',
          trackId,
          scrobbleEnabled: true,
          onScrobble,
        }),
      { initialProps: { trackId: 'track-1' } }
    );

    // Advance partway through the first track
    act(() => {
      jest.advanceTimersByTime(50_000);
    });

    // Switch to a new track — timer should be cancelled and reset
    act(() => {
      rerender({ trackId: 'track-2' });
    });

    // Advance to where the first track would have fired
    act(() => {
      jest.advanceTimersByTime(40_000);
    });

    // The scrobble for track-1 should NOT have fired; track-2's timer started fresh
    expect(onScrobble).not.toHaveBeenCalled();

    // Advance the full threshold for track-2
    act(() => {
      jest.advanceTimersByTime(90_000);
    });

    expect(onScrobble).toHaveBeenCalledTimes(1);
  });

  it('does not fire if the component unmounts before the timer triggers', () => {
    const onScrobble = jest.fn();
    const { unmount } = renderHook(() =>
      useScrobbleTimer({
        duration: 180,
        threshold: 50,
        playerStatus: 'PLAYING',
        trackId: 'track-1',
        scrobbleEnabled: true,
        onScrobble,
      })
    );

    act(() => {
      jest.advanceTimersByTime(50_000);
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(90_000);
    });

    expect(onScrobble).not.toHaveBeenCalled();
  });

  it('does not start a timer when player is PAUSED', () => {
    const onScrobble = jest.fn();
    renderHook(() =>
      useScrobbleTimer({
        duration: 180,
        threshold: 50,
        playerStatus: 'PAUSED',
        trackId: 'track-1',
        scrobbleEnabled: true,
        onScrobble,
      })
    );

    act(() => {
      jest.advanceTimersByTime(180_000);
    });

    expect(onScrobble).not.toHaveBeenCalled();
  });

  it('does not fire if scrobbleEnabled is false', () => {
    const onScrobble = jest.fn();
    renderHook(() =>
      useScrobbleTimer({
        duration: 180,
        threshold: 50,
        playerStatus: 'PLAYING',
        trackId: 'track-1',
        scrobbleEnabled: false,
        onScrobble,
      })
    );

    act(() => {
      jest.advanceTimersByTime(180_000);
    });

    expect(onScrobble).not.toHaveBeenCalled();
  });
});
