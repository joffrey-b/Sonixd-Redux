import type { Page } from '@playwright/test';
import { _electron as electronLauncher } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Lyrics come from the Navidrome server (Subsonic getLyricsBySongId, falling
// back to getLyrics) — not a local format this app parses itself. Confirmed
// via direct API inspection and a disposable diagnostic test:
//   - track01 / track02: e2e/test-music/.../track-0{1,2}.lrc, synced, 7 lines
//     each at 0/8/16/24/32/40/48s ("First/Second/.../Seventh lyric line" and
//     "Track two first/.../seventh line" respectively).
//   - track03: e2e/test-music/.../track-03.txt, unsynced, 3 lines
//     ("Unsynced line one/two/three").
//   - soloTrack (track-04) and jazzTrack (track-05) have no sidecar — used as
//     no-lyrics controls.
// All lines within a track share no distinguishing text in the earlier
// drafts of these fixtures, so assertions are anchored on the data-index/
// data-time/data-active attributes on [data-testid="lyrics-line"] rather
// than line text alone.

async function playTrack(window: Page, track: { album: string; title: string }) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${track.album}`).first()).toBeVisible({ timeout: 15_000 });
  await window.locator(`text=${track.album}`).first().dblclick();
  await window.locator(`text=${track.title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');
}

async function openLyrics(window: Page) {
  await window.click('[data-testid="lyrics-bubble"]');
  await expect(window.locator('[data-testid="lyrics-modal"]')).toBeVisible({ timeout: 5_000 });
}

test.describe('Lyrics bubble visibility', () => {
  test('bubble appears next to song title when a lyrics sidecar exists', async ({
    navidromeApp: { window },
  }) => {
    await playTrack(window, TRACKS.track01);
    await expect(window.locator('[data-testid="lyrics-bubble"]')).toBeVisible();
  });

  test('bubble does NOT appear when no lyrics sidecar exists', async ({
    navidromeApp: { window },
  }) => {
    await playTrack(window, TRACKS.soloTrack);
    await expect(window.locator('[data-testid="lyrics-bubble"]')).not.toBeVisible();
  });
});

test.describe('Synced lyrics (track-01)', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await playTrack(window, TRACKS.track01);
  });

  test('window opens showing artist and title in the header', async ({
    navidromeApp: { window },
  }) => {
    await openLyrics(window);
    await expect(window.locator('[data-testid="lyrics-header"]')).toHaveText(
      `${TRACKS.track01.artist} — ${TRACKS.track01.title}`
    );
  });

  test('first line is highlighted at the start of playback', async ({
    navidromeApp: { window },
  }) => {
    await openLyrics(window);
    await expect(window.locator('[data-testid="lyrics-line"][data-index="0"]')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  test('highlight advances to the next line as playback crosses each timestamp', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    await openLyrics(window);

    // Lines at 0/8/16/24/32/40/48s. Wait comfortably between 8s and 16s.
    await window.waitForTimeout(12_000);
    await expect(window.locator('[data-testid="lyrics-line"][data-index="1"]')).toHaveAttribute(
      'data-active',
      'true'
    );

    // Now comfortably between 16s and 24s.
    await window.waitForTimeout(8_000);
    await expect(window.locator('[data-testid="lyrics-line"][data-index="2"]')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  test('the active line stays within the visible scroll area as it advances', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    await openLyrics(window);

    const checkActiveLineInView = async () => {
      const containerBox = await window
        .locator('[data-testid="lyrics-scroll-container"]')
        .boundingBox();
      const activeBox = await window
        .locator('[data-testid="lyrics-line"][data-active="true"]')
        .boundingBox();
      if (!containerBox || !activeBox) throw new Error('missing bounding box');
      expect(activeBox.y).toBeGreaterThanOrEqual(containerBox.y - 1);
      expect(activeBox.y + activeBox.height).toBeLessThanOrEqual(
        containerBox.y + containerBox.height + 1
      );
    };

    await checkActiveLineInView(); // index 0
    await window.waitForTimeout(12_000); // advance to index 1 (between 8s and 16s)
    await checkActiveLineInView();
  });
});

test.describe('Synced lyrics — seeking interactions', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await playTrack(window, TRACKS.track01);
    await openLyrics(window);
  });

  test('clicking a lyric line seeks the player to that timestamp', async ({
    navidromeApp: { window },
  }) => {
    // index 4 = "Fifth lyric line" @ 32s
    await window.locator('[data-testid="lyrics-line"][data-index="4"]').click();
    await window.waitForTimeout(500);
    const timeText = await window.locator('[data-testid="player-current-time"]').textContent();
    const [min, sec] = (timeText ?? '0:00').split(':').map(Number);
    const seconds = min * 60 + sec;
    expect(seconds).toBeGreaterThanOrEqual(30);
    expect(seconds).toBeLessThanOrEqual(35);
  });

  test('seeking via the main player bar updates the lyrics highlight to match', async ({
    navidromeApp: { window },
  }) => {
    // Close the lyrics window first — its backdrop sits on top of the main
    // player bar and would intercept a coordinate-based click on the seek
    // bar (this is the same backdrop behavior the click-away-closes test
    // below relies on).
    await window.mouse.click(10, 10);
    await expect(window.locator('[data-testid="lyrics-modal"]')).not.toBeVisible({
      timeout: 5_000,
    });

    const seekBar = window.locator('[data-testid="player-seek-bar"]');
    const box = await seekBar.boundingBox();
    if (!box) throw new Error('player-seek-bar not found or not visible');
    // ~44s of a 62s track — comfortably between the 40s and 48s lines.
    await window.mouse.click(
      box.x + box.width * (44 / TRACKS.track01.durationSeconds),
      box.y + box.height / 2
    );
    await window.waitForTimeout(500);

    // Reopen lyrics and confirm the highlight already reflects the seek.
    await openLyrics(window);
    // index 5 = "Sixth lyric line" @ 40s
    await expect(window.locator('[data-testid="lyrics-line"][data-index="5"]')).toHaveAttribute(
      'data-active',
      'true'
    );
  });
});

