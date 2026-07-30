import path from 'path';
import { execSync } from 'child_process';
import { _electron as electronLauncher } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { TRACKS, SCROBBLE_WAIT_MS } from '../../fixtures/constants';
import { isRealScrobble } from '../../fixtures/scrobbleHelpers';

// Ping cadence is 30s with 2 consecutive failures required to declare offline
// (connectivityPing.ts / useConnectivityMonitor.ts) -- a full detection cycle
// is therefore at least ~60s by design, and reconnection needs a further tick
// (~30s) on top of that. Waits below are sized with real margin over those
// floors, not guessed. The bespoke ping call has its own short timeout and no
// retry chain (Lesson #6/#7) -- unlike scrobble/star/rating, an aborted ping
// rejects almost immediately rather than after axios-retry's ~6-7s backoff.
const PING_INTERVAL_MS = 30_000;
const ONE_TICK_MARGIN_MS = 8_000;
const E2E_DIR = path.join(__dirname, '../..');

async function waitOneTick(window: Page) {
  await window.waitForTimeout(PING_INTERVAL_MS + ONE_TICK_MARGIN_MS);
}

function offlineIndicator(window: Page) {
  return window.locator('[data-testid="offline-indicator"]');
}

test.describe('Connectivity detection — simulated (route interception)', () => {
  test('a single failed ping does not trigger offline mode', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(120_000);

    await window.route('**/rest/ping.view**', (route) => route.abort());

    await waitOneTick(window); // one failed ping -- not yet 2 consecutive

    await expect(offlineIndicator(window)).not.toBeVisible();
  });

  test('two consecutive failed pings trigger the warning toast then offline mode', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(120_000);

    await window.route('**/rest/ping.view**', (route) => route.abort());

    // First failure (~30s in): transient warning toast. Registered as a
    // continuously-polling assertion (not a fixed wait-then-check) since the
    // warning toast auto-dismisses after 3s (toast.ts's duration table),
    // exactly the same discipline offline-queue.spec.ts's drop-summary-toast
    // test already established for this codebase's toasts.
    await expect(window.getByText(/switching to offline mode/i)).toBeVisible({
      timeout: PING_INTERVAL_MS + ONE_TICK_MARGIN_MS,
    });

    // Second consecutive failure (~30s later): formal transition.
    await expect(offlineIndicator(window)).toBeVisible({
      timeout: PING_INTERVAL_MS + ONE_TICK_MARGIN_MS,
    });
  });

  test('a success between two failures resets detection — no offline transition occurs', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(150_000);

    await window.route('**/rest/ping.view**', (route) => route.abort());
    await waitOneTick(window); // 1st failure

    await window.unroute('**/rest/ping.view**'); // let the next tick succeed
    await waitOneTick(window); // resets the failure count

    await window.route('**/rest/ping.view**', (route) => route.abort());
    await waitOneTick(window); // only 1 failure again since the reset

    await expect(offlineIndicator(window)).not.toBeVisible();
  });

  test('persistent indicator appears on detected offline and disappears on reconnection', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(150_000);

    await window.route('**/rest/ping.view**', (route) => route.abort());
    await expect(offlineIndicator(window)).toBeVisible({
      timeout: 2 * PING_INTERVAL_MS + ONE_TICK_MARGIN_MS,
    });

    await window.unroute('**/rest/ping.view**');
    await expect(offlineIndicator(window)).not.toBeVisible({
      timeout: PING_INTERVAL_MS + ONE_TICK_MARGIN_MS,
    });
  });
});

