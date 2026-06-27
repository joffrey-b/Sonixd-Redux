import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Genres view — confirmed from source (GenreList.tsx):
//   - Double-click (useListClickHandler's doubleClick), not single click —
//     consistent with every other ListViewType-based view in this app.
//   - Opening a genre does NOT show a flat track list, as the prompt assumed.
//     handleRowDoubleClick dispatches setFilter({listType: Item.Album, data:
//     rowData.title}) and navigates to /library/album?sortType=<genre>. That
//     filter value flows into AlbumList.tsx's getAlbums call as the `type`
//     param; api.ts's getAlbums treats any type string that isn't one of the
//     known sort enums (alphabeticalByName/ByArtist/frequent/newest/recent)
//     as a genre name and requests type=byGenre&genre=<value> from
//     getAlbumList2.view. So opening "Electronic" lands on the ALBUM list
//     filtered to Electronic-genre ALBUMS (Test Album + Solo Album), not
//     individual tracks — confirmed by reading both GenreList.tsx and
//     api.ts's getAlbums together.
//   - genreListColumns defaults include title/albumCount/songCount, so genre
//     names and counts are visible without any column setup (unlike the
//     rating column gotcha from an earlier session).
//   - No per-row testid on genre/album entries (same ListViewTable
//     limitation as everywhere else) — matched via text=.

async function navigateToGenres(window: import('@playwright/test').Page) {
  await window.click('[data-testid="nav-genres"]');
  await expect(window.locator(`text=${TRACKS.track01.genre}`).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('Genres view', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await navigateToGenres(window);
  });

  test('genres view shows Electronic and Jazz genres', async ({ navidromeApp: { window } }) => {
    await expect(window.locator(`text=${TRACKS.track01.genre}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.jazzTrack.genre}`).first()).toBeVisible();
  });

  test('opening Electronic genre filters the album list to Electronic-genre albums', async ({
    navidromeApp: { window },
  }) => {
    await window.locator(`text=${TRACKS.track01.genre}`).first().dblclick();

    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(window.locator(`text=${TRACKS.soloTrack.album}`).first()).toBeVisible();

    // The Jazz album must NOT appear under the Electronic genre filter.
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`)).not.toBeVisible();
  });

  test('opening Jazz genre filters the album list to only the Jazz album', async ({
    navidromeApp: { window },
  }) => {
    await window.locator(`text=${TRACKS.jazzTrack.genre}`).first().dblclick();

    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`).first()).toBeVisible({
      timeout: 15_000,
    });

    // Neither Electronic album must appear under the Jazz genre filter.
    await expect(window.locator(`text=${TRACKS.track01.album}`)).not.toBeVisible();
    await expect(window.locator(`text=${TRACKS.soloTrack.album}`)).not.toBeVisible();
  });

  test('a track can be played from a genre-filtered album', async ({
    navidromeApp: { window },
  }) => {
    await window.locator(`text=${TRACKS.jazzTrack.genre}`).first().dblclick();
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`).first()).toBeVisible({
      timeout: 15_000,
    });

    await window.locator(`text=${TRACKS.jazzTrack.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.jazzTrack.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.jazzTrack.title,
      { timeout: 10_000 }
    );
  });
});
