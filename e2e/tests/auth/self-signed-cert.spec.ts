import { _electron as electronLauncher } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { SERVERS_HTTPS } from '../../fixtures/constants';

// Self-signed certificate support — confirmed from source:
//   - main.dev.mjs's app.on('certificate-error', ...) reads
//     settings.get('acceptSelfSigned') LIVE on every cert-error event — it is
//     fully reactive, not read once at startup. Toggling it and immediately
//     connecting works in the same session; no app restart is needed for the
//     mechanism itself (the prompt hedged on this without knowing the
//     answer — confirmed by reading the handler directly).
//   - This only covers requests through Chromium's net stack. The app's
//     webPreferences use nodeIntegration: false, so the renderer's axios
//     instances (api.ts/jellyfinApi.ts) use axios's browser/XHR adapter, not
//     its Node adapter — login pings genuinely go through Chromium and are
//     subject to this handler. Confirmed before assuming the toggle has any
//     effect on the login flow at all.
//   - Login.tsx's toggle is an rsuite StyledCheckbox, not a Toggle switch —
//     no testid existed, added accept-self-signed-toggle. Like NumberInput
//     (established gotcha), Checkbox's partitionHTMLProps routes data-testid
//     to the OUTER Box wrapper, not the inner <input type="checkbox"> — read
//     checked-state via the descendant `input[type="checkbox"]`, same
//     pattern as the EQ enable toggle.
//   - The warning <Message> had no testid — added self-signed-warning.
//   - acceptSelfSigned's initial checkbox state is a useState initializer
//     read once at mount from settings.get('acceptSelfSigned') — on a fresh
//     app instance there's no stored value yet, so it correctly starts
//     unchecked; after a restart with the same userDataDir, a fresh mount
//     re-reads the now-persisted value.

function selfSignedToggle(window: Page) {
  return window.locator('[data-testid="accept-self-signed-toggle"]');
}

function selfSignedCheckbox(window: Page) {
  return selfSignedToggle(window).locator('input[type="checkbox"]');
}

async function waitForLibraryLoaded(window: Page) {
  await window.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="nav-albums"]');
      return el !== null && el.getAttribute('data-disabled') !== 'true';
    },
    { timeout: 30_000 }
  );
}

test.describe('Self-signed certificate support', () => {
  test('connection fails with self-signed cert when toggle is off', async ({
    freshApp: { window },
  }) => {
    await window.fill('[data-testid="server-url-input"]', SERVERS_HTTPS.navidrome.url);
    await window.fill('[data-testid="username-input"]', SERVERS_HTTPS.navidrome.username);
    await window.fill('[data-testid="password-input"]', SERVERS_HTTPS.navidrome.password);

    await expect(selfSignedCheckbox(window)).not.toBeChecked();

    await window.click('[data-testid="connect-button"]');

    // A certificate error surfaces as a rejected axios request, caught by
    // Login.tsx's handleConnect and rendered into the same login-error
    // Message used for bad credentials — the test user's credentials are
    // correct, so only a TLS rejection would land here.
    await expect(window.locator('[data-testid="login-error"]')).toBeVisible({ timeout: 15_000 });
  });

  test('security warning is shown when toggle is enabled', async ({ freshApp: { window } }) => {
    await window.click(`[data-testid="accept-self-signed-toggle"]`);
    await expect(selfSignedCheckbox(window)).toBeChecked();

    const warning = window.locator('[data-testid="self-signed-warning"]');
    await expect(warning).toBeVisible({ timeout: 5_000 });
    await expect(warning).toContainText(/warning|security|certificate|risk/i);
  });

  test('connection succeeds with self-signed cert when toggle is on', async ({
    freshApp: { window },
  }) => {
    test.setTimeout(60_000);

    await window.fill('[data-testid="server-url-input"]', SERVERS_HTTPS.navidrome.url);
    await window.fill('[data-testid="username-input"]', SERVERS_HTTPS.navidrome.username);
    await window.fill('[data-testid="password-input"]', SERVERS_HTTPS.navidrome.password);

    await window.click('[data-testid="accept-self-signed-toggle"]');
    await expect(window.locator('[data-testid="self-signed-warning"]')).toBeVisible({
      timeout: 5_000,
    });

    // Reactive mechanism (confirmed above) — connect immediately, no restart.
    await window.click('[data-testid="connect-button"]');

    await waitForLibraryLoaded(window);
  });

  test('toggle state persists on the login screen across app restart', async ({
    freshApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);

    await window.click('[data-testid="accept-self-signed-toggle"]');
    await expect(selfSignedCheckbox(window)).toBeChecked();

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
    await w2.waitForLoadState('domcontentloaded');

    // Login screen reappears — no credentials were ever saved.
    await expect(w2.locator('[data-testid="connect-button"]')).toBeVisible({ timeout: 10_000 });

    await expect(selfSignedCheckbox(w2)).toBeChecked();
    await expect(w2.locator('[data-testid="self-signed-warning"]')).toBeVisible();

    await app2.close();
  });

  test('standard HTTP Navidrome still works normally regardless of toggle state', async ({
    freshApp: { window },
  }) => {
    test.setTimeout(60_000);

    await window.click('[data-testid="accept-self-signed-toggle"]');

    await window.fill('[data-testid="server-url-input"]', 'http://localhost:4533');
    await window.fill('[data-testid="username-input"]', 'admin');
    await window.fill('[data-testid="password-input"]', 'admin');
    await window.click('[data-testid="connect-button"]');

    await waitForLibraryLoaded(window);
  });
});