test.describe('Connectivity detection — genuine server unreachability', () => {
  // Per Lesson #7 -- actually stop/restart the real Navidrome container rather
  // than only simulating via route interception, to prove detection isn't
  // coupled to Playwright's own request-interception machinery. This suite
  // runs with workers: 1 (serial, playwright.config.ts), so it's safe to
  // briefly take the shared container down as long as it's guaranteed back up
  // afterward -- the finally block below is not optional.
  test('stopping the real Navidrome container is detected as offline', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(180_000);

    try {
      // Fix 2 (Phase 2 fix session): this stop call must be INSIDE the try --
      // if it were before it (as an earlier draft had it) and it threw after
      // actually having stopped the container, the finally block below would
      // never run, leaving the shared container stopped for every test after
      // this one (workers: 1 / serial).
      execSync('docker compose stop navidrome', { cwd: E2E_DIR });

      await expect(offlineIndicator(window)).toBeVisible({
        timeout: 2 * PING_INTERVAL_MS + 15_000,
      });
    } finally {
      execSync('docker compose start navidrome', { cwd: E2E_DIR });

      // Poll until the container reports healthy again (per the healthcheck
      // in e2e/docker-compose.yml) rather than a fixed guess, so a slow
      // restart doesn't leave the container looking "up" but not yet
      // actually answering requests for whichever test runs next.
      const deadline = Date.now() + 60_000;

      while (true) {
        const status = execSync('docker compose ps navidrome --format "{{.Health}}"', {
          cwd: E2E_DIR,
        })
          .toString()
          .trim();
        if (status === 'healthy') break;
        if (Date.now() > deadline) {
          throw new Error(`navidrome did not become healthy again in time (status: ${status})`);
        }

        await new Promise((resolve) => {
          setTimeout(resolve, 2_000);
        });
      }
    }
  });
});

test.describe('Manual offline toggle', () => {
  // Click the actual checkbox input, not the [data-testid] wrapper around it
  // -- StyledCheckbox is a `display: block !important` wide container with
  // left-aligned label text inside it, so Playwright's default center-click
  // on the wrapper lands in empty space to the right of the real label/input
  // and never toggles it. Same established gotcha/fix already documented in
  // sync.spec.ts/mpv-cache-preference.spec.ts for CacheConfig's own
  // StyledCheckbox ("song-cache-enable") -- missed here on the first pass
  // since this describe block was written before cross-checking that
  // precedent. force: true because the real input sits underneath a
  // decorative visual span (.rs-checkbox-inner) that Playwright's own
  // actionability check would otherwise refuse to click through.
  function offlineToggleInput(window: Page) {
    return window.locator('[data-testid="force-offline-mode-toggle"] input[type="checkbox"]');
  }

  // Idempotent, matching sync.spec.ts/mpv-cache-preference.spec.ts's own
  // convention for this same StyledCheckbox class of control -- checks
  // current state first rather than blindly clicking, so a test isn't wrong
  // by construction if the toggle's starting state ever stops being a safe
  // assumption (it's currently guaranteed unchecked here, since navidromeApp
  // always launches a fresh app/fresh settings per test).
  async function setForceOfflineMode(window: Page, desired: boolean) {
    const input = offlineToggleInput(window);
    if ((await input.isChecked()) !== desired) {
      await input.click({ force: true });
    }
  }

  async function openConnectivitySettings(window: Page) {
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-cache"]');
    await expect(window.locator('[data-testid="force-offline-mode-toggle"]')).toBeVisible({
      timeout: 10_000,
    });
  }

  test('enabling the toggle stops the ping entirely', async ({ navidromeApp: { window } }) => {
    test.setTimeout(90_000);

    await openConnectivitySettings(window);

    let pingCount = 0;
    await window.route('**/rest/ping.view**', async (route) => {
      pingCount += 1;
      await route.continue();
    });

    await setForceOfflineMode(window, true);
    await expect(offlineIndicator(window)).toBeVisible({ timeout: 10_000 });

    await waitOneTick(window); // long enough for a would-be scheduled ping

    expect(pingCount).toBe(0);
  });

  test('disabling the toggle triggers an immediate ping rather than waiting for the next interval', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);

    await openConnectivitySettings(window);
    await setForceOfflineMode(window, true); // force on
    await expect(offlineIndicator(window)).toBeVisible({ timeout: 10_000 });

    const immediatePing = window.waitForRequest((req) => req.url().includes('/rest/ping.view'), {
      timeout: 10_000, // well under the 30s interval -- proves it's immediate
    });
    await setForceOfflineMode(window, false); // force off

    await immediatePing;
    await expect(offlineIndicator(window)).not.toBeVisible({ timeout: 10_000 });
  });

  test('the toggle persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);

    await openConnectivitySettings(window);
    await setForceOfflineMode(window, true);
    await expect(offlineToggleInput(window)).toBeChecked();

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

    await w2.click('[data-testid="settings-link"]');
    await w2.click('[data-testid="settings-cache"]');
    await expect(offlineToggleInput(w2)).toBeChecked({
      timeout: 10_000,
    });
    await expect(offlineIndicator(w2)).toBeVisible({ timeout: 10_000 });

    await app2.close();
  });
});

