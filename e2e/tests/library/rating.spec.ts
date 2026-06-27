import { _electron as electronLauncher } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Rating UI — confirmed from source:
//   - StyledRate (RSuite's Rate component) in ListViewTable.tsx's userRating
//     column. No data-testid anywhere, but RSuite renders genuine ARIA
//     semantics directly (confirmed via node_modules/rsuite source):
//     role="radiogroup" wrapping 5 role="radio" children, each with
//     aria-posinset={1..5} and aria-checked={value === posinset}. Scoped via
//     getByRole('row', { name: title }).getByRole('radiogroup') — no new
//     testids needed for this one.
//   - cleanable defaults to true and is NOT overridden here, so clicking the
//     currently-active star clears the rating to 0 (confirmed directly from
//     RSuite's Rate.js handleChangeValue cleanable branch).
//   - Persisted via useRating.ts's handleRating, which AWAITS
//     apiController({ endpoint: 'setRating', args: { ids, rating } }) —
//     calling Navidrome's /setRating.view?id=...&rating=... — BEFORE
//     updating the React Query cache/Redux. Not optimistic at the network
//     layer (though local Navidrome responds fast); the visual star state
//     only updates once the cache write lands, so all assertions below use
//     auto-retrying locator matchers rather than synchronous reads.
//   - The cache update only happens because the queryKey is passed through —
//     confirmed AlbumView.tsx wires handleRating with queryKey: ['album',
//     albumId], so the view this test uses does get the visual refresh.
//   - AlbumView.tsx's track list uses config.lookAndFeel.listView.music.columns
//     (musicListColumns) for its columns — and the DEFAULT musicListColumns
//     (setDefaultSettings.ts) does NOT include Rating at all (only #, title,
//     album, duration, bitRate, starred). The rating widget never renders
//     until that column is added via the List View Layout Editor — confirmed
//     by an actual run timing out trying to find it. Done once per test via
//     the real column-picker UI rather than guessing at a hidden-select
//     workaround, since the underlying onChange handler does non-trivial
//     column-list reconciliation that's safer to exercise for real.

async function ensureRatingColumnVisible(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-lookandfeel"]');
  const picker = window.locator('[data-testid="column-picker-music"]');
  await expect(picker).toBeVisible({ timeout: 10_000 });
  await picker.click();
  await window.getByText('Rating', { exact: true }).click();
  // Click away to close the dropdown.
  await window.keyboard.press('Escape');
}

async function navigateToTestAlbum(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
}

function ratingWidget(window: Page, trackTitle: string) {
  return window.getByRole('row', { name: trackTitle }).getByRole('radiogroup');
}

function star(window: Page, trackTitle: string, posinset: number) {
  return ratingWidget(window, trackTitle).locator(`[aria-posinset="${posinset}"]`);
}

async function clickStar(window: Page, trackTitle: string, posinset: number) {
  await star(window, trackTitle, posinset).click();
}

// Ratings persist server-side on Navidrome across every test file, not just
// within this one (confirmed in the "persists across app restart" test
// below) — other spec files in this suite (smart-playlist-sort.spec.ts,
// smart-playlist-limit.spec.ts) deliberately set distinct ratings on these
// same tracks to use as a sort key. Running the full suite, not just this
// file in isolation, can leave track01/track02 at a leftover non-zero
// rating before this file's own beforeEach runs, which breaks tests that
// assume a fresh/unrated starting point — confirmed by a real full-suite
// run failing exactly where that assumption was implicit. Clicking the
// CURRENTLY-active star clears it (cleanable defaults true), so detect
// whatever's checked right now and clear it, rather than assuming 0.
//
// .count() does not auto-wait/retry the way expect() matchers do — calling
// it immediately after navigating into the album can read 0 simply because
// the row/rating widget hasn't rendered yet (getAlbum hasn't resolved),
// not because the rating is genuinely unrated. A first version of this
// helper without the toBeVisible wait below intermittently skipped a
// needed reset for exactly that reason, reproducing the same "leftover
// rating from another test" failure this helper exists to prevent.
async function resetRating(window: Page, trackTitle: string) {
  const widget = ratingWidget(window, trackTitle);
  await expect(widget).toBeVisible({ timeout: 15_000 });
  const checkedStar = widget.locator('[aria-checked="true"]');
  if ((await checkedStar.count()) > 0) {
    await checkedStar.click();
    await expect(widget.locator('[aria-checked="true"]')).toHaveCount(0, { timeout: 10_000 });
  }
}

