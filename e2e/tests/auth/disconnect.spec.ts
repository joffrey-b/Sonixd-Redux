import { test, expect } from '../../fixtures';

test.describe('Disconnect', () => {
  test('disconnect shows login screen', async ({ navidromeApp: { window } }) => {
    // Navigate to settings or find disconnect button
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="disconnect-button"]');
    await expect(window.locator('[data-testid="connect-button"]')).toBeVisible({ timeout: 10_000 });
  });

  test('after disconnect credentials are cleared', async ({
    navidromeApp: { window: appWindow },
  }) => {
    await appWindow.click('[data-testid="settings-link"]');
    await appWindow.click('[data-testid="disconnect-button"]');
    await expect(appWindow.locator('[data-testid="connect-button"]')).toBeVisible({
      timeout: 10_000,
    });

    // Verify UI-visible fields
    await expect(appWindow.locator('[data-testid="server-url-input"]')).toHaveValue('');
    await expect(appWindow.locator('[data-testid="username-input"]')).toHaveValue('');

    // Verify credential keys are actually cleared from electron-store, not just the
    // UI-visible field bound to one of them — bridge:settings:disconnect clears 11
    // keys total (server, serverBase64, serverType, username, password, salt, hash,
    // token, userId, legacyAuth, deviceId, musicFolder).
    const [server, token, hash, username] = await Promise.all([
      appWindow.evaluate(() => window.bridge.settings.get('server')),
      appWindow.evaluate(() => window.bridge.settings.get('token')),
      appWindow.evaluate(() => window.bridge.settings.get('hash')),
      appWindow.evaluate(() => window.bridge.settings.get('username')),
    ]);
    expect(server).toBeFalsy();
    expect(token).toBeFalsy();
    expect(hash).toBeFalsy();
    expect(username).toBeFalsy();
  });
});
