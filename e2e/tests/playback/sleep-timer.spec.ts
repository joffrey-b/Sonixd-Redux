import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Sleep timer — confirmed from source (PlayerBar.tsx, lines ~1440-1550):
//   - Lives entirely in PlayerBar.tsx, no dedicated settings panel or slice.
//     Triggered by a Whisper popover (sleep-timer-button) containing both modes.
//   - "Stop after current song" is a native checkbox bound to a SEPARATE Redux
//     flag, playQueue.stopAfterCurrent (playQueueSlice.ts) — not local state
//     like the fixed-duration timer. Consumed in Player.tsx's onEnded handlers:
//     when the track ends naturally AND stopAfterCurrent is true, it resets
//     the flag, pauses both audio elements, and dispatches PAUSED — critically
//     WITHOUT incrementing currentIndex, so the queue does NOT advance. This
//     is the key distinguishing signal from normal natural-end-and-advance.
//   - Fixed duration is local state (sleepTimerSeconds, in SECONDS) but the UI
//     only offers MINUTE-granularity input: SLEEP_PRESETS = [5,15,30,45,60,90]
//     (minutes — far too long for a test) and a custom StyledInputNumber with
//     min={1} (1 minute = 60s is the practical floor, there is no sub-minute
//     option at all). A useEffect ticks the value down every second via
//     setTimeout; at <= 0, if playing, it calls effectiveHandlePlayPause()
//     (pause) and resets to null — no special "stopped" state, just a normal
//     pause.
//   - Because the test track is 62s and the minimum timer is 60s, the timer
//     fires only ~2s before natural end — too tight to distinguish by
//     reading player-current-time alone. Instead: this app's natural-end
//     behavior (without stopAfterCurrent set) ADVANCES to the next track and
//     keeps PLAYING. So waiting well past both the 60s timer and the 62s
//     natural end and finding playback PAUSED on track01 (not playing track02)
//     unambiguously proves the timer fired, not natural progression.
//   - RSuite NumberInput puts data-testid on the outer wrapper, not the inner
//     input (established gotcha) — sleep-timer-custom-input needs the
//     `input` descendant for .fill().

async function playTrack01(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
  await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');
}

async function playSoloTrack(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.soloTrack.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.soloTrack.album}`).first().dblclick();
  await window.locator(`text=${TRACKS.soloTrack.title}`).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');
}

async function openSleepTimerPopup(window: Page) {
  await window.click('[data-testid="sleep-timer-button"]');
}

test.describe('Sleep timer — after current song', () => {
  test('playback stops after the current track finishes', async ({ navidromeApp: { window } }) => {
    test.setTimeout(120_000);
    await playTrack01(window);

    await openSleepTimerPopup(window);
    await window.click('[data-testid="sleep-timer-stop-after-current-checkbox"]');
    await window.click('[data-testid="sleep-timer-button"]'); // close the popover (toggle)

    // Track is 62s — wait past natural end with a comfortable buffer.
    await window.waitForTimeout(70_000);

    await expect(window.locator('[data-testid="player-play-pause"]')).toHaveAttribute(
      'data-playing',
      'false',
      { timeout: 5_000 }
    );
    // Did NOT advance to track 02 — proves stopAfterCurrent's "pause in place"
    // path fired rather than a normal natural-end-and-advance.
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );
  });

  test('cancelling the sleep timer before it fires lets playback continue', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(120_000);
    await playTrack01(window);

    await openSleepTimerPopup(window);
    await window.click('[data-testid="sleep-timer-stop-after-current-checkbox"]');
    await window.click('[data-testid="sleep-timer-button"]'); // close

    await window.waitForTimeout(5_000); // confirm it's armed before cancelling

    await openSleepTimerPopup(window);
    await window.click('[data-testid="sleep-timer-stop-after-current-checkbox"]'); // un-check
    await window.click('[data-testid="sleep-timer-button"]'); // close

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track02.title,
      { timeout: 75_000 }
    );
  });
});

test.describe('Sleep timer — fixed duration', () => {
  test('playback stops after the configured duration', async ({ navidromeApp: { window } }) => {
    test.setTimeout(120_000);

    // The 60s timer (1 minute, the practical floor) and the 62s track length
    // leave only a ~2s margin. The countdown is 60 sequential
    // setTimeout(fn, 1000) calls, which can drift by more than that over a
    // full minute under real event-loop scheduling — a real run on Test
    // Album's track01 showed the natural end winning the race (advanced to
    // track02 and kept playing), with the now-slightly-late timer then
    // pausing whatever was THEN playing (track02), not a bug in the app.
    //
    // Fix: play the Solo Album's single track instead, with repeat:'one'.
    // incrementCurrentIndex's repeat:'one' branch only skips advancing when
    // there's no next entry in the queue (currentIndex + 1 < length must be
    // false) — on a genuinely single-track queue that's always true, so a
    // natural-end "advance" just restarts the SAME track instead of moving
    // to a different one (this would NOT hold on Test Album, which has
    // track02/03 queued right behind track01). The title assertion below is
    // then robust regardless of which one — timer or natural-end loop — wins
    // the race.
    await playSoloTrack(window);
    const repeatBtn = window.locator('[data-testid="player-repeat"]');
    for (let i = 0; i < 4; i += 1) {
      if ((await repeatBtn.getAttribute('data-repeat-mode')) === 'one') break;
      await repeatBtn.click();
      await window.waitForTimeout(200);
    }

    await openSleepTimerPopup(window);
    await window.fill('[data-testid="sleep-timer-custom-input"] input', '1');
    await window.click('[data-testid="sleep-timer-custom-apply-button"]'); // closes the popover itself

    // Wait comfortably past both the 60s timer and the track's 62s natural end.
    await window.waitForTimeout(75_000);

    await expect(window.locator('[data-testid="player-play-pause"]')).toHaveAttribute(
      'data-playing',
      'false',
      { timeout: 5_000 }
    );
    // Still on the Solo Track — with repeat:'one' on a single-track queue,
    // this holds whether the timer or a natural-end loop-restart happened
    // first; only the timer firing while PLAYING actually pauses it, so
    // ending up paused proves it fired.
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.soloTrack.title
    );
  });
});
