import { _electron as electronLauncher } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { TRACKS, SCROBBLE_WAIT_MS } from '../../fixtures/constants';
import { isRealScrobble, isJellyfinPlaybackStopped } from '../../fixtures/scrobbleHelpers';

// axios-retry is configured with retries: 3 and a retryDelay of
// retryCount * 1000ms (api.ts/jellyfinApi.ts) -- a Playwright route.abort()
// is a network-layer failure (no response received), which axiosRetry's
// isNetworkError condition retries just like a real dropped connection. Every
// attempt against a still-aborted endpoint therefore takes at least
// 1s + 2s + 3s = 6s to actually reject, whether it's the original attempt or
// a queue replay. Waits below are sized with real margin over that floor.
const RETRY_EXHAUST_MS = 10_000;

async function playTrack01PastThreshold(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  // Albums require a double-click to navigate in — a single click only selects
  // the row (see AlbumList.tsx's useListClickHandler: doubleClick navigates,
  // there is no singleClick override).
  await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
  await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');
  await window.waitForTimeout(SCROBBLE_WAIT_MS);
}

test.describe('Offline scrobble queue — Navidrome', () => {
  test('a scrobble that fails is queued and replayed once a later request succeeds', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(180_000);

    // Intercept and fail the scrobble endpoint specifically
    await window.route('**/rest/scrobble.view**', (route) => route.abort());

    await playTrack01PastThreshold(window);

    // Remove the interception (simulating reconnection)
    await window.unroute('**/rest/scrobble.view**');

    // Intercept again, this time to OBSERVE rather than block, and wait for
    // the replayed scrobble to actually fire — triggered by some other
    // successful request (e.g. navigating to another view)
    const replayedScrobble = window.waitForRequest((req) => isRealScrobble(req.url()), {
      timeout: 30_000,
    });
    await window.click('[data-testid="nav-artists"]'); // any successful request triggers the flush check

    const req = await replayedScrobble;
    const url = new URL(req.url());
    expect(url.searchParams.get('time')).not.toBeNull(); // original timestamp preserved
  });

  test('the queue survives an app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(180_000);

    await window.route('**/rest/scrobble.view**', (route) => route.abort());
    await playTrack01PastThreshold(window);

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

    // Registered as the very first thing after the window exists — the app's
    // own automatic post-boot activity (library sync, etc.) can itself
    // trigger the flush via the same "any successful response" interceptor
    // hook, well before any explicit action from this test. A one-shot
    // waitForRequest attached later could easily miss a replay that already
    // happened; a persistent route observer catches it no matter what
    // triggers it or when.
    let replayedScrobbleSeen = false;
    await w2.route('**/rest/scrobble.view**', async (route) => {
      if (isRealScrobble(route.request().url())) replayedScrobbleSeen = true;
      await route.continue();
    });

    await w2.waitForSelector('[data-testid="nav-albums"]');
    // Nudge a successful request in case the app's own automatic activity
    // hasn't triggered one yet — harmless if the flush already happened.
    await w2.click('[data-testid="nav-artists"]');
    await w2.waitForTimeout(RETRY_EXHAUST_MS);

    expect(replayedScrobbleSeen).toBe(true);
    await app2.close();
  });

  test('rapid star then unstar of the same song while offline results in only one replayed request', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(120_000);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    const starToggle = window.locator(`[data-testid="star-${TRACKS.track01.title}"]`);
    await expect(starToggle).toBeVisible({ timeout: 15_000 });

    await window.route('**/rest/star.view**', (route) => route.abort());
    await window.route('**/rest/unstar.view**', (route) => route.abort());

    // First click (star). Its own network attempt must exhaust all 3 retries
    // and actually reject -- only then does the queue entry get created and
    // the optimistic UI update land -- before the second click, or both
    // clicks would race the same stale (pre-update) starred state and both
    // resolve to the same direction rather than genuinely toggling.
    await starToggle.click();
    await window.waitForTimeout(RETRY_EXHAUST_MS);
    await starToggle.click();
    await window.waitForTimeout(RETRY_EXHAUST_MS);

    await window.unroute('**/rest/star.view**');
    await window.unroute('**/rest/unstar.view**');

    let replayedStarRequests = 0;
    await window.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.includes('/rest/star.view') || url.includes('/rest/unstar.view')) {
        replayedStarRequests += 1;
      }
      await route.continue();
    });

    // Any successful request triggers the flush check.
    await window.click('[data-testid="nav-artists"]');
    await window.waitForTimeout(5_000);

    expect(replayedStarRequests).toBe(1);
  });

  test('an item that fails twice is dropped with a summary toast', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(180_000);

    // Fail the scrobble endpoint permanently for this test (never remove the route)
    await window.route('**/rest/scrobble.view**', (route) => route.abort());
    await playTrack01PastThreshold(window);

    // First flush attempt: the replay itself has to exhaust its own 3 retries
    // against the still-aborted endpoint before attemptQueueFlush's in-flight
    // guard releases and the entry is marked hasBeenRetried -- wait for that
    // full cycle, not just for the triggering click to register.
    await window.click('[data-testid="nav-artists"]');
    await window.waitForTimeout(RETRY_EXHAUST_MS);

    // Second flush attempt: deliberately a DIFFERENT, not-yet-visited nav
    // target (not nav-albums again, which playTrack01PastThreshold already
    // visited) -- react-query would likely serve a re-visit of nav-albums
    // from cache with no new network request, meaning no new interceptor
    // success event and no second flush attempt at all.
    await window.click('[data-testid="nav-genres"]');

    // No fixed wait here before checking -- the drop-summary toast
    // (notifyToast's 'warning' type) only stays visible for 3 seconds
    // (toast.ts's duration table), and the second replay attempt itself
    // takes ~6-7s to exhaust its retries before the toast even fires. A
    // fixed wait long enough for the retry cycle would let the toast finish
    // rendering AND auto-dismissing before this assertion ever looked for
    // it. `toBeVisible` polls continuously from here, so it catches the
    // toast within its visible window whenever it actually appears.
    await expect(window.getByText(/offline action.*could not be synced/i)).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe('Offline scrobble queue — Jellyfin', () => {
  test('a scrobble that fails is queued and replayed without a backdated timestamp', async ({
    jellyfinApp: { window },
  }) => {
    test.setTimeout(240_000);

    await window.route('**/sessions/playing/stopped**', (route) => route.abort());

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');

    // React to the ORIGINAL (aborted) submission attempt itself, then
    // unroute as soon as its retry cycle can plausibly have exhausted --
    // rather than sitting through SCROBBLE_WAIT_MS's full generic buffer
    // with the endpoint still aborted. Jellyfin's own automatic "now
    // playing" pings (event: start/pause/unpause -- Navidrome has no
    // equivalent) are separate successful requests that also trigger
    // attemptQueueFlush(); every extra second the endpoint stays aborted
    // past the point the entry is actually queued is another chance for one
    // of those pings to land a second failed flush attempt and drop the
    // entry (2-strikes rule) before this test ever gets to observe a real
    // replay. Minimizing this window, rather than guessing at exactly which
    // ping might fire when, is the robust fix regardless of which one it is.
    //
    // Margin widened from +15_000 after an empirical timeout at exactly that
    // ceiling in one real run out of two, with zero code changes between
    // them. The scrobble trigger itself (checkShouldScrobble in Player.tsx)
    // is identical for Jellyfin and Navidrome -- same threshold check, same
    // call site shape -- and Navidrome's equivalent wait passes reliably on
    // the same SCROBBLE_WAIT_MS budget, so the gap isn't the trigger logic.
    // Jellyfin playback carries extra real-time overhead this constant
    // doesn't account for (session/transcoding round-trips), so actual
    // playback position can lag wall-clock time by more than 15s. Widened
    // here only, not in the shared constant Navidrome's tests already rely
    // on as-is.
    await window.waitForRequest((req) => isJellyfinPlaybackStopped(req.url()), {
      timeout: SCROBBLE_WAIT_MS + 40_000,
    });
    await window.waitForTimeout(RETRY_EXHAUST_MS);
    await window.unroute('**/sessions/playing/stopped**');

    const replayedScrobble = window.waitForRequest((req) => isJellyfinPlaybackStopped(req.url()), {
      timeout: 45_000,
    });
    await window.click('[data-testid="nav-artists"]');

    const req = await replayedScrobble;
    const body = req.postDataJSON() as Record<string, unknown>;
    // Jellyfin's stopped-event payload has no backdating field at all -- only
    // PositionTicks (playback position), never a "when this happened" param.
    expect(Object.keys(body)).not.toContain('DatePlayed');
    expect(Object.keys(body)).not.toContain('time');
  });
});

// Rating UI helpers -- mirrors e2e/tests/library/rating.spec.ts's own local
// helpers (not exported from there, so duplicated here rather than adding a
// cross-file import between otherwise-independent spec files).
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
  // identical helper in rating.spec.ts caught the very next click stalling
  // for a full 30s timeout because the popup hadn't actually finished
  // closing yet. Wait for it to be gone rather than assuming the keypress
  // landed. Scoped to `window`, not `picker` -- the popup no longer renders
  // inside the trigger's own container (see the container-prop fix in
  // ListViewConfig.tsx).
  await expect(window.locator('.rs-picker-check-menu')).toBeHidden({ timeout: 5_000 });
}

