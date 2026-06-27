import { test, expect } from '../../fixtures';
import { SERVERS, TRACKS } from '../../fixtures/constants';

test.describe('Server switch', () => {
  test('can switch from Navidrome to Jellyfin and back', async ({ navidromeApp: { window } }) => {
    // Verify library loaded from Navidrome
    await expect(window.locator('[data-testid="nav-albums"]')).toBeVisible();

    // Disconnect
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="disconnect-button"]');
    await expect(window.locator('[data-testid="connect-button"]')).toBeVisible();

    // Connect to Jellyfin
    await window.fill('[data-testid="server-url-input"]', SERVERS.jellyfin.url);
    await window.fill('[data-testid="username-input"]', SERVERS.jellyfin.username);
    await window.fill('[data-testid="password-input"]', SERVERS.jellyfin.password);
    const jellyfinToggle = window.locator('[data-testid="server-type-jellyfin"]');
    if (await jellyfinToggle.isVisible()) await jellyfinToggle.click();
    await window.click('[data-testid="connect-button"]');
    // The sidebar is always in the DOM — wait for the login form to be gone instead.
    // Must poll the live DOM (not track a stale node via waitForSelector's 'detached'
    // state), since a reload can replace it with a brand-new connect-button if login
    // actually failed — a stale-reference check would falsely pass on that new node's
    // predecessor leaving the DOM.
    await expect(window.locator('[data-testid="connect-button"]')).not.toBeVisible({
      timeout: 30_000,
    });
    await expect(window.locator('[data-testid="nav-albums"]')).toBeVisible({ timeout: 15_000 });

    // Library should now be from Jellyfin — verify track title still shows
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`)).toBeVisible({ timeout: 15_000 });
  });
});