test.describe('Reconnection triggers queue flush', () => {
  test('a scrobble queued while offline replays promptly once the ping confirms reconnection, not just incidentally', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(180_000);

    // Block BOTH the scrobble endpoint and the ping -- if only scrobble.view
    // were blocked, any other unrelated successful request (Phase 1's "any
    // successful response" interceptor hook) could incidentally flush the
    // queue, which would prove nothing about THIS trigger specifically.
    await window.route('**/rest/scrobble.view**', (route) => route.abort());
    await window.route('**/rest/ping.view**', (route) => route.abort());

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');
    await window.waitForTimeout(SCROBBLE_WAIT_MS); // scrobble attempt fails, queues

    // Confirm the app has actually reached the detected-offline state (2
    // consecutive ping failures) before reconnecting -- otherwise a
    // reconnection could just be the very first ping ever attempted,
    // which wouldn't exercise the reconnection trigger described in FIX 6.
    await expect(offlineIndicator(window)).toBeVisible({
      timeout: 2 * PING_INTERVAL_MS + 15_000,
    });

    // Registered BEFORE unrouting, so it can't miss a replay that fires
    // immediately once the connection is restored.
    const replayedScrobble = window.waitForRequest((req) => isRealScrobble(req.url()), {
      timeout: PING_INTERVAL_MS + 15_000,
    });

    await window.unroute('**/rest/scrobble.view**');
    await window.unroute('**/rest/ping.view**');
    // Deliberately no other action here (no nav click) -- the next scheduled
    // ping tick succeeding is what must trigger the flush, not anything else.

    const req = await replayedScrobble;
    const url = new URL(req.url());
    expect(url.searchParams.get('time')).not.toBeNull(); // original timestamp preserved
  });
});

