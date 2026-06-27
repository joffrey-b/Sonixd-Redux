import { _electron as electronLauncher } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { SERVERS, TRACKS } from '../../fixtures/constants';

test.describe('Login — Navidrome (Subsonic)', () => {
  test('successful login shows library with content', async ({ freshApp: { window } }) => {
    await window.fill('[data-testid="server-url-input"]', SERVERS.navidrome.url);
    await window.fill('[data-testid="username-input"]', SERVERS.navidrome.username);
    await window.fill('[data-testid="password-input"]', SERVERS.navidrome.password);
    await window.click('[data-testid="connect-button"]');
    // The sidebar (and nav-albums) is always in the DOM, even on the login screen, so
    // checking connect-button is gone is the reliable signal — and it must be checked
    // by polling the live DOM (not tracking a stale node reference via waitForSelector's
    // 'detached' state), since a reload can replace it with a brand-new connect-button
    // if login actually failed.
    await expect(window.locator('[data-testid="connect-button"]')).not.toBeVisible({
      timeout: 30_000,
    });
    await expect(window.locator('[data-testid="nav-albums"]')).toBeVisible({ timeout: 15_000 });

    // nav-albums is a static sidebar item, always present regardless of whether the
    // post-login getAlbumList/getIndexes call actually succeeded — assert real album
    // content loaded, not just the sidebar chrome.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('wrong password shows error', async ({ freshApp: { window } }) => {
    await window.fill('[data-testid="server-url-input"]', SERVERS.navidrome.url);
    await window.fill('[data-testid="username-input"]', SERVERS.navidrome.username);
    await window.fill('[data-testid="password-input"]', 'wrongpassword');
    await window.click('[data-testid="connect-button"]');
    await expect(window.locator('[data-testid="login-error"]')).toBeVisible({ timeout: 10_000 });
  });

  test('unreachable server shows error', async ({ freshApp: { window } }) => {
    await window.fill('[data-testid="server-url-input"]', 'http://localhost:9999');
    await window.fill('[data-testid="username-input"]', 'admin');
    await window.fill('[data-testid="password-input"]', 'admin');
    await window.click('[data-testid="connect-button"]');
    await expect(window.locator('[data-testid="login-error"]')).toBeVisible({ timeout: 15_000 });
  });

  test('credentials are persisted — app remembers login after restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    // Verify logged in
    await expect(window.locator('[data-testid="nav-albums"]')).toBeVisible();

    // Close and relaunch with same userData dir
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
    const window2 = await app2.firstWindow();
    await window2.waitForLoadState('domcontentloaded');

    // Should land directly in the library, not the login screen
    await expect(window2.locator('[data-testid="nav-albums"]')).toBeVisible({ timeout: 15_000 });
    await expect(window2.locator('[data-testid="connect-button"]')).not.toBeVisible();
    await app2.close();
  });
});

test.describe('Login — Jellyfin', () => {
  test('successful Jellyfin login shows library with content', async ({
    jellyfinApp: { window },
  }) => {
    await expect(window.locator('[data-testid="nav-albums"]')).toBeVisible();
    await expect(window.locator('[data-testid="connect-button"]')).not.toBeVisible();

    // Same false-positive risk as the Navidrome test above — assert real content.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
