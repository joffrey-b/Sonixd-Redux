import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Smart playlist limit — confirmed from source (SmartPlaylistEditor.tsx):
//   - Limit is a plain StyledInputNumber (RSuite InputNumber) — no testid
//     existed, added playlist-limit-input this session. Per the established
//     gotcha, the testid lands on the outer .rs-input-group wrapper, so
//     interaction goes through the descendant `input` (same pattern as
//     album-filter-year-from/to).
//   - useSmartPlaylist.ts applies the limit via a client-side .slice(0,
//     limit) AFTER sorting — the server fetch itself always requests up to
//     500 songs regardless of the playlist's limit, so the limit only
//     truncates the already-sorted result. This makes the sort+limit
//     interaction test meaningful: limit isn't just "fetch fewer", it's
//     "keep the first N of the sorted set".
//   - Same reasoning as smart-playlist-sort.spec.ts: there's no inline
//     results list, so membership/count is verified via the actual play
//     queue (Play replaces the whole queue per usePlayQueueHandler.ts).
//   - Sorting by rating (rather than leaving the default sort=playCount,
//     which filters out every unplayed song down to nothing) requires
//     distinct per-track ratings, reusing the rating UI from rating.spec.ts.

async function ensureRatingColumnVisible(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-lookandfeel"]');
  const picker = window.locator('[data-testid="column-picker-music"]');
  await expect(picker).toBeVisible({ timeout: 10_000 });
  await picker.click();
  await window.getByText('Rating', { exact: true }).click();
  await window.keyboard.press('Escape');
}

