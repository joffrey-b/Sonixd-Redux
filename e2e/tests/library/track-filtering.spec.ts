import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Track filtering — the prompt's guessed grep targets (trackFilter/
// playbackFilter) turned out to point at a different feature entirely:
// "playbackFilters" (PlayerConfig.tsx / shared/utils.ts filterPlayQueue) is a
// regex TITLE-EXCLUSION filter applied only when bulk-adding to the queue
// (random playlists) — it has no effect on what's visible while browsing.
//
// The real feature matching "filter the visible library" is
// AdvancedFilters.tsx, opened via a FilterButton on the Albums (and Artist/
// Playlist/Starred) list views — NOT the Songs page, which has no such
// control. It operates at ALBUM granularity: selecting genre "Electronic"
// filters which ALBUMS are shown, not individual track rows. For this
// fixture, Electronic spans two albums (Test Album: track01-03, Solo Album:
// soloTrack) while Jazz is one album (Jazz Album: jazzTrack) — the
// Electronic/Jazz falsifiability the prompt wants is exercised via ALBUM
// names rather than individual track titles, since that's the actual
// granularity this feature filters at.
//
// useAdvancedFilter.ts confirmed the master "enabled" toggle gates
// everything — if disabled, filteredData = data (everything) regardless of
// what's selected in genre/artist/year. Genre selection is a CheckPicker
// (multi-select, not a single dropdown), tested via a hidden native
// <select multiple> workaround (album-filter-genre-select) added this
// session — the established hidden-native-select pattern used elsewhere for
// single-select pickers, extended to multi-select. Year is a plain
// from/to StyledInputNumber pair (RSuite — needs the `input` descendant for
// .fill(), per the established gotcha).

async function navigateToAlbums(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function openFilterPanel(window: Page) {
  await window.click('[data-testid="album-filter-button"]');
  const toggle = window.locator('[data-testid="album-filter-enabled-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 5_000 });
  if (!(await toggle.isChecked())) await toggle.click();
}

test.describe('Track filtering', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await navigateToAlbums(window);
    await openFilterPanel(window);
  });

  test('filtering by genre shows only matching albums', async ({ navidromeApp: { window } }) => {
    await window.selectOption('[data-testid="album-filter-genre-select"]', ['Electronic']);
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.soloTrack.album}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`)).not.toBeVisible();
  });

  test('filtering by Jazz genre shows only the Jazz album', async ({
    navidromeApp: { window },
  }) => {
    await window.selectOption('[data-testid="album-filter-genre-select"]', ['Jazz']);
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.track01.album}`)).not.toBeVisible();
  });

  test('clearing a filter restores the full library view', async ({ navidromeApp: { window } }) => {
    await window.selectOption('[data-testid="album-filter-genre-select"]', ['Electronic']);
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`)).not.toBeVisible();

    await window.click('[data-testid="album-filter-genre-reset-button"]');
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible();
  });

  test('filtering by year shows only albums from that year', async ({
    navidromeApp: { window },
  }) => {
    // All test albums are year 2024.
    await window.fill('[data-testid="album-filter-year-from"] input', '2024');
    await window.fill('[data-testid="album-filter-year-to"] input', '2024');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`).first()).toBeVisible();

    // An absent year should show nothing.
    await window.fill('[data-testid="album-filter-year-from"] input', '2000');
    await window.fill('[data-testid="album-filter-year-to"] input', '2000');
    await expect(window.locator(`text=${TRACKS.track01.album}`)).not.toBeVisible();
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`)).not.toBeVisible();
  });
});