test.describe('Synced lyrics — in-window controls', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    // "Test Album" queues track02, track03 immediately after track01.
    await playTrack(window, TRACKS.track01);
    await openLyrics(window);
  });

  test('the progress bar inside the lyrics window seeks playback', async ({
    navidromeApp: { window },
  }) => {
    const seekBar = window.locator('.lyrics-seek-bar');
    const box = await seekBar.boundingBox();
    if (!box) throw new Error('lyrics-seek-bar not found or not visible');
    await window.mouse.click(
      box.x + box.width * (44 / TRACKS.track01.durationSeconds),
      box.y + box.height / 2
    );
    await window.waitForTimeout(500);
    await expect(window.locator('[data-testid="lyrics-line"][data-index="5"]')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  test('the next button inside the lyrics window advances to the next track', async ({
    navidromeApp: { window },
  }) => {
    await window.click('[data-testid="lyrics-next"]');
    await expect(window.locator('[data-testid="player-track-title"]')).toHaveText(
      TRACKS.track02.title,
      { timeout: 10_000 }
    );
    await expect(window.locator('[data-testid="lyrics-modal"]')).toBeVisible();
    await expect(window.locator('[data-testid="lyrics-header"]')).toHaveText(
      `${TRACKS.track02.artist} — ${TRACKS.track02.title}`
    );
  });

  test('the previous button inside the lyrics window goes to the previous track', async ({
    navidromeApp: { window },
  }) => {
    await window.click('[data-testid="lyrics-next"]');
    await expect(window.locator('[data-testid="player-track-title"]')).toHaveText(
      TRACKS.track02.title,
      { timeout: 10_000 }
    );
    // Click previous quickly — default directPreviousTrack=false only jumps
    // back (rather than restarting) if played less than 5s into the track.
    await window.click('[data-testid="lyrics-previous"]');
    await expect(window.locator('[data-testid="player-track-title"]')).toHaveText(
      TRACKS.track01.title,
      { timeout: 10_000 }
    );
  });
});

test('clicking away from the lyrics window closes it', async ({ navidromeApp: { window } }) => {
  await playTrack(window, TRACKS.track01);
  await openLyrics(window);
  // RSuite's Modal closes via its backdrop's onClick -> onClose, but a
  // locator-based click on an "outside" page element would be intercepted by
  // the backdrop overlay anyway (and fail Playwright's actionability check),
  // so click a raw coordinate in a corner clearly outside the centered,
  // sm-sized dialog instead.
  await window.mouse.click(10, 10);
  await expect(window.locator('[data-testid="lyrics-modal"]')).not.toBeVisible({ timeout: 5_000 });
});

test.describe('Unsynced lyrics (track-03)', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await playTrack(window, TRACKS.track03);
    await openLyrics(window);
  });

  test('panel displays the full unsynced text', async ({ navidromeApp: { window } }) => {
    const lines = window.locator('[data-testid="lyrics-line"]');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toHaveText('Unsynced line one');
    await expect(lines.nth(1)).toHaveText('Unsynced line two');
    await expect(lines.nth(2)).toHaveText('Unsynced line three');
  });

  test('no line is highlighted as active during playback', async ({ navidromeApp: { window } }) => {
    await window.waitForTimeout(3_000);
    await expect(window.locator('[data-testid="lyrics-line"][data-active="true"]')).toHaveCount(0);
  });

  test('clicking a lyric line does NOT seek the player', async ({ navidromeApp: { window } }) => {
    const toSeconds = (t: string | null) => {
      const [m, s] = (t ?? '0:00').split(':').map(Number);
      return m * 60 + s;
    };

    const before = await window.locator('[data-testid="player-current-time"]').textContent();
    await window.locator('[data-testid="lyrics-line"]').first().click();
    await window.waitForTimeout(1_000);
    const after = await window.locator('[data-testid="player-current-time"]').textContent();

    // Only natural playback progression (~1s), not a jump to a clicked line.
    expect(toSeconds(after) - toSeconds(before)).toBeLessThanOrEqual(3);
  });

  test('lyrics must be scrolled manually — no auto-scroll occurs', async ({
    navidromeApp: { window },
  }) => {
    const container = window.locator('[data-testid="lyrics-scroll-container"]');
    const before = await container.evaluate((el) => el.scrollTop);
    await window.waitForTimeout(3_000);
    const after = await container.evaluate((el) => el.scrollTop);
    expect(after).toBe(before);
  });
});

