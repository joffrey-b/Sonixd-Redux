import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Phase 3 — offline browsing (offline-status column, Albums/Artists/Genres/
// Search/Playlists offline branches, skip-unavailable-songs). Could not be
// run in this sandboxed tool environment (Electron fails to launch here) --
// same standing limitation as every prior phase. Written from static
// analysis of the real source + the established patterns in
// offline-detection.spec.ts (Manual offline toggle) and
// mpv-cache-preference.spec.ts (play-to-completion caching), not from an
// actual passing run.
//
// Forcing offline via the "Force offline mode" toggle (not the ~60s
// ping-flap detection path) throughout this file -- the target under test
// here is offline BROWSING behavior once effectiveOffline is true, not
// connectivity detection itself, which offline-detection.spec.ts already
// covers on its own.

function offlineToggleInput(window: Page) {
  return window.locator('[data-testid="force-offline-mode-toggle"] input[type="checkbox"]');
}

// Idempotent + force:true, matching the established StyledCheckbox gotcha
// fix already documented in offline-detection.spec.ts/sync.spec.ts/
// mpv-cache-preference.spec.ts for this exact class of control.
async function setForceOfflineMode(window: Page, desired: boolean) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-cache"]');
  const input = offlineToggleInput(window);
  await expect(input).toBeVisible({ timeout: 10_000 });
  if ((await input.isChecked()) !== desired) {
    await input.click({ force: true });
  }
}

async function playTrackToCompletion(
  window: Page,
  album: string,
  title: string,
  durationSeconds: number
) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${album}`).first()).toBeVisible({ timeout: 15_000 });
  await window.locator(`text=${album}`).first().dblclick();
  await window.locator(`text=${title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');

  // Audit fix: double-clicking a row queues the WHOLE album (all 3 tracks),
  // not just this one -- with the default repeat:none, reaching the end of
  // THIS track still auto-advances into the next track in the queue (repeat:none
  // only suppresses advancing past the END of the queue). Since this helper
  // waits well past a single track's duration, that auto-advance was silently
  // starting playback of the (still uncached/undownloaded) next track before
  // this function returned -- caught by a live e2e run of Fix C's gate test,
  // where "only track01 has been played" no longer held by the time the test
  // continued. Repeat:one loops this exact track on itself instead.
  const repeatBtn = window.locator('[data-testid="player-repeat"]');
  for (let i = 0; i < 4; i += 1) {
    if ((await repeatBtn.getAttribute('data-repeat-mode')) === 'one') break;

    await repeatBtn.click();

    await window.waitForTimeout(200);
  }

  await window.waitForTimeout((durationSeconds + 10) * 1000);
}

async function enableSongCaching(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-cache"]');
  const cacheToggle = window.locator('[data-testid="song-cache-enable"] input[type="checkbox"]');
  if (!(await cacheToggle.isChecked())) await cacheToggle.click({ force: true });
}

test.describe('Offline-status column', () => {
  test('shows the cached icon for a track played to completion, blank for one that was never played', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(150_000);

    await enableSongCaching(window);
    await playTrackToCompletion(
      window,
      TRACKS.track01.album,
      TRACKS.track01.title,
      TRACKS.track01.durationSeconds
    );

    await window.click('[data-testid="nav-albums"]');
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    const cachedRow = window.getByRole('row', { name: TRACKS.track01.title });
    const uncachedRow = window.getByRole('row', { name: TRACKS.track03.title });

    // Real-time update (FIX 1) -- no restart needed for the icon to appear
    // for the just-finished track. track03 was never played -- blank cell.
    // Scoped to the cloud-download icon specifically (rsuite icons render
    // with an auto-generated aria-label matching their name) -- .locator('svg')
    // alone is ambiguous, since the row's Favorite column also renders an
    // svg (a real run's strict-mode violation confirmed both are present).
    await expect(cachedRow.getByLabel('cloud download')).toBeVisible({ timeout: 10_000 });
    await expect(uncachedRow.getByLabel('cloud download')).toHaveCount(0);
  });
});