test.describe('Track ratings', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await ensureRatingColumnVisible(window);
    await navigateToTestAlbum(window);
    await resetRating(window, TRACKS.track01.title);
    await resetRating(window, TRACKS.track02.title);
  });

  test('clicking a star sets the rating to that value', async ({ navidromeApp: { window } }) => {
    await clickStar(window, TRACKS.track01.title, 3);
    await expect(star(window, TRACKS.track01.title, 3)).toHaveAttribute('aria-checked', 'true');
  });

  test('clicking a different star changes the rating', async ({ navidromeApp: { window } }) => {
    await clickStar(window, TRACKS.track01.title, 3);
    await expect(star(window, TRACKS.track01.title, 3)).toHaveAttribute('aria-checked', 'true');

    await clickStar(window, TRACKS.track01.title, 5);
    await expect(star(window, TRACKS.track01.title, 5)).toHaveAttribute('aria-checked', 'true');
    await expect(star(window, TRACKS.track01.title, 3)).toHaveAttribute('aria-checked', 'false');
  });

  test('clicking the currently active star clears the rating to 0', async ({
    navidromeApp: { window },
  }) => {
    await clickStar(window, TRACKS.track01.title, 3);
    await expect(star(window, TRACKS.track01.title, 3)).toHaveAttribute('aria-checked', 'true');

    await clickStar(window, TRACKS.track01.title, 3);
    await expect(
      ratingWidget(window, TRACKS.track01.title).locator('[aria-checked="true"]')
    ).toHaveCount(0);
  });

  test('ratings are distinct per track — setting one does not affect another', async ({
    navidromeApp: { window },
  }) => {
    await expect(
      ratingWidget(window, TRACKS.track02.title).locator('[aria-checked="true"]')
    ).toHaveCount(0);

    await clickStar(window, TRACKS.track01.title, 4);
    await expect(star(window, TRACKS.track01.title, 4)).toHaveAttribute('aria-checked', 'true');
    await expect(
      ratingWidget(window, TRACKS.track02.title).locator('[aria-checked="true"]')
    ).toHaveCount(0);
  });

  test('rating persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await clickStar(window, TRACKS.track01.title, 5);
    await expect(star(window, TRACKS.track01.title, 5)).toHaveAttribute('aria-checked', 'true');

    await app.close();
    const app2 = await electronLauncher.launch({
      executablePath: ELECTRON_BIN,
      args: [MAIN_JS],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DISPLAY: process.env.DISPLAY || ':99',
        SONIXD_USER_DATA: userDataDir,
      },
    });
    const w2 = await app2.firstWindow();
    await w2.waitForSelector('[data-testid="nav-albums"]');
    await navigateToTestAlbum(w2);
    await expect(star(w2, TRACKS.track01.title, 5)).toHaveAttribute('aria-checked', 'true');
    await app2.close();
  });

  test('rating is reflected in the Navidrome API', async ({ navidromeApp: { window } }) => {
    const ratingRequestPromise = window.waitForRequest(
      (req) => req.url().includes('/rest/setRating.view'),
      { timeout: 10_000 }
    );
    await clickStar(window, TRACKS.track01.title, 2);
    const req = await ratingRequestPromise;
    const url = new URL(req.url());
    expect(url.searchParams.get('rating')).toBe('2');
  });
});
