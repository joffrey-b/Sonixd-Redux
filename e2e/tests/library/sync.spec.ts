import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

test.describe('Library sync', () => {
  test('Navidrome library contains all test tracks', async ({ navidromeApp: { window } }) => {
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(window.locator(`text=${TRACKS.soloTrack.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Search returns correct results', async ({ navidromeApp: { window } }) => {
    await window.click('[data-testid="nav-search"]');
    await window.fill('[data-testid="search-input"]', TRACKS.track01.artist);
    await window.waitForTimeout(1000); // debounce
    await expect(window.locator(`text=${TRACKS.track01.title}`)).toBeVisible({ timeout: 10_000 });
  });

  test('Star a track and it appears in starred', async ({ navidromeApp: { window } }) => {
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    // Albums require a double-click to navigate in — a single click only selects
    // the row (see AlbumList.tsx's useListClickHandler: doubleClick navigates,
    // there is no singleClick override).
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    // Star the first track
    const starBtn = window.locator(`[data-testid="star-${TRACKS.track01.title}"]`).first();
    await expect(starBtn).toBeVisible({ timeout: 10_000 });
    await starBtn.click();
    // Navigate to starred
    await window.click('[data-testid="nav-starred"]');
    await expect(window.locator(`text=${TRACKS.track01.title}`)).toBeVisible({ timeout: 10_000 });
    // Unstar (cleanup)
    await starBtn.click();
  });

  test('Song cache file exists after playing', async ({ navidromeApp: { window: appWindow } }) => {
    // Enable song caching in settings first
    await appWindow.click('[data-testid="settings-link"]');
    await appWindow.click('[data-testid="settings-cache"]');
    // Click the actual checkbox input, not the [data-testid] wrapper around it —
    // StyledCheckbox is a `display: block !important` 300px-wide container with
    // left-aligned label text inside it, so Playwright's default center-click on
    // the wrapper lands in empty space to the right of the real label/input and
    // never toggles it (confirmed via a throwaway diagnostic: the wrapper click
    // changed neither the checkbox's visual state nor the underlying setting,
    // while clicking the input directly changed both and produced a real
    // download.view request and cache file).
    const checkboxInput = appWindow.locator(
      '[data-testid="song-cache-enable"] input[type="checkbox"]'
    );
    const isChecked = await checkboxInput.isChecked();
    if (!isChecked) await checkboxInput.click({ force: true });
    await appWindow.click('[data-testid="nav-albums"]');

    // Songs are only cached once playback for the track fully completes (per
    // CacheConfig.tsx's own description) — wait out the full track, not just a
    // few seconds of playback, before checking for a cache file.
    await expect(appWindow.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    // Albums require a double-click to navigate in — a single click only selects
    // the row (see AlbumList.tsx's useListClickHandler: doubleClick navigates,
    // there is no singleClick override).
    await appWindow.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await appWindow.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await appWindow.waitForSelector('[data-testid="player-bar"]');
    await appWindow.waitForTimeout((TRACKS.track01.durationSeconds + 10) * 1000);

    // Real filesystem check via the bridge, mirroring getSongCachePath()'s own
    // path construction (shared/utils.ts) — not just a "playback started" proxy.
    // Note: the renderer-side `window` must NOT be named `window` in this test's
    // destructured fixture (the convention used everywhere else in this suite) —
    // that would shadow the in-page global `window` referenced inside the
    // evaluate() callback below and make `window.bridge` fail to type-check.
    const songFiles = await appWindow.evaluate(() => {
      const cachePath = window.bridge.settings.get('cachePath') as string;
      const serverBase64 = window.bridge.settings.get('serverBase64') as string;
      const songCachePath = `${cachePath}/sonixd-redux-cache/${serverBase64}/song/`.replace(
        /\/{2,}/g,
        '/'
      );
      return window.bridge.cacheDir.list(songCachePath);
    });

    expect(songFiles.length).toBeGreaterThan(0);
  });
});
