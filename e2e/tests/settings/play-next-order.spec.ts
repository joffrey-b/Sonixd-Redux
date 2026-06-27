import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Setting key: preservePlayNextOrder (default: true).
// Source: src/redux/playQueueSlice.ts appendPlayQueue — insertIndex is always
// currentSongIndex + 1. When the setting is enabled, insertion skips past any
// already-queued "play next" entries (playNextBlock), preserving the order
// they were added in. When disabled, each new "Play Next" always inserts
// immediately after current, pushing earlier "play next" insertions further
// back — so for A, B, C clicked in that order, the resulting order is C, B, A.

async function setPreservePlayNextOrder(window: Page, enabled: boolean) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-playback"]');
  // Click the outer testid'd element, not the inner input[type=checkbox] —
  // RSuite's Toggle renders a ".rs-toggle-track" visual overlay on top of the
  // actual (visually hidden) input, which intercepts pointer events aimed
  // directly at the input (confirmed via a real Playwright actionability
  // timeout). isChecked() still works via the same locator.
  const toggle = window.locator('[data-testid="preserve-play-next-order-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.isChecked()) !== enabled) {
    await toggle.click();
  }
}

async function playNextTracksAandBandC(window: Page) {
  // Start playback on the single-track Solo Album so the queue begins clean —
  // nothing already queued after the current track (avoids entanglement with
  // the rest of "Test Album" auto-queuing behind track 01/02/03).
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.soloTrack.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.soloTrack.album}`).first().dblclick();
  await window.locator(`text=${TRACKS.soloTrack.title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');

  // Navigate to Test Album and queue track01 (A), track02 (B), track03 (C),
  // in that order, via the right-click "Add to queue (next)" menu item.
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

  for (const track of [TRACKS.track01, TRACKS.track02, TRACKS.track03]) {
    await window.locator(`text=${track.title}`).first().click({ button: 'right' });
    await expect(window.locator('[data-testid="context-menu-play-next"]')).toBeVisible({
      timeout: 5_000,
    });
    await window.click('[data-testid="context-menu-play-next"]');
  }
}

// No per-row testid exists on the generic list/table used by the Now Playing
// view (it's shared across album/playlist/queue views). A plain `text=`
// locator on the title turned out unreliable here — it intermittently
// resolved to a non-visible match in the underlying rsuite-table grid
// (boundingBox() came back null fast, not a timeout, so the locator found
// *something*, just not the rendered row). Each grid row has a real,
// visible bounding box and a stable accessible name, so order is derived
// from rows' vertical position via the ARIA "row" role instead.
async function getQueueOrder(window: Page, titles: string[]): Promise<string[]> {
  const positioned: { title: string; y: number }[] = [];
  for (const title of titles) {
    const row = window.getByRole('row', { name: title }).first();
    // boundingBox() alone returned null fast (not a timeout) on a freshly
    // navigated queue view — it doesn't poll for visibility the way
    // expect(...).toBeVisible() does. Wait for visibility explicitly first
    // to absorb that render/settle gap, then measure.
    await expect(row).toBeVisible({ timeout: 10_000 });
    const box = await row.boundingBox();
    if (!box) throw new Error(`Could not find "${title}" in the queue view`);
    positioned.push({ title, y: box.y });
  }
  return positioned.sort((a, b) => a.y - b.y).map((p) => p.title);
}

test.describe('Preserve play next order setting', () => {
  test('enabled: play next preserves insertion order (A, B, C)', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    await setPreservePlayNextOrder(window, true);
    await playNextTracksAandBandC(window);

    // Open the queue view.
    await window.click('[data-testid="player-track-title"]');
    // Give the table's row-reorder transition time to settle — boundingBox()
    // returned null right after a passing toBeVisible() check on the same
    // locator without this, suggesting the virtualized rows were still
    // repositioning between the two round-trips.
    await window.waitForTimeout(1_000);

    const order = await getQueueOrder(window, [
      TRACKS.track01.title,
      TRACKS.track02.title,
      TRACKS.track03.title,
    ]);
    expect(order).toEqual([TRACKS.track01.title, TRACKS.track02.title, TRACKS.track03.title]);
  });

  test('disabled: each play next inserts immediately after current (C, B, A)', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    await setPreservePlayNextOrder(window, false);
    await playNextTracksAandBandC(window);

    await window.click('[data-testid="player-track-title"]');
    // Give the table's row-reorder transition time to settle — boundingBox()
    // returned null right after a passing toBeVisible() check on the same
    // locator without this, suggesting the virtualized rows were still
    // repositioning between the two round-trips.
    await window.waitForTimeout(1_000);

    const order = await getQueueOrder(window, [
      TRACKS.track01.title,
      TRACKS.track02.title,
      TRACKS.track03.title,
    ]);
    expect(order).toEqual([TRACKS.track03.title, TRACKS.track02.title, TRACKS.track01.title]);
  });
});