test.describe('Lyrics zoom', () => {
  test('zoom slider changes the lyrics text size', async ({ navidromeApp: { window } }) => {
    await playTrack(window, TRACKS.track01);
    await openLyrics(window);

    const before = await window
      .locator('[data-testid="lyrics-scroll-container"]')
      .evaluate((el) => getComputedStyle(el).fontSize);

    // react-slider thumb — not a native range input. Home jumps to min (10),
    // then 10 ArrowRight presses (step=1) land at 20, clearly off the default (15).
    const thumb = window.locator('.lyrics-zoom-slider .thumb');
    await thumb.focus();
    await thumb.press('Home');
    for (let i = 0; i < 10; i += 1) await thumb.press('ArrowRight');

    await expect(thumb).toHaveAttribute('aria-valuenow', '20');
    const after = await window
      .locator('[data-testid="lyrics-scroll-container"]')
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(after).not.toBe(before);
  });

  test('zoom level persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await playTrack(window, TRACKS.track01);
    await openLyrics(window);

    const thumb = window.locator('.lyrics-zoom-slider .thumb');
    await thumb.focus();
    await thumb.press('End'); // jump to max (28) — clearly non-default
    await window.waitForTimeout(500); // let settings.set('lyricsFontSize', ...) land

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

    await playTrack(w2, TRACKS.track01);
    await openLyrics(w2);
    await expect(w2.locator('.lyrics-zoom-slider .thumb')).toHaveAttribute('aria-valuenow', '28');
    await app2.close();
  });
});

