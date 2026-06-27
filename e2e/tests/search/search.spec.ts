import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Search — confirmed from source (SearchBar.tsx, SearchView.tsx, api.ts):
//   - getSearch hits Subsonic's search3.view (substring match across
//     title/artist/album). "Jazz" uniquely matches the Jazz track, Jazz
//     Album, and Jazz Artist in one query — nothing else in the fixture
//     contains "Jazz" — the same falsification anchor used for genre/artist
//     tests all session, now for search.
//   - The popup (nav-search/search-input, both already testid'd) queries
//     songs/albums/artists in parallel, capped at 3 results each, only when
//     debouncedSearchQuery is non-empty and the "Search library" checkbox
//     (searchOptions.global, default true) is on.
//   - Clicking a SONG result's row navigates to that song's ALBUM
//     (handleClick does navigate(`/library/album/${albumId}`)), not direct
//     playback — the play button is a separate, hover-revealed control
//     (display:none until :hover) inside the same row. Clicking an
//     album/artist result navigates to that album/artist page directly.
//   - Result title text (e.g. an artist's own "Jazz Artist" title div) is
//     rendered in its own isolated div with nothing else in it, so
//     getByText(..., { exact: true }) only matches that one place — even
//     though the SAME string also appears embedded inside other results'
//     combined subtitle line (e.g. a song's details: "2024 • Jazz Artist •
//     Jazz Album" as one combined text node), exact matching requires the
//     whole element's text to equal the string, which the combined
//     subtitle line never does. Confirmed by reading how SearchResult
//     renders title vs details.
//   - The popup overlays the current page rather than replacing it, so its
//     content could otherwise collide with identical text already visible
//     on the underlying page (e.g. an Albums grid also showing "Jazz
//     Album") — scoped all popup assertions to search-results-popup
//     (added this session; the popup's container had no testid before).
//   - "View all results" (added search-view-all-button this session)
//     navigates to /search?query=..., the full SearchView page — three
//     tabs (Songs/Albums/Artists, no testids before this session — added
//     search-tab-songs/albums/artists) each rendering through the same
//     ListViewType/double-click convention as every other view in this
//     suite. Its own input had no testid — added search-page-input.
//   - Skipped: clicking the hover-revealed play button directly from a
//     search result. That's the same PlayButton already covered
//     extensively elsewhere (Albums/Artists/Genres/Folders) — the new,
//     search-specific value is in finding the right things and navigating
//     correctly, not re-proving playback works.

function searchPopup(window: Page) {
  return window.locator('[data-testid="search-results-popup"]');
}

async function searchFor(window: Page, query: string) {
  await window.click('[data-testid="nav-search"]');
  await window.fill('[data-testid="search-input"]', query);
  // Settle wait — 300ms debounce plus the 3 parallel network round-trips.
  await window.waitForTimeout(1_000);
}

test.describe('Search', () => {
  test('search popup shows results across songs, albums, and artists for a matching query', async ({
    navidromeApp: { window },
  }) => {
    await searchFor(window, 'Jazz');

    await expect(
      searchPopup(window).getByText(TRACKS.jazzTrack.title, { exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      searchPopup(window).getByText(TRACKS.jazzTrack.album, { exact: true })
    ).toBeVisible();
    await expect(
      searchPopup(window).getByText(TRACKS.jazzTrack.artist, { exact: true })
    ).toBeVisible();
  });

  test('search popup shows no results for a non-matching query', async ({
    navidromeApp: { window },
  }) => {
    await searchFor(window, 'xyzzyNoSuchTrackOrArtist');
    await expect(searchPopup(window).getByText('No results found')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('clicking a song result navigates to its album', async ({ navidromeApp: { window } }) => {
    await searchFor(window, 'Jazz');
    await searchPopup(window).getByText(TRACKS.jazzTrack.title, { exact: true }).click();

    // The popup closes and the album detail page shows the same track.
    await expect(searchPopup(window)).not.toBeVisible({ timeout: 10_000 });
    await expect(window.getByText(TRACKS.jazzTrack.title, { exact: true })).toBeVisible();
    await expect(window.locator('[data-testid="album-filter-button"]')).not.toBeVisible();
  });

  test('clicking an album result navigates to that album', async ({ navidromeApp: { window } }) => {
    await searchFor(window, 'Jazz');
    await searchPopup(window).getByText(TRACKS.jazzTrack.album, { exact: true }).click();

    await expect(window.getByText(TRACKS.jazzTrack.title, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('clicking an artist result navigates to that artist', async ({
    navidromeApp: { window },
  }) => {
    await searchFor(window, 'Jazz');
    await searchPopup(window).getByText(TRACKS.jazzTrack.artist, { exact: true }).click();

    await expect(window.locator('[data-testid="view-discography-button"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('"View all results" opens the full search page', async ({ navidromeApp: { window } }) => {
    await searchFor(window, 'Jazz');
    await window.click('[data-testid="search-view-all-button"]');

    await expect(window.locator('[data-testid="search-tab-songs"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByText(TRACKS.jazzTrack.title, { exact: true })).toBeVisible();
  });

  test('full search page tabs show matching results per category', async ({
    navidromeApp: { window },
  }) => {
    await searchFor(window, 'Jazz');
    await window.click('[data-testid="search-view-all-button"]');
    await expect(window.locator('[data-testid="search-tab-songs"]')).toBeVisible({
      timeout: 10_000,
    });

    // Songs tab is the default.
    await expect(window.getByText(TRACKS.jazzTrack.title, { exact: true })).toBeVisible();

    await window.click('[data-testid="search-tab-albums"]');
    await expect(window.getByText(TRACKS.jazzTrack.album, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await window.click('[data-testid="search-tab-artists"]');
    await expect(window.getByText(TRACKS.jazzTrack.artist, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('full search page shows no results for a non-matching query', async ({
    navidromeApp: { window },
  }) => {
    // "View all results" only renders when the popup actually has results
    // (it's in the else-branch of the same conditional as "No results
    // found" — confirmed in SearchBar.tsx), so a non-matching query can't
    // reach the full page through it. Reach the full page via a matching
    // query first, then change to a non-matching one using the page's own
    // search-page-input.
    await searchFor(window, 'Jazz');
    await window.click('[data-testid="search-view-all-button"]');
    await expect(window.locator('[data-testid="search-tab-songs"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByText(TRACKS.jazzTrack.title, { exact: true })).toBeVisible();

    await window.fill('[data-testid="search-page-input"]', 'xyzzyNoSuchTrackOrArtist');
    await window.waitForTimeout(800);

    await expect(window.getByText(TRACKS.jazzTrack.title, { exact: true })).not.toBeVisible();
  });
});
