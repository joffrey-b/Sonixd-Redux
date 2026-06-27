import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Play Next / Play Later — confirmed from source:
//   - ContextMenu.tsx: context-menu-play-next (added in an earlier session)
//     and context-menu-play-later (added this session) both call
//     handleAddToQueue('next'|'later'), which dispatches appendPlayQueue.
//   - appendPlayQueue (playQueueSlice.ts): 'next' always inserts at
//     currentSongIndex + 1; if preservePlayNextOrder is enabled (default:
//     true, per setDefaultSettings.ts), insertion skips past any existing
//     "play next" block, preserving call order. 'later' always pushes to the
//     true end of the array in call order, REGARDLESS of
//     preservePlayNextOrder — that setting only affects 'next'.
//   - The queue view is NowPlayingMiniView.tsx (mounted globally in App.tsx,
//     toggled via the player bar's "Display Queue" button — added
//     player-queue-button testid), not a separate page. It renders through
//     the same generic ListViewType (rsuite-table) as every other list in
//     this app, with NO per-row testid available (same conclusion reached in
//     the earlier play-next-order.spec.ts session) — order is read via
//     getByRole('row', { name }) + a settle wait, not the
//     data-testid="queue-entry" the original prompt guessed, which doesn't
//     exist anywhere in the queue rendering.
//   - Starting from "Test Album" (track01/02/03) would auto-queue track02 and
//     track03 immediately behind track01 (AlbumView.tsx's
//     setPlayQueueByRowClick queues the WHOLE album), so right-clicking
//     track02/03 afterward would insert a SECOND, duplicate copy alongside
//     the one already auto-queued — ambiguous for order assertions. Instead,
//     start from the single-track Solo Album (clean queue, nothing after
//     current) and use Play Next/Play Later on Test Album's tracks from
//     there — the same pattern already proven in play-next-order.spec.ts.

async function playSoloTrack(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.soloTrack.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.soloTrack.album}`).first().dblclick();
  await window.locator(`text=${TRACKS.soloTrack.title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');
}

async function navigateToTestAlbum(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
}

async function addToQueue(window: Page, trackTitle: string, action: 'next' | 'later') {
  await window.locator(`text=${trackTitle}`).first().click({ button: 'right' });
  const testid = action === 'next' ? 'context-menu-play-next' : 'context-menu-play-later';
  await expect(window.locator(`[data-testid="${testid}"]`)).toBeVisible({ timeout: 5_000 });
  await window.click(`[data-testid="${testid}"]`);
}

async function openQueueView(window: Page) {
  await window.click('[data-testid="player-queue-button"]');
  // Settle wait — boundingBox() has previously returned null fast right after
  // a row-reorder, even when toBeVisible() on the same locator passed (see
  // project_e2e_playwright_gotchas memory). Give the virtualized table a
  // moment to finish rendering before reading row positions.
  await window.waitForTimeout(1_000);
}

async function getQueueOrder(window: Page, titles: string[]): Promise<string[]> {
  const positioned: { title: string; y: number }[] = [];
  for (const title of titles) {
    const row = window.getByRole('row', { name: title }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    const box = await row.boundingBox();
    if (!box) throw new Error(`Could not find "${title}" in the queue view`);
    positioned.push({ title, y: box.y });
  }
  return positioned.sort((a, b) => a.y - b.y).map((p) => p.title);
}

test.describe('Play next', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await playSoloTrack(window);
    await navigateToTestAlbum(window);
  });

  test('Play Next inserts the track immediately after the current track', async ({
    navidromeApp: { window },
  }) => {
    await addToQueue(window, TRACKS.track02.title, 'next');
    await openQueueView(window);

    const order = await getQueueOrder(window, [TRACKS.soloTrack.title, TRACKS.track02.title]);
    expect(order).toEqual([TRACKS.soloTrack.title, TRACKS.track02.title]);
  });

  test('Play Next called multiple times produces the correct order', async ({
    navidromeApp: { window },
  }) => {
    // preservePlayNextOrder defaults to true — insertion order is preserved.
    await addToQueue(window, TRACKS.track02.title, 'next');
    await addToQueue(window, TRACKS.track03.title, 'next');
    await openQueueView(window);

    const order = await getQueueOrder(window, [
      TRACKS.soloTrack.title,
      TRACKS.track02.title,
      TRACKS.track03.title,
    ]);
    expect(order).toEqual([TRACKS.soloTrack.title, TRACKS.track02.title, TRACKS.track03.title]);
  });
});

test.describe('Play later', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await playSoloTrack(window);
    await navigateToTestAlbum(window);
  });

  test('Play Later appends the track to the end of the queue', async ({
    navidromeApp: { window },
  }) => {
    await addToQueue(window, TRACKS.track02.title, 'later');
    await openQueueView(window);

    const order = await getQueueOrder(window, [TRACKS.soloTrack.title, TRACKS.track02.title]);
    expect(order).toEqual([TRACKS.soloTrack.title, TRACKS.track02.title]);
  });

  test('Play Later called multiple times appends in call order', async ({
    navidromeApp: { window },
  }) => {
    // 'later' always appends in call order, independent of preservePlayNextOrder.
    await addToQueue(window, TRACKS.track02.title, 'later');
    await addToQueue(window, TRACKS.track03.title, 'later');
    await openQueueView(window);

    const order = await getQueueOrder(window, [
      TRACKS.soloTrack.title,
      TRACKS.track02.title,
      TRACKS.track03.title,
    ]);
    expect(order).toEqual([TRACKS.soloTrack.title, TRACKS.track02.title, TRACKS.track03.title]);
  });
});

test('Play Next and Play Later produce the expected combined queue order', async ({
  navidromeApp: { window },
}) => {
  await playSoloTrack(window);
  await navigateToTestAlbum(window);

  await addToQueue(window, TRACKS.track02.title, 'next');
  await addToQueue(window, TRACKS.track03.title, 'later');
  await openQueueView(window);

  const order = await getQueueOrder(window, [
    TRACKS.soloTrack.title,
    TRACKS.track02.title,
    TRACKS.track03.title,
  ]);
  expect(order).toEqual([TRACKS.soloTrack.title, TRACKS.track02.title, TRACKS.track03.title]);
});
