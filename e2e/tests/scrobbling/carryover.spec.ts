import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS, SCROBBLE_MIN_SECONDS, SCROBBLE_WAIT_MS } from '../../fixtures/constants';
import { isRealScrobble } from '../../fixtures/scrobbleHelpers';

// Regression test for a fixed bug: scrobbling track A at its threshold, then
// switching to track B while A still had a few seconds left, caused B to
// scrobble immediately on play AND again at B's own threshold — two
// scrobbles for one play-through of B. This verifies B does not scrobble
// until it independently crosses its own threshold, exactly once.
async function runNoCarryoverScrobble(window: Page, isScrobble: (url: string) => boolean) {
  test.setTimeout(240_000);

  // Navigate to album, play track 01
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
  await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');

  // React to track 01's own scrobble actually firing (~55.8s into a 62s
  // track) rather than waiting the full SCROBBLE_WAIT_MS test budget (65.8s)
  // — the latter would overshoot past the track's natural end, leaving no
  // "few seconds left" to switch tracks during, which is the whole point of
  // this regression.
  await window.waitForRequest((req) => isScrobble(req.url()), {
    timeout: (SCROBBLE_MIN_SECONDS + 30) * 1000,
  });

  // Track 01's scrobble just fired. Only start counting FURTHER scrobbles
  // from here — registering the route handler before this point would race
  // the route's own async delivery against waitForRequest's resolution for
  // that same first request, with no guaranteed ordering between the two.
  let scrobbleCount = 0;
  await window.route('**/*', async (route) => {
    if (isScrobble(route.request().url())) scrobbleCount++;
    await route.continue();
  });

  // Immediately switch to track 02 while track 01 still has a few seconds left.
  await window.locator(`text=${TRACKS.track02.title}`).first().dblclick();
  await window.waitForFunction(
    (title) => {
      const el = document.querySelector('[data-testid="player-track-title"]');
      return el?.textContent?.includes(title);
    },
    TRACKS.track02.title,
    { timeout: 10_000 }
  );

  // Regression check: track 02 must NOT scrobble immediately on play.
  // Wait a few seconds — well under the 30s Subsonic minimum — and confirm
  // no scrobble has fired yet.
  await window.waitForTimeout(5_000);
  expect(scrobbleCount).toBe(0); // no immediate carryover scrobble for track 02

  // Now wait for track 02 to legitimately cross ITS OWN threshold.
  await window.waitForTimeout(SCROBBLE_WAIT_MS);
  expect(scrobbleCount).toBe(1); // exactly one new scrobble — track 02's own
}

test.describe('Scrobble carryover regression — Navidrome + Web Audio', () => {
  test('switching tracks after a scrobble does not carry over to the next track', async ({
    navidromeApp: { window },
  }) => {
    await runNoCarryoverScrobble(window, isRealScrobble);
  });
});

// The bug was specifically reported on MPV — this is the variant that must
// not regress. The Web Audio variant above is included for parity/coverage
// but is not known to have exhibited the bug.
test.describe('Scrobble carryover regression — Navidrome + MPV', () => {
  test('switching tracks after a scrobble does not carry over to the next track', async ({
    navidromeAppMpv: { window },
  }) => {
    await runNoCarryoverScrobble(window, isRealScrobble);
  });
});