async function navigateToAlbum(window: Page, albumTitle: string) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${albumTitle}`).first()).toBeVisible({ timeout: 15_000 });
  await window.locator(`text=${albumTitle}`).first().dblclick();
}

function star(window: Page, trackTitle: string, posinset: number) {
  return window
    .getByRole('row', { name: trackTitle })
    .getByRole('radiogroup')
    .locator(`[aria-posinset="${posinset}"]`);
}

async function setRating(window: Page, trackTitle: string, value: number) {
  const target = star(window, trackTitle, value);
  // Ratings persist on the Navidrome server across test runs (confirmed in
  // rating.spec.ts's restart-persistence test) — a track may already be at
  // this exact value from a previous run. Rate's cleanable default (true)
  // means clicking an already-active star CLEARS it instead of being a
  // harmless no-op re-set, so this must be idempotent: skip the click
  // entirely when the target is already checked.
  if ((await target.getAttribute('aria-checked')) === 'true') return;
  await target.click();
  await expect(target).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
  // Settle wait — useRating.ts's handleRating does several sequential awaited
  // steps after the setRating API call resolves (cache update, two
  // refetchQueries calls, two Redux dispatches) before the star's
  // aria-checked value is guaranteed stable. Clicking the next star in the
  // same album immediately after this resolves has intermittently raced
  // that tail in practice.
  await window.waitForTimeout(500);
}

// Jazz=1, Solo=2, Test01=3, Test02=4, Test03=5 — ascending-rating order is
// [Jazz, Solo, Test01, Test02, Test03].
async function setAllTrackRatings(window: Page) {
  await ensureRatingColumnVisible(window);

  await navigateToAlbum(window, TRACKS.track01.album);
  await setRating(window, TRACKS.track01.title, 3);
  await setRating(window, TRACKS.track02.title, 4);
  await setRating(window, TRACKS.track03.title, 5);

  await navigateToAlbum(window, TRACKS.soloTrack.album);
  await setRating(window, TRACKS.soloTrack.title, 2);

  await navigateToAlbum(window, TRACKS.jazzTrack.album);
  await setRating(window, TRACKS.jazzTrack.title, 1);
}

async function createSmartPlaylist(window: Page, options: { name: string; limit?: number }) {
  await window.click('[data-testid="nav-smart-playlists"]');
  await window.click('[data-testid="create-smart-playlist"]');
  await window.fill('[data-testid="playlist-name-input"]', options.name);
  await window.locator('[data-testid="sort-field-select"]').selectOption('rating');
  await window.locator('[data-testid="sort-direction-select"]').selectOption('asc');
  if (options.limit !== undefined) {
    await window.fill('[data-testid="playlist-limit-input"] input', String(options.limit));
  }
  await window.click('[data-testid="save-playlist"]');
}

async function playPlaylist(window: Page, name: string) {
  await window.click('[data-testid="nav-smart-playlists"]');
  const row = window.locator('[data-testid="smart-playlist-row"]').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.locator('[data-testid="playlist-play-btn"]').click();
  await expect(window.locator('[data-testid="player-bar"]')).toBeVisible({ timeout: 10_000 });
}

async function openQueueView(window: Page) {
  await window.click('[data-testid="player-queue-button"]');
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

const ALL_TITLES = [
  TRACKS.jazzTrack.title,
  TRACKS.soloTrack.title,
  TRACKS.track01.title,
  TRACKS.track02.title,
  TRACKS.track03.title,
];

test.describe('Smart playlist — limit controls', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await setAllTrackRatings(window);
  });

  test('no limit override — all 5 test tracks appear in the queue', async ({
    navidromeApp: { window },
  }) => {
    await createSmartPlaylist(window, { name: 'No Limit' });
    await playPlaylist(window, 'No Limit');
    await openQueueView(window);

    for (const title of ALL_TITLES) {
      await expect(window.getByRole('row', { name: title }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('limit of 2 — only the 2 lowest-rated tracks appear', async ({
    navidromeApp: { window },
  }) => {
    await createSmartPlaylist(window, { name: 'Limit Two', limit: 2 });
    await playPlaylist(window, 'Limit Two');
    await openQueueView(window);

    await expect(window.getByRole('row', { name: TRACKS.jazzTrack.title }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByRole('row', { name: TRACKS.soloTrack.title }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByRole('row', { name: TRACKS.track01.title })).not.toBeVisible();
    await expect(window.getByRole('row', { name: TRACKS.track02.title })).not.toBeVisible();
    await expect(window.getByRole('row', { name: TRACKS.track03.title })).not.toBeVisible();
  });

  test('limit of 3 — only the 3 lowest-rated tracks appear', async ({
    navidromeApp: { window },
  }) => {
    await createSmartPlaylist(window, { name: 'Limit Three', limit: 3 });
    await playPlaylist(window, 'Limit Three');
    await openQueueView(window);

    await expect(window.getByRole('row', { name: TRACKS.jazzTrack.title }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByRole('row', { name: TRACKS.soloTrack.title }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByRole('row', { name: TRACKS.track01.title }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByRole('row', { name: TRACKS.track02.title })).not.toBeVisible();
    await expect(window.getByRole('row', { name: TRACKS.track03.title })).not.toBeVisible();
  });

  test('limit larger than the result set — all 5 matching tracks still appear', async ({
    navidromeApp: { window },
  }) => {
    await createSmartPlaylist(window, { name: 'Limit Big', limit: 100 });
    await playPlaylist(window, 'Limit Big');
    await openQueueView(window);

    for (const title of ALL_TITLES) {
      await expect(window.getByRole('row', { name: title }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('sort and limit interact correctly — limit applies to the sorted set', async ({
    navidromeApp: { window },
  }) => {
    await createSmartPlaylist(window, { name: 'Sorted Limit', limit: 2 });
    await playPlaylist(window, 'Sorted Limit');
    await openQueueView(window);

    // The 2 lowest-rated tracks, in ascending order.
    const order = await getQueueOrder(window, [TRACKS.jazzTrack.title, TRACKS.soloTrack.title]);
    expect(order).toEqual([TRACKS.jazzTrack.title, TRACKS.soloTrack.title]);

    // And the rest of the library must be excluded, not just de-prioritized.
    await expect(window.getByRole('row', { name: TRACKS.track01.title })).not.toBeVisible();
    await expect(window.getByRole('row', { name: TRACKS.track02.title })).not.toBeVisible();
    await expect(window.getByRole('row', { name: TRACKS.track03.title })).not.toBeVisible();
  });
});
