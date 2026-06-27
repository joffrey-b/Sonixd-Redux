import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Web Audio backend is intentional here, not an oversight: Player.tsx wires
// eq.gains/eq.preampDb to a chain of BiquadFilterNodes (lines ~424-530), so the
// graphic EQ is implemented for Web Audio, not just MPV's buildMpvAfChain.
test.describe('EQ toggle', () => {
  test('EQ can be enabled while music is playing', async ({ navidromeApp: { window } }) => {
    // Start playing
    await window.click('[data-testid="nav-albums"]');
    // Albums require a double-click to navigate in — a single click only selects
    // the row (see AlbumList.tsx's useListClickHandler: doubleClick navigates,
    // there is no singleClick override).
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');
    await window.waitForTimeout(2000);

    // Toggle EQ while playing
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-equalizer"]');
    const eqToggle = window.locator('[data-testid="eq-enable-toggle"]');
    await eqToggle.click();
    await window.waitForTimeout(1000);

    // Playback should still be active after toggling EQ
    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );
  });
});
