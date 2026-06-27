import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { RADIO_STATION } from '../../fixtures/constants';

// Internet Radio — confirmed from source:
//   - Radio mode is purely entity-type-based: isRadio is set to true on the
//     queue entry when it's built from the Internet Radio list (see
//     InternetRadioList.tsx's handlePlay), regardless of what the underlying
//     stream actually does. The test station above is a real, genuinely
//     continuous stream (created in setup-navidrome.sh), but that's a
//     deliberate choice for realism, not a requirement — a static file would
//     have worked identically as far as this app's own logic is concerned.
//   - There is no double-click-to-play on a radio station row — only a
//     dedicated play icon button (radio-play-button), unlike album/track rows
//     elsewhere in this suite.
//   - Previous/next/stop/seek-backward/seek-forward/play-random are
//     conditionally rendered with {!isRadio && (...)} in PlayerBar.tsx — they
//     are HIDDEN (not in the DOM at all) during radio playback, not merely
//     disabled. Play/pause has no such guard and is always rendered.
//   - The "live" indicator is the DurationSpan that normally shows total
//     track duration (now showing the literal text "LIVE"); it has no
//     onClick handler at all, so it's inherently non-clickable/non-navigable.
//   - Keyboard shortcuts are renderer-level (react-hotkeys-hook, reading
//     state.config.hotkeys), not Electron's OS-level globalShortcut — the
//     globalShortcuts setting defaults to false, so window.keyboard.press()
//     reaches them directly. Defaults (setDefaultSettings.ts): playPause
//     ctrl+p, nextTrack ctrl+right, prevTrack ctrl+left, volumeUp ctrl+up,
//     volumeDown ctrl+down.
//   - The next/previous shortcuts already call effectiveHandleNext/Prev,
//     which (outside jukebox mode) resolve directly to usePlayerControls.ts's
//     handleNextTrack/handlePrevTrack — both of which already early-return
//     when playQueue.current?.isRadio is true. No product fix was needed:
//     the guard already existed before this session.

async function playRadioStation(window: Page) {
  await window.click('[data-testid="nav-internet-radio"]');
  await expect(window.locator(`text=${RADIO_STATION.name}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.click('[data-testid="radio-play-button"]');
  await window.waitForSelector('[data-testid="player-bar"]');
}

test.describe('Internet Radio — UI state', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await playRadioStation(window);
  });

  test('only play/pause is shown — previous, next, and stop are hidden', async ({
    navidromeApp: { window },
  }) => {
    await expect(window.locator('[data-testid="player-play-pause"]')).toBeVisible();
    // Not merely disabled — PlayerBar.tsx wraps these in {!isRadio && (...)},
    // so they aren't rendered into the DOM at all during radio playback.
    await expect(window.locator('[data-testid="player-previous"]')).toHaveCount(0);
    await expect(window.locator('[data-testid="player-next"]')).toHaveCount(0);
    await expect(window.locator('[data-testid="player-stop"]')).toHaveCount(0);
  });

  test('"live" indicator is shown next to the player bar', async ({ navidromeApp: { window } }) => {
    await expect(window.locator('[data-testid="player-live-indicator"]')).toBeVisible();
    await expect(window.locator('[data-testid="player-live-indicator"]')).toHaveText('LIVE');
  });

  test('clicking the "live" indicator does nothing', async ({ navidromeApp: { window } }) => {
    const titleBefore = await window.locator('[data-testid="player-track-title"]').textContent();
    await window.locator('[data-testid="player-live-indicator"]').click();
    await window.waitForTimeout(500);
    const titleAfter = await window.locator('[data-testid="player-track-title"]').textContent();
    expect(titleAfter).toBe(titleBefore);
    // Still playing the radio station, not navigated away from it.
    await expect(window.locator('[data-testid="player-live-indicator"]')).toBeVisible();
  });

  test('play/pause still works during radio playback', async ({ navidromeApp: { window } }) => {
    test.setTimeout(30_000);
    // A real external stream may take a few seconds to start buffering.
    await expect(window.locator('[data-testid="player-play-pause"]')).toHaveAttribute(
      'data-playing',
      'true',
      { timeout: 15_000 }
    );
    await window.click('[data-testid="player-play-pause"]');
    await expect(window.locator('[data-testid="player-play-pause"]')).toHaveAttribute(
      'data-playing',
      'false'
    );
    await window.click('[data-testid="player-play-pause"]');
    await expect(window.locator('[data-testid="player-play-pause"]')).toHaveAttribute(
      'data-playing',
      'true'
    );
  });
});

test.describe('Internet Radio — keyboard shortcuts', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await playRadioStation(window);
  });

  test('next-track shortcut (Control+ArrowRight) does nothing during radio playback', async ({
    navidromeApp: { window },
  }) => {
    const titleBefore = await window.locator('[data-testid="player-track-title"]').textContent();
    await window.keyboard.press('Control+ArrowRight');
    await window.waitForTimeout(1000);
    const titleAfter = await window.locator('[data-testid="player-track-title"]').textContent();
    expect(titleAfter).toBe(titleBefore);
    await expect(window.locator('[data-testid="player-live-indicator"]')).toBeVisible();
  });

  test('previous-track shortcut (Control+ArrowLeft) does nothing during radio playback', async ({
    navidromeApp: { window },
  }) => {
    const titleBefore = await window.locator('[data-testid="player-track-title"]').textContent();
    await window.keyboard.press('Control+ArrowLeft');
    await window.waitForTimeout(1000);
    const titleAfter = await window.locator('[data-testid="player-track-title"]').textContent();
    expect(titleAfter).toBe(titleBefore);
    await expect(window.locator('[data-testid="player-live-indicator"]')).toBeVisible();
  });

  test('play/pause shortcut (Control+P) still works during radio playback', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(30_000);
    await expect(window.locator('[data-testid="player-play-pause"]')).toHaveAttribute(
      'data-playing',
      'true',
      { timeout: 15_000 }
    );
    await window.keyboard.press('Control+P');
    await expect(window.locator('[data-testid="player-play-pause"]')).toHaveAttribute(
      'data-playing',
      'false'
    );
    await window.keyboard.press('Control+P');
    await expect(window.locator('[data-testid="player-play-pause"]')).toHaveAttribute(
      'data-playing',
      'true'
    );
  });

  test('volume shortcuts (Control+ArrowUp/Down) still work during radio playback', async ({
    navidromeApp: { window },
  }) => {
    // Default volume (setDefaultSettings.ts) is 1.0 — already at the ceiling,
    // so pressing volume-up first would be a no-op (Math.min(1, ...) clamps
    // it). Press down first to guarantee room to move in both directions
    // regardless of starting value.
    const before = Number(await window.locator('[data-testid="volume-slider"]').inputValue());
    await window.keyboard.press('Control+ArrowDown');
    await window.waitForTimeout(300);
    const afterDown = Number(await window.locator('[data-testid="volume-slider"]').inputValue());
    expect(afterDown).toBeLessThan(before);

    await window.keyboard.press('Control+ArrowUp');
    await window.waitForTimeout(300);
    const afterUp = Number(await window.locator('[data-testid="volume-slider"]').inputValue());
    expect(afterUp).toBeGreaterThan(afterDown);
  });
});
