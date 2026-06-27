import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Artists view — confirmed from source (ArtistList.tsx, ArtistView.tsx):
//   - Double-click an artist row navigates to /library/artist/:id — the
//     OVERVIEW page, not a direct album list as the prompt assumed.
//   - artistPageLegacy defaults to false (setDefaultSettings.ts), so the
//     overview page is what actually renders: "View Discography"/"View All
//     Songs" buttons, a Top Songs panel, and a "Latest Albums" horizontal
//     ScrollingMenu (which WOULD already show each test artist's one album
//     as a card, since it only slices the first 15). Deliberately not
//     relying on that scroller though — it's a different click pattern
//     (Card navigation, not the double-click ListViewType convention used
//     everywhere else) and would silently stop covering an artist's full
//     discography if a future fixture artist ever has >15 albums. Instead,
//     clicking "View Discography" (no testid existed — added
//     view-discography-button) navigates to /library/artist/:id/albums,
//     which renders the same ListViewType/double-click album list as
//     AlbumList.tsx — consistent with the rest of this suite.
//   - artistListColumns defaults include title, so artist names are visible
//     without any column setup.

async function navigateToArtists(window: import('@playwright/test').Page) {
  await window.click('[data-testid="nav-artists"]');
  await expect(window.locator(`text=${TRACKS.track01.artist}`).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function openArtistDiscography(window: import('@playwright/test').Page, artist: string) {
  await window.locator(`text=${artist}`).first().dblclick();
  await window.click('[data-testid="view-discography-button"]');
}

test.describe('Artists view', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await navigateToArtists(window);
  });

  test('artists view shows all three test artists', async ({ navidromeApp: { window } }) => {
    await expect(window.locator(`text=${TRACKS.track01.artist}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.soloTrack.artist}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.jazzTrack.artist}`).first()).toBeVisible();
  });

  test("opening Test Artist's discography shows their album", async ({
    navidromeApp: { window },
  }) => {
    await openArtistDiscography(window, TRACKS.track01.artist);

    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(window.locator(`text=${TRACKS.soloTrack.album}`)).not.toBeVisible();
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`)).not.toBeVisible();
  });

  test("Test Artist's album contains all 3 of their tracks", async ({
    navidromeApp: { window },
  }) => {
    await openArtistDiscography(window, TRACKS.track01.artist);
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    await expect(window.locator(`text=${TRACKS.track01.title}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(window.locator(`text=${TRACKS.track02.title}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.track03.title}`).first()).toBeVisible();
  });

  test('Solo Artist has exactly 1 track', async ({ navidromeApp: { window } }) => {
    await openArtistDiscography(window, TRACKS.soloTrack.artist);
    await window.locator(`text=${TRACKS.soloTrack.album}`).first().dblclick();

    await expect(window.locator(`text=${TRACKS.soloTrack.title}`).first()).toBeVisible({
      timeout: 15_000,
    });

    // Test Artist's tracks must not leak into Solo Artist's album view.
    await expect(window.locator(`text=${TRACKS.track01.title}`)).not.toBeVisible();
  });

  test('a track from the artist view can be played', async ({ navidromeApp: { window } }) => {
    await openArtistDiscography(window, TRACKS.jazzTrack.artist);
    await window.locator(`text=${TRACKS.jazzTrack.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.jazzTrack.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.jazzTrack.title,
      { timeout: 10_000 }
    );
  });
});