test.describe('Lyrics window across track changes', () => {
  test("window stays open and shows the new track's lyrics when the track changes", async ({
    navidromeApp: { window },
  }) => {
    await playTrack(window, TRACKS.track01);
    await openLyrics(window);

    // The lyrics modal's backdrop intercepts pointer events on anything
    // outside the dialog (confirmed via a real Playwright actionability
    // timeout when this test used the main player bar's next button instead)
    // — only in-modal controls are clickable while it's open.
    await window.click('[data-testid="lyrics-next"]');
    await expect(window.locator('[data-testid="player-track-title"]')).toHaveText(
      TRACKS.track02.title,
      { timeout: 10_000 }
    );

    await expect(window.locator('[data-testid="lyrics-modal"]')).toBeVisible();
    await expect(window.locator('[data-testid="lyrics-header"]')).toHaveText(
      `${TRACKS.track02.artist} — ${TRACKS.track02.title}`
    );
    await expect(window.locator('[data-testid="lyrics-line"]').first()).toHaveText(
      'Track two first line'
    );
  });

  // Confirmed from source (LyricsModal.tsx) and verified by an actual test
  // run: lastLyricsRef is only overwritten when the new track's lyrics data
  // has at least one line, so the rendered LINES keep showing the PREVIOUS
  // track's stale lyrics indefinitely once advancing to a track with none —
  // no empty state, no auto-close. The header is a separate story: title/
  // artist are passed as plain props sourced live from playQueue (not from
  // the stale-retained lyrics data), so the header updates to the NEW track
  // immediately while the lines below it remain stale — a genuine mismatch
  // between header and body, not a guess.
  test("window keeps showing the previous track's lyrics when advancing to a track with none", async ({
    navidromeApp: { window },
  }) => {
    await playTrack(window, TRACKS.track03);

    // track03 is the last track in "Test Album" with repeat:none, so the
    // queue's own "next" would otherwise be a no-op. Queue the no-lyrics
    // Solo Track immediately after it via "Add to queue (next)" — done here,
    // before the modal opens, since its backdrop blocks pointer events on
    // anything outside the dialog (confirmed via a real Playwright
    // actionability timeout earlier), so the sidebar/library can't be
    // touched once it's open.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.soloTrack.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.soloTrack.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.soloTrack.title}`).first().click({ button: 'right' });
    await expect(window.locator('[data-testid="context-menu-play-next"]')).toBeVisible({
      timeout: 5_000,
    });
    await window.click('[data-testid="context-menu-play-next"]');

    await openLyrics(window);
    await expect(window.locator('[data-testid="lyrics-line"]').first()).toHaveText(
      'Unsynced line one'
    );

    // Now advance via the in-modal next button — the only control still
    // reachable while the backdrop is up — into the queued no-lyrics track.
    await window.click('[data-testid="lyrics-next"]');
    await expect(window.locator('[data-testid="player-track-title"]')).toHaveText(
      TRACKS.soloTrack.title,
      { timeout: 10_000 }
    );

    await expect(window.locator('[data-testid="lyrics-modal"]')).toBeVisible();
    // Header reflects the new (no-lyrics) track immediately...
    await expect(window.locator('[data-testid="lyrics-header"]')).toHaveText(
      `${TRACKS.soloTrack.artist} — ${TRACKS.soloTrack.title}`
    );
    // ...while the lines underneath are still track03's stale content.
    await expect(window.locator('[data-testid="lyrics-line"]').first()).toHaveText(
      'Unsynced line one'
    );
  });
});
