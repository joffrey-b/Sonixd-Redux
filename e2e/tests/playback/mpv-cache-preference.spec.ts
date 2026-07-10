import type { ElectronApplication } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// MPV runs as a native subprocess (see the node-mpv IPC socket wiring in
// src/main.dev.mjs) and issues its own HTTP requests through its internal ffmpeg
// demuxer -- entirely outside Chromium's network stack. Playwright's page-level
// `window.route()` interception (used for the equivalent web-backend cache test
// in e2e/tests/library/sync.spec.ts) cannot observe those requests, and the
// only main-process debug hook that logs the loaded URL (`mpv-debug-log`) is
// gated on `NODE_ENV === 'development'`, which is compiled out of the
// production bundle these fixtures launch (`main.prod.js`, built via
// `webpack.config.main.prod.mjs` under NODE_ENV=production).
//
// Instead, this test adds a second, read-only listener on the `player-set-queue`
// IPC channel that MpvPlayer.tsx's fixed call sites send on -- ipcMain.on()
// supports multiple independent listeners per channel, so this doesn't
// replace or interfere with the app's own handler. This observes exactly the
// value our fix (resolveSongPlaybackSource) resolved and handed to MPV, which
// is the actual causal mechanism under test. Mirrors the existing
// mockOpenExternal/mockSaveDialog helpers in e2e/fixtures/index.ts, which use
// the same app.evaluate() main-process access point.
async function captureQueueCalls(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__queueCalls = [];
    ipcMain.on('player-set-queue', (_event, payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__queueCalls.push(payload);
    });
  });
}

async function getLastQueueCall(
  app: ElectronApplication
): Promise<{ current?: string; next?: string; pause?: boolean } | undefined> {
  return app.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (globalThis as any).__queueCalls || [];
    return calls[calls.length - 1];
  });
}

test.describe('MPV prefers local cache over network stream', () => {
  test('second playback of a cached track sends the cached file path to MPV, not the stream URL', async ({
    navidromeAppMpv: { app, window },
  }) => {
    test.setTimeout(180_000);

    // Enable song caching
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-cache"]');
    const cacheToggle = window.locator('[data-testid="song-cache-enable"] input[type="checkbox"]');
    if (!(await cacheToggle.isChecked())) await cacheToggle.click();

    // Play track-01 to full completion so it gets opportunistically cached
    // (caching only fires on natural end, per existing behavior -- do not
    // skip/seek near the end, let it play out fully)
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');

    // Wait for the track to play to completion (62s track + buffer)
    await window.waitForTimeout((TRACKS.track01.durationSeconds + 10) * 1000);

    // Start observing player-set-queue calls, then play the SAME track again
    await captureQueueCalls(app);
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForTimeout(5_000); // give the effect + cache.exists() check time to resolve

    // Confirm playback actually started (proves it's not just failing silently)
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );
    await window.waitForFunction(
      () => document.querySelector('[data-testid="player-current-time"]')?.textContent !== '0:00',
      { timeout: 15_000 }
    );

    const lastCall = await getLastQueueCall(app);
    expect(lastCall?.current).toBeTruthy();
    // The critical assertion: the resolved path is a local cache file, not a
    // network stream URL
    expect(lastCall?.current).not.toMatch(/^https?:\/\//);
    expect(lastCall?.current).not.toContain('/rest/stream.view');
    expect(lastCall?.current).toMatch(/\.flac$/);
  });

  test('a track with no cached copy still sends its network stream URL to MPV (regression check)', async ({
    navidromeAppMpv: { app, window },
  }) => {
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-cache"]');
    const cacheToggle = window.locator('[data-testid="song-cache-enable"] input[type="checkbox"]');
    if (!(await cacheToggle.isChecked())) await cacheToggle.click();

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    // Start observing BEFORE the first (and only) play of this never-played
    // track -- freshApp gives every test a brand-new, empty cache directory
    await captureQueueCalls(app);
    await window.locator(`text=${TRACKS.track03.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');
    await window.waitForTimeout(5_000);

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track03.title
    );

    const lastCall = await getLastQueueCall(app);
    expect(lastCall?.current).toBeTruthy();
    // This is the regression guard: an uncached track's resolved source must
    // still be the network stream URL -- confirms the fix didn't break the
    // normal online path
    expect(lastCall?.current).toContain('/rest/stream.view');
  });

  test('gapless auto-advance into a cached track uses the cached file, not the stream URL', async ({
    navidromeAppMpv: { app, window },
  }) => {
    // This is the scenario the "current"-only version of this fix missed:
    // gapless auto-advance through an already-cached album (the most common
    // real-world way to hit the original bug) still streamed every track,
    // because the *preloaded* "next" track was never resolved against the
    // cache -- only the actively-loading "current" track was. This test
    // proves the preload itself is cache-aware, and that a real, unattended
    // auto-advance transition still plays through correctly using it.
    test.setTimeout(300_000);

    // Enable song caching
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-cache"]');
    const cacheToggle = window.locator('[data-testid="song-cache-enable"] input[type="checkbox"]');
    if (!(await cacheToggle.isChecked())) await cacheToggle.click();

    // Dblclicking track01 here auto-queues track02/track03 right behind it
    // (setPlayQueueByRowClick queues the whole album table) -- this is what
    // lets natural playback advance from track01 -> track02 later in this
    // test with no further clicks.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    // Play track01 to completion so it gets cached
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');
    await window.waitForTimeout((TRACKS.track01.durationSeconds + 10) * 1000);

    // Play track02 to completion so it, too, gets cached
    await window.locator(`text=${TRACKS.track02.title}`).first().dblclick();
    await window.waitForTimeout((TRACKS.track02.durationSeconds + 10) * 1000);

    // Both tracks are now cached. Replay track01 -- re-queuing track02 right
    // behind it again -- and inspect what MPV was handed to preload for the
    // upcoming gapless transition into track02.
    await captureQueueCalls(app);
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForTimeout(5_000); // let the effect + cache.exists() checks resolve

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );

    const queueCall = await getLastQueueCall(app);
    expect(queueCall?.next).toBeTruthy();
    // The critical assertion: the preloaded "next" track (track02, queued
    // for the gapless auto-advance about to happen) is a local cache file,
    // not a network stream URL
    expect(queueCall?.next).not.toMatch(/^https?:\/\//);
    expect(queueCall?.next).not.toContain('/rest/stream.view');
    expect(queueCall?.next).toMatch(/\.flac$/);

    // Now let track01 play out completely, unattended, so MPV auto-advances
    // into track02 entirely on its own using that cache-resolved preload --
    // confirming the actual gapless transition still plays through cleanly,
    // with no manual click.
    await window.waitForTimeout((TRACKS.track01.durationSeconds + 10) * 1000);
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track02.title
    );
    await window.waitForFunction(
      () => document.querySelector('[data-testid="player-current-time"]')?.textContent !== '0:00',
      { timeout: 15_000 }
    );
  });
});
