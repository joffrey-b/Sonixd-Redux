import { shouldScrobble, scrobbleTimerMs } from '../shared/scrobbleLogic';

describe('shouldScrobble', () => {
  it('returns false when duration is < 30 seconds regardless of threshold', () => {
    expect(
      shouldScrobble({ currentTime: 25, duration: 25, threshold: 50, hasScrobbled: false })
    ).toBe(false);
  });

  it('returns false when currentTime < 30 seconds regardless of percentage', () => {
    expect(
      shouldScrobble({ currentTime: 20, duration: 300, threshold: 0, hasScrobbled: false })
    ).toBe(false);
  });

  it('returns true when track is >= 30 seconds and threshold is met', () => {
    expect(
      shouldScrobble({ currentTime: 90, duration: 180, threshold: 50, hasScrobbled: false })
    ).toBe(true);
  });

  it('returns false when currentTime is below the threshold percentage', () => {
    // 40% of 180s = 72s, currentTime = 50s < 72s
    expect(
      shouldScrobble({ currentTime: 50, duration: 180, threshold: 40, hasScrobbled: false })
    ).toBe(false);
  });

  it('returns true when currentTime is exactly at the threshold percentage', () => {
    // 50% of 200s = 100s
    expect(
      shouldScrobble({ currentTime: 100, duration: 200, threshold: 50, hasScrobbled: false })
    ).toBe(true);
  });

  it('returns true when currentTime exceeds the threshold percentage', () => {
    expect(
      shouldScrobble({ currentTime: 120, duration: 200, threshold: 50, hasScrobbled: false })
    ).toBe(true);
  });

  it('returns false when hasScrobbled is true regardless of time', () => {
    expect(
      shouldScrobble({ currentTime: 300, duration: 300, threshold: 50, hasScrobbled: true })
    ).toBe(false);
    expect(
      shouldScrobble({ currentTime: 250, duration: 300, threshold: 50, hasScrobbled: true })
    ).toBe(false);
  });

  it('returns true when hasScrobbled is false and conditions are met', () => {
    expect(
      shouldScrobble({ currentTime: 200, duration: 300, threshold: 50, hasScrobbled: false })
    ).toBe(true);
  });

  it('returns false when duration is 0', () => {
    expect(
      shouldScrobble({ currentTime: 0, duration: 0, threshold: 50, hasScrobbled: false })
    ).toBe(false);
  });

  it('returns false when currentTime is 0', () => {
    expect(
      shouldScrobble({ currentTime: 0, duration: 180, threshold: 50, hasScrobbled: false })
    ).toBe(false);
  });

  it('handles threshold of 50 (default) correctly', () => {
    // 50% of 120s = 60s
    expect(
      shouldScrobble({ currentTime: 59, duration: 120, threshold: 50, hasScrobbled: false })
    ).toBe(false);
    expect(
      shouldScrobble({ currentTime: 60, duration: 120, threshold: 50, hasScrobbled: false })
    ).toBe(true);
  });

  it('handles threshold of 100 correctly', () => {
    // 100% of 120s = 120s — but 240s rule kicks in first
    expect(
      shouldScrobble({ currentTime: 240, duration: 300, threshold: 100, hasScrobbled: false })
    ).toBe(true);
    // Before 240s AND before 100%, should be false
    expect(
      shouldScrobble({ currentTime: 100, duration: 300, threshold: 100, hasScrobbled: false })
    ).toBe(false);
  });

  it('handles threshold of 0 — scrobbles as soon as 30s minimum is met', () => {
    // 0% of duration = 0s, but must still pass the 30s minimum
    expect(
      shouldScrobble({ currentTime: 30, duration: 300, threshold: 0, hasScrobbled: false })
    ).toBe(true);
    expect(
      shouldScrobble({ currentTime: 29, duration: 300, threshold: 0, hasScrobbled: false })
    ).toBe(false);
  });

  it('returns true when currentTime meets the 4-minute shortcut rule', () => {
    // 240s rule: any track where you've played >= 4 minutes counts
    expect(
      shouldScrobble({ currentTime: 240, duration: 600, threshold: 50, hasScrobbled: false })
    ).toBe(true);
  });
});

describe('scrobbleTimerMs', () => {
  it('returns threshold% of duration in milliseconds', () => {
    // 50% of 200s = 100s = 100000ms
    expect(scrobbleTimerMs({ duration: 200, threshold: 50 })).toBe(100_000);
  });

  it('returns at least 30000ms (30-second minimum)', () => {
    expect(scrobbleTimerMs({ duration: 0, threshold: 50 })).toBe(30_000);
    expect(scrobbleTimerMs({ duration: 40, threshold: 50 })).toBe(30_000);
  });

  it('clamps to 30000ms when threshold% of duration < 30 seconds', () => {
    // 50% of 50s = 25s < 30s → clamped to 30000ms
    expect(scrobbleTimerMs({ duration: 50, threshold: 50 })).toBe(30_000);
  });

  it('handles a 3-minute track at 50% threshold → 90000ms', () => {
    expect(scrobbleTimerMs({ duration: 180, threshold: 50 })).toBe(90_000);
  });

  it('handles a 20-second track → 30000ms (clamped)', () => {
    expect(scrobbleTimerMs({ duration: 20, threshold: 50 })).toBe(30_000);
  });

  it('uses a 100% threshold correctly', () => {
    // 100% of 60s = 60s = 60000ms
    expect(scrobbleTimerMs({ duration: 60, threshold: 100 })).toBe(60_000);
  });
});