test.describe('UI refresh on replay (Fix 7)', () => {
  function ratingWidget(window: Page, trackTitle: string) {
    return window.getByRole('row', { name: trackTitle }).getByRole('radiogroup');
  }

  function star(window: Page, trackTitle: string, posinset: number) {
    return ratingWidget(window, trackTitle).locator(`[aria-posinset="${posinset}"]`);
  }

  // Mirrors offline-queue.spec.ts's own resetRating helper (duplicated rather
  // than imported -- no spec-importing-spec in this suite's established
  // convention). Ratings persist server-side on the shared Navidrome instance
  // across every run, not just within a session.
  async function resetRating(window: Page, trackTitle: string) {
    const widget = ratingWidget(window, trackTitle);
    await expect(widget).toBeVisible({ timeout: 15_000 });
    const checkedStar = widget.locator('[aria-checked="true"]');
    if ((await checkedStar.count()) > 0) {
      await checkedStar.click();
      await expect(widget.locator('[aria-checked="true"]')).toHaveCount(0, { timeout: 10_000 });
    }
  }

  async function ensureRatingColumnVisible(window: Page) {
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-lookandfeel"]');
    const picker = window.locator('[data-testid="column-picker-music"]');
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await picker.click();
    await window.getByText('Rating', { exact: true }).click();
    await window.keyboard.press('Escape');
    // Escape closes the CheckPicker dropdown asynchronously (RSuite's
    // useRootClose + a focus-return side effect) -- a live run of the
    // identical helper in rating.spec.ts caught the very next click
    // stalling for a full 30s timeout because the popup hadn't actually
    // finished closing yet. Wait for it to be gone rather than assuming
    // the keypress landed. Scoped to `window`, not `picker` -- the popup
    // no longer renders inside the trigger's own container (see the
    // container-prop fix in ListViewConfig.tsx).
    await expect(window.locator('.rs-picker-check-menu')).toBeHidden({ timeout: 5_000 });
  }

  test('a rating changed while offline visually updates in the still-open view once replayed, with no navigation required', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(180_000);

    await ensureRatingColumnVisible(window);
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await resetRating(window, TRACKS.track01.title);

    // Block BOTH setRating.view and ping.view -- reconnection (via the ping
    // mechanism, not an unrelated nav click) is what must trigger the replay
    // here, so this view can stay open/mounted the whole time with no
    // navigation at all.
    await window.route('**/rest/setRating.view**', (route) => route.abort());
    await window.route('**/rest/ping.view**', (route) => route.abort());

    await star(window, TRACKS.track01.title, 3).click();
    await expect(offlineIndicator(window)).toBeVisible({
      timeout: 2 * PING_INTERVAL_MS + 15_000,
    });

    // Still the same mounted album view/widget throughout -- no navigation.
    await window.unroute('**/rest/setRating.view**');
    await window.unroute('**/rest/ping.view**');

    // The next successful ping triggers attemptQueueFlush -> replayEntry ->
    // applyRatingSuccess (Fix 7), which dispatches into Redux/local cache --
    // the SAME still-mounted widget must reflect the new rating with no
    // click, reload, or re-navigation of any kind.
    await expect(star(window, TRACKS.track01.title, 3)).toHaveAttribute('aria-checked', 'true', {
      timeout: PING_INTERVAL_MS + 15_000,
    });
  });

  // Fix 1 (Phase 2 fix session): the test above only ever proved this worked
  // for AlbumView, whose rating widget happens to pass queryKey: ['album',
  // albumId] -- a case applyRatingSuccess's unfiltered invalidateQueries()
  // call reaches the same way it reaches every other view. This second test
  // targets a structurally different view (ArtistView's "songs" tab, queryKey
  // ['artistSongs', artistId]) specifically to confirm the fix generalizes
  // rather than happening to work for the one view already covered above --
  // not an exhaustive check of every view that renders ratings, which isn't
  // needed given the fix itself is not view-specific.
  test('a rating changed while offline visually updates in a different view type (ArtistView) once replayed', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(180_000);

    await ensureRatingColumnVisible(window);
    await window.click('[data-testid="nav-artists"]');
    await expect(window.locator(`text=${TRACKS.track01.artist}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.artist}`).first().dblclick();
    await window.getByText('View All Songs', { exact: true }).click();
    await expect(window.locator(`text=${TRACKS.track01.title}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await resetRating(window, TRACKS.track01.title);

    await window.route('**/rest/setRating.view**', (route) => route.abort());
    await window.route('**/rest/ping.view**', (route) => route.abort());

    await star(window, TRACKS.track01.title, 4).click();
    await expect(offlineIndicator(window)).toBeVisible({
      timeout: 2 * PING_INTERVAL_MS + 15_000,
    });

    await window.unroute('**/rest/setRating.view**');
    await window.unroute('**/rest/ping.view**');

    await expect(star(window, TRACKS.track01.title, 4)).toHaveAttribute('aria-checked', 'true', {
      timeout: PING_INTERVAL_MS + 15_000,
    });
  });
});