function ratingWidget(window: Page, trackTitle: string) {
  return window.getByRole('row', { name: trackTitle }).getByRole('radiogroup');
}

function star(window: Page, trackTitle: string, posinset: number) {
  return ratingWidget(window, trackTitle).locator(`[aria-posinset="${posinset}"]`);
}

// Ratings persist server-side on the shared Navidrome instance across every
// test run, not just within one session -- mirrors rating.spec.ts's own
// resetRating helper and its own comment on exactly this gotcha. A rating
// change queued while offline that later replays successfully (as intended)
// leaves a REAL, correctly-persisted non-zero rating behind for the next
// run to contend with, so every test here must reset to a known baseline
// first rather than assuming a fresh/unrated starting point.
async function resetRating(window: Page, trackTitle: string) {
  const widget = ratingWidget(window, trackTitle);
  await expect(widget).toBeVisible({ timeout: 15_000 });
  const checkedStar = widget.locator('[aria-checked="true"]');
  if ((await checkedStar.count()) > 0) {
    await checkedStar.click();
    await expect(widget.locator('[aria-checked="true"]')).toHaveCount(0, { timeout: 10_000 });
  }
}

test.describe('Offline rating queue (post-audit fixes)', () => {
  test('a failed rating change is queued and does not show a stale/incorrect value in the meantime (Fix 3)', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(120_000);

    await ensureRatingColumnVisible(window);
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    // Reset BEFORE aborting the route -- this reset itself needs a real,
    // working setRating.view call to land (or there'd be nothing to
    // meaningfully assert about "no stale value" against).
    await resetRating(window, TRACKS.track01.title);

    await window.route('**/rest/setRating.view**', (route) => route.abort());
    await star(window, TRACKS.track01.title, 3).click();

    // Fix 3: the wrapper re-throws after queueing, so useRating.ts's
    // optimistic setQueryData/dispatch calls are skipped entirely on
    // failure (matching pre-existing behavior exactly) -- no stale
    // "shows 3 stars but the server never got it" state should ever render,
    // unlike before Fix 3 where the optimistic update landed regardless.
    await window.waitForTimeout(RETRY_EXHAUST_MS);
    await expect(star(window, TRACKS.track01.title, 3)).toHaveAttribute('aria-checked', 'false');

    // Confirm it WAS queued: unroute and observe the replay actually fire
    // with the originally-requested rating once reconnected.
    const replayed = window.waitForRequest((req) => req.url().includes('/rest/setRating.view'), {
      timeout: 30_000,
    });
    await window.unroute('**/rest/setRating.view**');
    await window.click('[data-testid="nav-artists"]');

    const req = await replayed;
    expect(new URL(req.url()).searchParams.get('rating')).toBe('3');
  });

  test('a bulk rating change while offline queues correctly and replays on reconnect (Fix 5)', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(120_000);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.waitForSelector('text=' + TRACKS.track02.title);

    await window.route('**/rest/setRating.view**', (route) => route.abort());

    // Select both tracks, then right-click to open the context menu on the
    // still-selected multi-selection (see multi-select.spec.ts's own
    // comment: right-clicking an ALREADY-selected row preserves the
    // selection rather than resetting it to just the clicked row). A plain
    // click does nothing for selection on its own -- handleRowClick only
    // acts on ctrl-click or shift-click -- so BOTH tracks need the Control
    // modifier, not just the second one.
    await window
      .getByText(TRACKS.track01.title, { exact: true })
      .first()
      .click({ modifiers: ['Control'] });
    await window.waitForTimeout(200);
    await window
      .getByText(TRACKS.track02.title, { exact: true })
      .first()
      .click({ modifiers: ['Control'] });
    await window.waitForTimeout(200);
    await window
      .getByText(TRACKS.track02.title, { exact: true })
      .first()
      .click({ button: 'right' });

    await window.getByText('Set rating', { exact: true }).hover();
    await window.getByText('4', { exact: true }).click();

    await window.waitForTimeout(RETRY_EXHAUST_MS);

    let replayedRatingRequests = 0;
    await window.route('**/*', async (route) => {
      if (route.request().url().includes('/rest/setRating.view')) replayedRatingRequests += 1;
      await route.continue();
    });
    await window.unroute('**/rest/setRating.view**');
    await window.click('[data-testid="nav-artists"]');
    await window.waitForTimeout(5_000);

    // One replayed setRating.view request per selected song id -- confirms
    // Fix 5's per-id queueing (not a single bulk apiController call, which
    // is what used to bypass the queue entirely).
    expect(replayedRatingRequests).toBe(2);
  });
});

// A Jellyfin "not supported" rating E2E test isn't included here: the
// ContextMenu rating popover is already gated off entirely for Jellyfin at
// the UI level (config.serverType === Server.Jellyfin disables the Whisper
// trigger), and PlayerBar's rating widget only renders for Subsonic -- there
// is no real UI path left to reach submitRatingWithQueueFallback's Jellyfin
// branch through, so an E2E test here could only re-confirm the pre-existing
// UI gate via a fragile selector, not Fix 2's actual new behavior. Fix 2 is
// covered directly and reliably at the right level by
// offlineSubmission.test.ts's "surfaces a clear 'not supported' toast for
// Jellyfin ratings" test, which calls the wrapper itself, bypassing the gate.