test.describe('Offline browsing', () => {
  // Library + playlists sync happens automatically on every launch while
  // online (App.tsx) -- these tests rely on that already having happened
  // before forcing offline, exactly as a real user would experience it
  // (sync while connected, browse later while offline).
  test('Albums, Artists, Genres, and Search remain browsable with correct content when offline', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(90_000);

    // Let the automatic launch-time sync complete before going offline.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.waitForTimeout(5_000);

    await setForceOfflineMode(window, true);
    await expect(window.locator('[data-testid="offline-indicator"]')).toBeVisible({
      timeout: 10_000,
    });

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`).first()).toBeVisible();

    await window.click('[data-testid="nav-artists"]');
    await expect(window.locator(`text=${TRACKS.track01.artist}`).first()).toBeVisible({
      timeout: 10_000,
    });

    await window.click('[data-testid="nav-genres"]');
    await expect(window.locator(`text=${TRACKS.track01.genre}`).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator(`text=${TRACKS.jazzTrack.genre}`).first()).toBeVisible();

    // Note: the top-bar search popup (SearchBar.tsx) has its own, independent
    // set of queries from SearchView.tsx's -- both now have their own offline
    // branch (SearchBar's added in the Phase 3 fix session's Fix F; see the
    // dedicated "Fix F" describe block below for popup-specific coverage).
    // Still navigating to the full SearchView page here via "View all
    // results" rather than asserting on the popup, to keep this test's scope
    // to what it was already covering (SearchView, not SearchBar).
    await window.click('[data-testid="nav-search"]');
    await window.fill('[data-testid="search-input"]', TRACKS.jazzTrack.title);
    await window.waitForTimeout(1_000);
    await window.click('[data-testid="search-view-all-button"]');

    await expect(window.locator('[data-testid="search-page-input"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByText(TRACKS.jazzTrack.title).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Playlists remain browsable with correct content when offline', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(90_000);

    // Let the automatic launch-time playlists sync (FIX 4) complete.
    await window.click('[data-testid="nav-playlists"]');
    await expect(window.getByText('Imported Mix').first()).toBeVisible({ timeout: 15_000 });
    await window.waitForTimeout(5_000);

    await setForceOfflineMode(window, true);
    await expect(window.locator('[data-testid="offline-indicator"]')).toBeVisible({
      timeout: 10_000,
    });

    await window.click('[data-testid="nav-playlists"]');
    await expect(window.getByText('Imported Mix').first()).toBeVisible({ timeout: 10_000 });
    await window.getByText('Imported Mix').first().dblclick();
    // Song ID references resolved against the local song snapshot (FIX 4/6).
    await expect(window.locator(`text=${TRACKS.track01.title}`).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  // Jellyfin-side coverage for the playlists sync (FIX 4). Jellyfin's own
  // auto-discovered "Imported Mix" playlist (from the same source M3U
  // Navidrome imports) resolves to 0 songs via its real API (confirmed
  // against the live container during this phase's own investigation -- a
  // genuine cross-server M3U-parsing difference from Navidrome, not a bug
  // in this app), so setup-jellyfin.sh creates a second, real playlist
  // directly via POST /Playlists with explicit song ids -- deliberately
  // named "E2E Test Playlist", not "Imported Mix", so this test's own
  // `.first()` lookups can't accidentally resolve to the always-empty
  // auto-discovered one instead. Verified end-to-end (create, list, verify
  // item count) against a live container during this phase's investigation.
  // The creation call picks its first 3 songs by whatever order Jellyfin's
  // own /Items endpoint returns them in (not guaranteed to be track01-03
  // specifically), so this test checks for content generically rather than
  // asserting one particular track title.
  test('Playlists remain browsable with correct content when offline (Jellyfin)', async ({
    jellyfinApp: { window },
  }) => {
    test.setTimeout(90_000);

    await window.click('[data-testid="nav-playlists"]');
    await expect(window.getByText('E2E Test Playlist').first()).toBeVisible({ timeout: 15_000 });
    await window.waitForTimeout(5_000); // let the launch-time playlists sync complete

    await setForceOfflineMode(window, true);
    await expect(window.locator('[data-testid="offline-indicator"]')).toBeVisible({
      timeout: 10_000,
    });

    await window.click('[data-testid="nav-playlists"]');
    await expect(window.getByText('E2E Test Playlist').first()).toBeVisible({ timeout: 10_000 });
    await window.getByText('E2E Test Playlist').first().dblclick();

    const anyTrackTitle = new RegExp(
      [
        TRACKS.track01.title,
        TRACKS.track02.title,
        TRACKS.track03.title,
        TRACKS.soloTrack.title,
        TRACKS.jazzTrack.title,
      ].join('|')
    );
    await expect(window.getByText(anyTrackTitle).first()).toBeVisible({ timeout: 10_000 });
  });
});

// Phase 3 fix session (sonixd-redux-offline-phase3-fixes-prompt.md) — Fix A
// (offline "not found" crash guard), Fix C (row double-click offline gate,
// extended to Album/Artist/Playlist to match what Search's row double-click
// already had), and Fix F (SearchBar popup's own offline branch, separate
// from SearchView.tsx's). Same standing sandbox limitation as the rest of
// this file — written from static analysis of the real source, not from an
// actual passing run.
test.describe('Fix A — offline "not found" instead of crashing', () => {
  test('navigating to an album id that is not in the local snapshot shows "Album not found." instead of crashing', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(90_000);

    // Let the automatic launch-time library sync complete before going offline.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.waitForTimeout(5_000);

    await setForceOfflineMode(window, true);
    await expect(window.locator('[data-testid="offline-indicator"]')).toBeVisible({
      timeout: 10_000,
    });

    // HashRouter -- setting the hash directly navigates without needing a
    // real row to click through (this id has never existed on the server,
    // simulating a stale link / an album deleted since the last sync).
    // Referencing bare `location` (not `window.location`) -- the outer
    // Playwright Page is itself named `window` in this fixture, which would
    // otherwise shadow the browser-context global inside this callback
    // (established workaround already used elsewhere in this suite, e.g.
    // spectrogram.spec.ts's canvasHasContent).
    await window.evaluate(() => {
      location.hash = '#/library/album/e2e-nonexistent-album-id';
    });

    await expect(window.getByText('Album not found.')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Fix C — row double-click offline gate (Album/Artist/Playlist)', () => {
  test('double-clicking an unavailable row in Album, Artist, and Playlist views shows the offline warning instead of starting playback', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(150_000);

    await enableSongCaching(window);
    // Only track01 gets cached -- track02/track03/soloTrack/jazzTrack stay
    // uncached, giving each view below a real unavailable row to double-click.
    await playTrackToCompletion(
      window,
      TRACKS.track01.album,
      TRACKS.track01.title,
      TRACKS.track01.durationSeconds
    );

    await setForceOfflineMode(window, true);
    await expect(window.locator('[data-testid="offline-indicator"]')).toBeVisible({
      timeout: 10_000,
    });

    // Audit fix: player-track-title never disappears once any track has ever
    // been queued (PlayerBar.tsx renders it whenever playQueue.entry is
    // non-empty, independent of play/pause/stop status) -- track01 is
    // already loaded and looping (repeat:one) from playTrackToCompletion
    // above, so asserting toHaveCount(0) here could never pass regardless of
    // whether the gate actually blocks anything. Assert instead that the
    // gate leaves the CURRENT track unchanged (still track01, never the
    // double-clicked unavailable one) -- caught by a live e2e run where the
    // original assertion's premise didn't hold.

    // Album view.
    await window.click('[data-testid="nav-albums"]');
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.getByRole('row', { name: TRACKS.track02.title }).dblclick();
    // Audit fix: this test triggers the same "isn't available offline"
    // warning three times in quick succession (Album/Artist/Playlist views).
    // The toast auto-dismisses after 3s (toast.ts), but the steps between one
    // blocked click and the next (navigating views, waiting for rows) can
    // take less than that -- a live e2e run caught two identical
    // notifications stacked on screen at once, a strict-mode violation for
    // a locator that assumed only one would ever be visible. `.first()`
    // only needs at least one to be showing, which is all this assertion
    // actually cares about.
    await expect(window.getByText(/isn't available offline/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );

    // Artist view -- same underlying gate, reached via the artist's own page.
    // Audit fix (round 1): a bare `text=` locator for the artist row was
    // ambiguous with Titlebar.tsx's custom window-title element (which also
    // contains the literal text "Test Artist" while track01 loops via
    // repeat:one) -- scoped to a row role to fix that.
    //
    // Audit fix (round 2): scoping to a row role wasn't enough on its own.
    // The Album view's own song rows (still momentarily mounted right after
    // clicking nav-artists, before the route swaps) each list "Test Artist"
    // as their artist column value, so their accessible names ALSO contain
    // the substring "Test Artist" -- getByRole('row', { name: ... }) matches
    // on substring by default. A live e2e run hit exactly that transient
    // window: 3 leftover Album-view rows plus the real Artists-list row all
    // matched at once, a strict-mode violation Playwright throws immediately
    // rather than retrying through. Waiting for a marker that can only ever
    // exist on the Artists list -- Solo Artist's own row, which never
    // appears on Test Album's song table -- forces the wait to resolve only
    // once the old page has genuinely gone, so the later Test-Artist lookup
    // no longer has a stale row to collide with.
    await window.click('[data-testid="nav-artists"]');
    await expect(window.getByRole('row', { name: TRACKS.soloTrack.artist })).toBeVisible({
      timeout: 15_000,
    });
    await window.getByRole('row', { name: TRACKS.track01.artist }).dblclick();
    await window.getByRole('row', { name: TRACKS.track03.title }).dblclick();
    // Audit fix: this test triggers the same "isn't available offline"
    // warning three times in quick succession (Album/Artist/Playlist views).
    // The toast auto-dismisses after 3s (toast.ts), but the steps between one
    // blocked click and the next (navigating views, waiting for rows) can
    // take less than that -- a live e2e run caught two identical
    // notifications stacked on screen at once, a strict-mode violation for
    // a locator that assumed only one would ever be visible. `.first()`
    // only needs at least one to be showing, which is all this assertion
    // actually cares about.
    await expect(window.getByText(/isn't available offline/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );

    // Playlist view -- "Imported Mix" contains track01 (cached) plus
    // soloTrack/jazzTrack (never played, still uncached).
    await window.click('[data-testid="nav-playlists"]');
    await window.getByText('Imported Mix').first().dblclick();
    await window.getByRole('row', { name: TRACKS.soloTrack.title }).dblclick();
    // Audit fix: this test triggers the same "isn't available offline"
    // warning three times in quick succession (Album/Artist/Playlist views).
    // The toast auto-dismisses after 3s (toast.ts), but the steps between one
    // blocked click and the next (navigating views, waiting for rows) can
    // take less than that -- a live e2e run caught two identical
    // notifications stacked on screen at once, a strict-mode violation for
    // a locator that assumed only one would ever be visible. `.first()`
    // only needs at least one to be showing, which is all this assertion
    // actually cares about.
    await expect(window.getByText(/isn't available offline/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );
  });
});

test.describe('Fix F — SearchBar popup offline search', () => {
  test('the top-bar search popup finds a cached song locally while offline, with no server round-trip needed', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(90_000);

    // Let the automatic launch-time library sync complete before going offline.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.waitForTimeout(5_000);

    await setForceOfflineMode(window, true);
    await expect(window.locator('[data-testid="offline-indicator"]')).toBeVisible({
      timeout: 10_000,
    });

    await window.click('[data-testid="nav-search"]');
    await window.fill('[data-testid="search-input"]', TRACKS.jazzTrack.title);
    await expect(
      window.locator('[data-testid="search-results-popup"]').getByText(TRACKS.jazzTrack.title)
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Skip-unavailable-songs when playing offline', () => {
  test('playing an album with one cached and two uncached tracks skips the unavailable ones and shows the count', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(150_000);

    await enableSongCaching(window);
    // Only track01 gets cached; track02/track03 are never played.
    await playTrackToCompletion(
      window,
      TRACKS.track01.album,
      TRACKS.track01.title,
      TRACKS.track01.durationSeconds
    );

    await setForceOfflineMode(window, true);
    await expect(window.locator('[data-testid="offline-indicator"]')).toBeVisible({
      timeout: 10_000,
    });

    await window.click('[data-testid="nav-albums"]');
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    // getByRole('button', { name: 'Play', exact: true }) is ambiguous --
    // PlayerBar's persistent play/pause toggle also reads "Play" when
    // nothing is queued (confirmed via a real run's DOM snapshot, which
    // showed both on screen at once). Added a dedicated data-testid to
    // AlbumView.tsx's PlayButton to disambiguate.
    await window.locator('[data-testid="album-play-button"]').click();

    await expect(window.getByText(/2 of 3 tracks unavailable offline/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );
  });

  test('playing a selection with nothing available offline shows a distinct message and does not start playback', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(90_000);

    // Nothing has ever been played/cached in this fresh app instance.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.waitForTimeout(5_000); // let the launch-time library sync finish

    await setForceOfflineMode(window, true);
    await expect(window.locator('[data-testid="offline-indicator"]')).toBeVisible({
      timeout: 10_000,
    });

    await window.click('[data-testid="nav-albums"]');
    await window.locator(`text=${TRACKS.jazzTrack.album}`).first().dblclick();
    // getByRole('button', { name: 'Play', exact: true }) is ambiguous --
    // PlayerBar's persistent play/pause toggle also reads "Play" when
    // nothing is queued (confirmed via a real run's DOM snapshot, which
    // showed both on screen at once). Added a dedicated data-testid to
    // AlbumView.tsx's PlayButton to disambiguate.
    await window.locator('[data-testid="album-play-button"]').click();

    await expect(window.getByText(/none of these tracks are available offline/i)).toBeVisible({
      timeout: 10_000,
    });
    // PlayerBar is a persistent, always-mounted layout element (confirmed
    // from source -- it renders regardless of queue state), so its own
    // visibility can't signal "nothing started." A real run showed
    // player-track-title itself doesn't render at all when nothing is
    // queued (no current song -- the title sub-element is conditional, not
    // just empty text), so `.not.toContainText()` failed with "element(s)
    // not found" rather than passing -- confirms nothing started playing,
    // just needed a count check instead of a text check.
    await expect(window.locator('[data-testid="player-track-title"]')).toHaveCount(0);
  });
});
