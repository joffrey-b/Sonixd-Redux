import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Smart playlist sort — confirmed from source (SmartPlaylistEditor.tsx):
//   - SORT_OPTIONS is a fixed list: Play Count, Year, Rating, Duration, Random.
//     There is NO title or artist sort — the prompt's alphabetical-by-title/
//     artist premise doesn't correspond to any real feature. All 5 fixture
//     tracks also share year=2024 and durationSeconds=62 (constants.ts), so
//     Year/Duration sort would tie across the whole library anyway and
//     wouldn't be falsifiable even if they existed as concepts here.
//   - Rating is the only sort field that's both real and falsifiable with this
//     fixture, using the per-track 1-5 star rating UI shipped in the previous
//     session (rating.spec.ts) to assign distinct, known values.
//   - sort-field-select already existed (added for the genre/Jazz smart
//     playlist tests) as a hidden native <select>. sort-direction-select did
//     not exist — added this session as a sibling hidden <select>, same
//     pattern, wrapped together with its StyledInputPicker in a shared
//     position:relative parent (the AdvancedFilters.tsx review from the prior
//     session caught a sibling-vs-child positioning mistake in this exact
//     pattern — this implementation places the hidden select as a child of
//     the relatively-positioned div from the start).
//   - There is no inline "results" preview anywhere in the editor or list —
//     the prompt's playlist-result-entry testid doesn't exist. The only way
//     to observe which songs matched is to Play the playlist (replaces the
//     whole queue via setPlayQueue — confirmed in usePlayQueueHandler.ts) and
//     read the resulting queue, exactly like the existing queue-management
//     tests do via getByRole('row', { name }) + a settle wait (no per-row
//     testid exists in the rsuite-table-based queue view either).
//   - With no rules and a 5-song total library, fetchSmartPlaylistSongs's
//     no-cache fallback path (getRandomSongs with size >= 300) returns the
//     entire library every time, matching the established "No Rules Test"
//     pattern in smart-playlists.spec.ts — no genre/year rule is needed to
//     get all 5 tracks into the result set.

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

// Jazz=1, Solo=2, Test01=3, Test02=4, Test03=5 — a distinct, known value per
// track across all 3 albums, giving a fully falsifiable sort order.
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

async function createSortedSmartPlaylist(window: Page, name: string, direction: 'asc' | 'desc') {
  await window.click('[data-testid="nav-smart-playlists"]');
  await window.click('[data-testid="create-smart-playlist"]');
  await window.fill('[data-testid="playlist-name-input"]', name);
  await window.locator('[data-testid="sort-field-select"]').selectOption('rating');
  await window.locator('[data-testid="sort-direction-select"]').selectOption(direction);
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

const ALL_TITLES_LOWEST_FIRST = [
  TRACKS.jazzTrack.title,
  TRACKS.soloTrack.title,
  TRACKS.track01.title,
  TRACKS.track02.title,
  TRACKS.track03.title,
];

test.describe('Smart playlist — sort controls', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await setAllTrackRatings(window);
  });

  test('sort by rating ascending — lowest-rated track appears first', async ({
    navidromeApp: { window },
  }) => {
    await createSortedSmartPlaylist(window, 'Rating Asc', 'asc');
    await playPlaylist(window, 'Rating Asc');
    await openQueueView(window);

    const order = await getQueueOrder(window, ALL_TITLES_LOWEST_FIRST);
    expect(order).toEqual(ALL_TITLES_LOWEST_FIRST);
  });

  test('sort by rating descending — highest-rated track appears first', async ({
    navidromeApp: { window },
  }) => {
    await createSortedSmartPlaylist(window, 'Rating Desc', 'desc');
    await playPlaylist(window, 'Rating Desc');
    await openQueueView(window);

    const order = await getQueueOrder(window, ALL_TITLES_LOWEST_FIRST);
    expect(order).toEqual([...ALL_TITLES_LOWEST_FIRST].reverse());
  });

  test('changing sort direction reverses the result order', async ({
    navidromeApp: { window },
  }) => {
    await createSortedSmartPlaylist(window, 'Direction A', 'asc');
    await createSortedSmartPlaylist(window, 'Direction B', 'desc');

    await playPlaylist(window, 'Direction A');
    await openQueueView(window);
    const ascOrder = await getQueueOrder(window, ALL_TITLES_LOWEST_FIRST);
    // Close the queue view before navigating away from it.
    await window.click('[data-testid="player-queue-button"]');

    await playPlaylist(window, 'Direction B');
    await openQueueView(window);
    const descOrder = await getQueueOrder(window, ALL_TITLES_LOWEST_FIRST);

    expect(descOrder).toEqual([...ascOrder].reverse());
  });
});
