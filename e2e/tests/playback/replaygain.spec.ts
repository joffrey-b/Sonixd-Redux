import { _electron as electronLauncher } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { execSync } from 'child_process';
import { test, expect, switchToMpvBackend, MAIN_JS, ELECTRON_BIN } from '../../fixtures';

// player-get-active-replaygain-mode reports the --replaygain=<mode> flag MPV was
// actually (re)launched with — verifying past the UI layer that selecting a mode
// doesn't just update the dropdown, it propagates through Redux, the MPV restart
// effect, and into the actual spawned process arguments.
async function getActiveReplayGainMode(window: Page): Promise<string | null> {
  return window.evaluate(() =>
    (
      globalThis as unknown as {
        bridge: { ipcRenderer: { invoke: (channel: string) => Promise<string | null> } };
      }
    ).bridge.ipcRenderer.invoke('player-get-active-replaygain-mode')
  );
}

// MPV is spawned as a child of the Electron main process and stays alive (--idle)
// independently of it — if it's still holding the IPC socket/inherited stdio open
// when we ask Electron to close, app.close() hangs waiting on it (same issue
// freshApp's own teardown works around). SIGKILL because MPV does not reliably
// exit on SIGTERM once its controlling app is already gone. Every app.close() in
// this file runs against the MPV backend, so every one needs this first.
async function closeAppKillingMpv(app: ElectronApplication): Promise<void> {
  try {
    execSync('pkill -9 -f mpv 2>/dev/null || true');
  } catch {
    /* ignore */
  }
  await app.close();
}

// Closes the current app and relaunches against the same userData dir — a full
// main-process restart, not just a renderer reload — then verifies the backend,
// the dropdown, and the actually-spawned MPV process all still reflect expectedMode.
// Returns the new app/window so the caller can close them.
async function restartAndVerifyReplayGainPersists(
  app: ElectronApplication,
  userDataDir: string,
  expectedMode: string
): Promise<{ app: ElectronApplication; window: Page }> {
  await closeAppKillingMpv(app);
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
  await w2.click('[data-testid="settings-link"]');
  await w2.click('[data-testid="settings-playback"]');
  // Re-check the backend selector itself, not just replaygain-mode-select — if the
  // backend reverted to 'web' on restart, the MPV settings panel (and this select
  // within it) wouldn't render at all, surfacing as a confusing "element not found"
  // rather than a clear "backend reverted" failure.
  await expect(w2.locator('[data-testid="player-backend-select"]')).toHaveValue('mpv');
  await expect(w2.locator('[data-testid="replaygain-mode-select"]')).toHaveValue(expectedMode);
  // And confirm MPV was actually relaunched with the mode again post-restart — not
  // just that the dropdown remembered its own value.
  await expect.poll(() => getActiveReplayGainMode(w2), { timeout: 10_000 }).toBe(expectedMode);
  return { app: app2, window: w2 };
}

test.describe('ReplayGain', () => {
  test('ReplayGain track mode can be enabled and persists', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(90_000);
    await switchToMpvBackend(window);
    // switchToMpvBackend navigates to the Albums page as its last step (to trigger
    // and confirm MPV initialization) — navigate back to Settings > Playback before
    // interacting with the ReplayGain select, which only renders on that page.
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-playback"]');
    const rgSelect = window.locator('[data-testid="replaygain-mode-select"]');
    await rgSelect.selectOption('track');
    // Changing the select triggers an async MPV restart (the player-restart IPC
    // call) — poll the actual spawned process's mode rather than asserting the
    // instant the dropdown updates, which only proves the UI state changed.
    await expect.poll(() => getActiveReplayGainMode(window), { timeout: 10_000 }).toBe('track');

    const { app: app2 } = await restartAndVerifyReplayGainPersists(app, userDataDir, 'track');
    await closeAppKillingMpv(app2);
  });

  test('ReplayGain album mode can be enabled and persists', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(90_000);
    await switchToMpvBackend(window);
    // See comment above — switchToMpvBackend leaves us on the Albums page.
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-playback"]');
    const rgSelect = window.locator('[data-testid="replaygain-mode-select"]');
    await rgSelect.selectOption('album');
    await expect(rgSelect).toHaveValue('album');
    await expect.poll(() => getActiveReplayGainMode(window), { timeout: 10_000 }).toBe('album');

    const { app: app2 } = await restartAndVerifyReplayGainPersists(app, userDataDir, 'album');
    await closeAppKillingMpv(app2);
  });

  test('ReplayGain none disables processing', async ({ navidromeApp: { window } }) => {
    await switchToMpvBackend(window);
    // See comment above — switchToMpvBackend leaves us on the Albums page.
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-playback"]');
    const rgSelect = window.locator('[data-testid="replaygain-mode-select"]');
    await rgSelect.selectOption('no');
    await expect(rgSelect).toHaveValue('no');
    // Confirm MPV was explicitly relaunched with --replaygain=no — proves the
    // wiring works for disabling it too, not just that it happened to start there.
    await expect.poll(() => getActiveReplayGainMode(window), { timeout: 10_000 }).toBe('no');
  });
});
