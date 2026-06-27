import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Setting key: directPreviousTrack (default: false).
// Source: src/hooks/usePlayerControls.ts handlePrevTrack —
//   goToPrev = directPreviousTrack || (currentSeek < 5 && ...)
// enabled (true): previous ALWAYS jumps to the prior track, regardless of position.
// disabled (false, default): previous jumps back only if played < 5s into the
// current track; otherwise it restarts the current track at 0.

async function playTrack02FromTestAlbum(window: import('@playwright/test').Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track02.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  // Double-clicking a row queues the WHOLE album list with that row as
  // currentIndex (see AlbumView.tsx's doubleClick -> setPlayQueueByRowClick),
  // so track 01 is already queued immediately before track 02 — no need to
  // play track 01 first.
  await window.locator(`text=${TRACKS.track02.album}`).first().dblclick();
  await window.locator(`text=${TRACKS.track02.title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');
}

async function setDirectPreviousTrack(window: import('@playwright/test').Page, enabled: boolean) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-playback"]');
  // Click the outer testid'd element, not the inner input[type=checkbox] —
  // RSuite's Toggle renders a ".rs-toggle-track" visual overlay on top of the
  // actual (visually hidden) input, which intercepts pointer events aimed
  // directly at the input (confirmed via a real Playwright actionability
  // timeout). isChecked() still works via the same locator.
  const toggle = window.locator('[data-testid="direct-previous-track-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.isChecked()) !== enabled) {
    await toggle.click();
  }
  await window.click('[data-testid="nav-albums"]');
}

test.describe('Direct previous track setting', () => {
  test('enabled: previous button always jumps to the prior track', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    await setDirectPreviousTrack(window, true);
    await playTrack02FromTestAlbum(window);

    // Let it play well past the 5s threshold that would matter if the
    // setting were disabled.
    await window.waitForTimeout(8_000);

    await window.click('[data-testid="player-previous"]');
    await expect(window.locator('[data-testid="player-track-title"]')).toHaveText(
      TRACKS.track01.title,
      { timeout: 10_000 }
    );
  });

  test('disabled: previous restarts current track if played past the 5s threshold', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    await setDirectPreviousTrack(window, false);
    await playTrack02FromTestAlbum(window);

    // Play past the 5s threshold found in source.
    await window.waitForTimeout(8_000);

    await window.click('[data-testid="player-previous"]');

    // Still on track 02 — not jumped back to track 01.
    await expect(window.locator('[data-testid="player-track-title"]')).toHaveText(
      TRACKS.track02.title
    );
    // Restarted at (or very near) 0, not continuing from ~8s.
    await expect(window.locator('[data-testid="player-current-time"]')).toHaveText(/^0:0[01]$/, {
      timeout: 5_000,
    });
  });
});
