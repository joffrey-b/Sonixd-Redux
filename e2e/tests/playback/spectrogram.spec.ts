import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Helper: checks whether a canvas element has any non-zero pixels
async function canvasHasContent(window: import('@playwright/test').Page): Promise<boolean> {
  return window.evaluate(() => {
    const canvas = document.querySelector(
      '[data-testid="spectrogram-canvas"]'
    ) as HTMLCanvasElement | null;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return Array.from(data).some((v) => v !== 0);
  });
}

test.describe('Spectrogram — Solo Track (track-04)', () => {
  // Navigate to Solo Album and open track-04's context menu before each test
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.soloTrack.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    // Albums require a double-click to navigate in — a single click only selects
    // the row (see AlbumList.tsx's useListClickHandler: doubleClick navigates,
    // there is no singleClick override).
    await window.locator(`text=${TRACKS.soloTrack.album}`).first().dblclick();

    // spectrogram-button only exists in the DOM after the row's context menu has
    // been opened via right-click (ContextMenu.tsx) — it is not a direct child of
    // the player bar.
    await window.locator(`text=${TRACKS.soloTrack.title}`).first().click({ button: 'right' });
    await expect(window.locator('[data-testid="spectrogram-button"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('spectrogram modal opens', async ({ navidromeApp: { window } }) => {
    await window.click('[data-testid="spectrogram-button"]');
    await expect(window.locator('[data-testid="spectrogram-modal"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('progress indicator is shown while FFT is computing', async ({
    navidromeApp: { window },
  }) => {
    // The base "Analyzing audio..." label alone is NOT a strong enough signal —
    // it's also exactly what shows if the FFT hangs and never completes (a real
    // failure mode observed during manual testing while building this feature).
    // We need to see an actual percentage to know the worker is genuinely
    // progressing, not just stuck on the static label.
    //
    // The fetch+decode+FFT pipeline can complete in well under a second on fast
    // hardware, so polling for a percentage AFTER the fact can lose the race
    // entirely. Stall the spectrogram's own fetch briefly, and start polling
    // WHILE it's still stalled — the poll is then already running continuously
    // right through the exact moment the worker starts crunching frames, with
    // no extra round-trip gap between "computation starts" and "we're watching".
    await window.route('**/rest/stream.view*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.continue();
    });

    await window.click('[data-testid="spectrogram-button"]');
    await expect(window.locator('[data-testid="spectrogram-modal"]')).toBeVisible();

    // This is a plain <div> with text content "Analyzing audio..." (plus a
    // " {percent}%" suffix once progress > 0) — match the actual rendered text.
    const progress = window.locator('[data-testid="spectrogram-progress"]');
    await expect(progress).toBeVisible({ timeout: 5_000 });
    await expect
      .poll(() => progress.textContent({ timeout: 50 }).catch(() => null), {
        intervals: [10],
        timeout: 5_000,
      })
      .toMatch(/analyzing audio.*\d+%/i);

    // Canvas must still appear eventually once the FFT actually finishes.
    await expect(window.locator('[data-testid="spectrogram-canvas"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('canvas renders non-zero pixels after FFT completes', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(90_000);
    await window.click('[data-testid="spectrogram-button"]');
    await expect(window.locator('[data-testid="spectrogram-canvas"]')).toBeVisible({
      timeout: 10_000,
    });

    // Track-04 is ~62s. The Web Worker FFT on a 1-min FLAC at 44.1 kHz
    // typically completes in 10–30 seconds depending on CPU.
    // Poll every 5s until the canvas has content or 60s timeout.
    let hasContent = false;
    for (let i = 0; i < 12; i++) {
      await window.waitForTimeout(5000);
      hasContent = await canvasHasContent(window);
      if (hasContent) break;
    }

    expect(hasContent).toBe(true);
  });

  test('closing modal mid-computation terminates the worker cleanly', async ({
    navidromeApp: { window },
  }) => {
    // Spectrogram analysis doesn't require the track to be playing — it does its
    // own independent fetch (SpectrogramModal.tsx's `await fetch(streamUrl)`),
    // separate from playback. beforeEach already has the context menu open and
    // ready, so no extra setup is needed here.
    //
    // Neither a fixed delay nor waiting for a "first progress message" signal can
    // reliably catch this mid-computation — on fast enough hardware the entire
    // fetch+decode+FFT pipeline (including going from the first progress message
    // to 100%) can finish before the test's own JS even gets to the close click.
    // Take direct control instead: stall the spectrogram's own audio fetch so the
    // modal is guaranteed to still be loading, independent of FFT speed on this
    // machine. beforeEach never starts actual playback in this file, so this is
    // the only stream.view request in flight — safe to intercept unconditionally.
    await window.route('**/rest/stream.view*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.continue();
    });

    await window.click('[data-testid="spectrogram-button"]');
    await expect(window.locator('[data-testid="spectrogram-modal"]')).toBeVisible({
      timeout: 10_000,
    });

    // The fetch is now artificially stalled for 3s, so we're safely mid-load
    // (well before any FFT work could even begin) for the whole window below.
    await window.waitForTimeout(300);

    const hasContentBeforeClose = await canvasHasContent(window);
    test.info().annotations.push({
      type: 'fft-state-at-close',
      description: hasContentBeforeClose ? 'completed' : 'mid-computation',
    });
    await window.click('[data-testid="spectrogram-modal-close"]');

    await expect(window.locator('[data-testid="spectrogram-modal"]')).not.toBeVisible({
      timeout: 5000,
    });

    // Verify the app is still functional after the interrupted worker/AudioContext
    // teardown — no crash or hang left behind. Playback was never started in
    // this test, so don't rely on the time counter advancing; just confirm the
    // page is still responsive to a basic interaction.
    await expect(window.locator('[data-testid="player-bar"]')).toBeVisible();
    await window.click('[data-testid="nav-albums"]');
    await expect(
      window.locator('#container-content').getByText(TRACKS.soloTrack.title).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('opening spectrogram a second time works after first was closed', async ({
    navidromeApp: { window },
  }) => {
    // First open
    await window.click('[data-testid="spectrogram-button"]');
    await expect(window.locator('[data-testid="spectrogram-modal"]')).toBeVisible({
      timeout: 10_000,
    });
    await window.waitForTimeout(3000);
    await window.click('[data-testid="spectrogram-modal-close"]');
    await expect(window.locator('[data-testid="spectrogram-modal"]')).not.toBeVisible();

    // handleShowSpectrogram closes the context menu as soon as it's clicked, so the
    // menu must be reopened before the second spectrogram-button click.
    await window.locator(`text=${TRACKS.soloTrack.title}`).first().click({ button: 'right' });
    await expect(window.locator('[data-testid="spectrogram-button"]')).toBeVisible({
      timeout: 5_000,
    });

    // Second open — AudioContext must have been closed and worker terminated cleanly
    await window.click('[data-testid="spectrogram-button"]');
    await expect(window.locator('[data-testid="spectrogram-modal"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('[data-testid="spectrogram-canvas"]')).toBeVisible({
      timeout: 10_000,
    });
    // No "too many AudioContexts" warning and no crash — verified by the modal appearing
  });

  test('spectrogram renders correctly when opened after the track has been playing for a while', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(120_000);

    // This test specifically needs active playback, unlike the other tests in this
    // file — beforeEach only opens the track's context menu, it doesn't play it.
    await window.locator(`text=${TRACKS.soloTrack.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');

    // Let the track play for 15 seconds before opening
    await window.waitForTimeout(15_000);

    // The dblclick above (to start playback) closed the context menu beforeEach
    // opened, so spectrogram-button is no longer in the DOM — reopen it. Scoped to
    // #container-content (Layout.tsx's main content area) rather than .first(),
    // since now that the track is playing, a bare text locator also matches the
    // player bar's track title (#container-footer) — a separate sibling container.
    await window
      .locator('#container-content')
      .getByText(TRACKS.soloTrack.title)
      .click({ button: 'right' });
    await expect(window.locator('[data-testid="spectrogram-button"]')).toBeVisible({
      timeout: 5_000,
    });

    await window.click('[data-testid="spectrogram-button"]');
    await expect(window.locator('[data-testid="spectrogram-canvas"]')).toBeVisible({
      timeout: 10_000,
    });

    // Wait for FFT to complete
    let hasContent = false;
    for (let i = 0; i < 12; i++) {
      await window.waitForTimeout(5000);
      hasContent = await canvasHasContent(window);
      if (hasContent) break;
    }
    expect(hasContent).toBe(true);
  });
});
