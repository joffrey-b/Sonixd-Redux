import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect, mockSaveDialog, mockOpenDialog, loginViaUI } from '../../fixtures';
import { TRACKS, SERVERS } from '../../fixtures/constants';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Settings backup/restore — confirmed from source (BackupConfig.tsx,
// main.dev.mjs, settingsImportValidation.ts):
//   - Lives under the "System" settings tab (settings-cache testid — an old
//     name from before that tab absorbed Server/Cache/Window/Backup config
//     panels together), not a dedicated tab. No testids existed on the
//     Export/Import buttons — added settings-export-button/
//     settings-import-button this session.
//   - Export (export-settings IPC): dialog.showSaveDialog returns
//     { filePath, canceled }. On success, writes
//     JSON.stringify({...settings.store} minus CREDENTIAL_KEYS minus
//     themesDefault minus acceptSelfSigned, null, 2) via fs.writeFileSync
//     SYNCHRONOUSLY before the handler resolves — the renderer's success
//     toast only fires once the file is fully written, so no extra
//     "give the write time" wait is needed after seeing it (the original
//     prompt guessed otherwise).
//   - CREDENTIAL_KEYS: server, serverBase64, serverType, username, password,
//     salt, hash, token, userId, legacyAuth.
//   - Import (import-settings IPC): dialog.showOpenDialog returns
//     { filePaths, canceled }. Parses filePaths[0], runs
//     validateImportedSettings(parsed, settings.store, SETTINGS_DENY_LIST)
//     (settingsImportValidation.ts), which keeps only keys that (a) aren't
//     in the deny list (= CREDENTIAL_KEYS) or 'themesDefault', (b) already
//     exist in the current store, and (c) have a typeof matching the
//     current value — silently dropping everything else, not just
//     credentials. On success: toast "Settings imported. Reloading..." then
//     a real window.location.reload() after a 1s setTimeout — NOT a full
//     Electron app restart, just a renderer reload, so the same
//     app/window/userDataDir handles stay valid throughout.
//   - scrobbleThreshold (PlayerConfig.tsx, under the "playback" tab) is a
//     plain number setting with a real, already-existing UI control — no
//     testid existed, added scrobble-threshold-input this session. Its
//     StyledInputNumber uses defaultValue (uncontrolled), which is fine here
//     since every read in this file happens after a fresh navigation/mount.

async function navigateToBackupSettings(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-cache"]');
  await expect(window.locator('[data-testid="settings-export-button"]')).toBeVisible({
    timeout: 10_000,
  });
}

async function navigateToScrobbleSettings(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-playback"]');
  await expect(window.locator('[data-testid="scrobble-threshold-input"] input')).toBeVisible({
    timeout: 10_000,
  });
}

async function readScrobbleThreshold(window: Page): Promise<number> {
  await navigateToScrobbleSettings(window);
  const val = await window.locator('[data-testid="scrobble-threshold-input"] input').inputValue();
  return Number(val);
}

async function setScrobbleThreshold(window: Page, value: number) {
  await navigateToScrobbleSettings(window);
  await window.fill('[data-testid="scrobble-threshold-input"] input', String(value));
  await window.waitForTimeout(500); // settle wait for settings.set to land
}

async function waitForAppReload(window: Page) {
  await window.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="nav-albums"]');
      return el !== null && el.getAttribute('data-disabled') !== 'true';
    },
    { timeout: 30_000 }
  );
}

async function exportTo(app: ElectronApplication, window: Page, filePath: string) {
  await mockSaveDialog(app, filePath);
  await navigateToBackupSettings(window);
  await window.click('[data-testid="settings-export-button"]');
  await expect(window.locator('text=Settings exported successfully.')).toBeVisible({
    timeout: 10_000,
  });
}

async function importFrom(app: ElectronApplication, window: Page, filePath: string) {
  await mockOpenDialog(app, filePath);
  await navigateToBackupSettings(window);
  // Registered before the click, not after — the renderer's
  // window.location.reload() fires on a 1s delay after the toast (see file
  // header comment above), but nav-albums is already enabled on the current,
  // pre-reload page, so waitForAppReload's readiness check alone can resolve
  // before that reload actually happens. Explicitly waiting for the real
  // 'load' event closes that gap: without it, a second importFrom() call
  // right after this one starts clicking on the stale page while the first
  // reload is still pending, and can trigger its own toast while the first
  // one is still on screen (two stacked "Settings imported. Reloading..."
  // notifications, hit by the sidebar-restore test once it started chaining
  // two imports in the same test).
  const reloadPromise = window.waitForEvent('load', { timeout: 30_000 });
  await window.click('[data-testid="settings-import-button"]');
  await expect(window.locator('text=Settings imported. Reloading...')).toBeVisible({
    timeout: 10_000,
  });
  await reloadPromise;
  await waitForAppReload(window);
}

test.describe('Settings backup / restore', () => {
  test('export writes a valid JSON file containing expected settings keys', async ({
    navidromeApp: { app, window },
  }) => {
    const exportPath = path.join(os.tmpdir(), `sonixd-settings-test-${Date.now()}.json`);

    await exportTo(app, window, exportPath);

    expect(fs.existsSync(exportPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));

    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed)).toBe(false);

    expect(parsed).toHaveProperty('theme');
    expect(parsed).toHaveProperty('scrobbleThreshold');

    // Credential keys must never be exported.
    for (const key of [
      'server',
      'serverBase64',
      'serverType',
      'username',
      'password',
      'salt',
      'hash',
      'token',
      'userId',
      'legacyAuth',
    ]) {
      expect(parsed).not.toHaveProperty(key);
    }
    // Also explicitly excluded by export-settings, beyond the deny list.
    expect(parsed).not.toHaveProperty('themesDefault');
    expect(parsed).not.toHaveProperty('acceptSelfSigned');

    fs.unlinkSync(exportPath);
  });

  test('import applies a valid setting and reloads the app', async ({
    navidromeApp: { app, window },
  }) => {
    test.setTimeout(60_000);
    const importPath = path.join(os.tmpdir(), `sonixd-import-fixture-${Date.now()}.json`);
    fs.writeFileSync(importPath, JSON.stringify({ scrobbleThreshold: 42 }));

    await importFrom(app, window, importPath);

    const value = await readScrobbleThreshold(window);
    expect(value).toBe(42);

    fs.unlinkSync(importPath);
  });

  test('import of a file with credential keys silently skips those keys', async ({
    navidromeApp: { app, window },
  }) => {
    test.setTimeout(60_000);
    const importPath = path.join(os.tmpdir(), `sonixd-import-creds-${Date.now()}.json`);
    fs.writeFileSync(
      importPath,
      JSON.stringify({
        scrobbleThreshold: 77,
        password: 'hacked',
        hash: 'abc123',
        username: 'attacker',
        server: 'http://evil.example.com',
        token: 'evil-token',
      })
    );

    await importFrom(app, window, importPath);

    // The valid, non-credential key was applied.
    const value = await readScrobbleThreshold(window);
    expect(value).toBe(77);

    // Credentials were NOT overwritten — the library still loads under the
    // original test account. If they'd been clobbered with the garbage
    // values above, every subsequent API call would fail and Albums would
    // never show real data.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });

    fs.unlinkSync(importPath);
  });

  test('export then import round-trip restores the original settings', async ({
    navidromeApp: { app, window },
  }) => {
    test.setTimeout(90_000);
    const exportPath = path.join(os.tmpdir(), `sonixd-roundtrip-${Date.now()}.json`);

    // 1. Set a known, distinct value and export it.
    await setScrobbleThreshold(window, 55);
    await exportTo(app, window, exportPath);

    // 2. Change to a different value — this must NOT be what we see at the end.
    await setScrobbleThreshold(window, 65);
    expect(await readScrobbleThreshold(window)).toBe(65);

    // 3. Import the exported file and confirm it restores the value from step 1.
    await importFrom(app, window, exportPath);
    const restored = await readScrobbleThreshold(window);
    expect(restored).toBe(55);

    fs.unlinkSync(exportPath);
  });
});

// allowDevConsole (config.window) and sidebar.selected (config.lookAndFeel)
// are both mirrored into the renderer's Redux store at app boot and read
// from there on every render, NOT read live from the settings store. Import
// and "Reset to Defaults" used to only call settings.set(...)/the
// equivalent and never refresh Redux, so the UI kept showing pre-import/
// pre-reset values until a full app restart. Fixed by dispatching
// replaceState(buildInitialState()) + refreshSettingsFields(...) after both
// operations (main.dev.mjs, configSlice.ts, playQueueSlice.ts).
test.describe('Settings backup / restore — redux-mirrored settings', () => {
  test('import restores allowDevConsole after it was disabled locally', async ({
    navidromeApp: { app, window },
  }) => {
    test.setTimeout(60_000);
    const exportPath = path.join(os.tmpdir(), `sonixd-devconsole-${Date.now()}.json`);
    const toggle = window.locator('[data-testid="allow-dev-console-toggle"]');

    // 1. Turn it on and export.
    await navigateToBackupSettings(window);
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked();
    await exportTo(app, window, exportPath);

    // 2. Turn it back off locally — this is the state that must NOT survive
    // the import below.
    await navigateToBackupSettings(window);
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    // 3. Import the export (still enabled) and confirm the toggle — which
    // reads config.window.allowDevConsole from Redux, not the settings file
    // directly — reflects the restored value after the reload.
    await importFrom(app, window, exportPath);
    await navigateToBackupSettings(window);
    await expect(toggle).toBeChecked();

    fs.unlinkSync(exportPath);
  });

  test('import restores a removed sidebar item (lookAndFeel.sidebar.selected)', async ({
    navidromeApp: { app, window },
  }) => {
    test.setTimeout(60_000);
    const withPodcastsPath = path.join(os.tmpdir(), `sonixd-sidebar-with-${Date.now()}.json`);
    const withoutPodcastsPath = path.join(os.tmpdir(), `sonixd-sidebar-without-${Date.now()}.json`);

    // 1. Export current settings as the "before removal" fixture — podcasts
    // is selected by default for a non-Jellyfin server.
    await exportTo(app, window, withPodcastsPath);
    const withPodcasts = JSON.parse(fs.readFileSync(withPodcastsPath, 'utf-8'));
    expect(withPodcasts.sidebar.selected).toContain('podcasts');

    // 2. Build a second fixture with podcasts removed, simulating the user
    // having unchecked it in Look & Feel at some point in the past.
    const withoutPodcasts = {
      ...withPodcasts,
      sidebar: {
        ...withPodcasts.sidebar,
        selected: withPodcasts.sidebar.selected.filter((s: string) => s !== 'podcasts'),
      },
    };
    fs.writeFileSync(withoutPodcastsPath, JSON.stringify(withoutPodcasts));

    // 3. Importing the "removed" fixture hides Podcasts from the sidebar.
    await importFrom(app, window, withoutPodcastsPath);
    await expect(window.locator('[data-testid="nav-podcasts"]')).toBeHidden({ timeout: 10_000 });

    // 4. Importing the original ("with podcasts") fixture must bring it back
    // — this is the exact bug: Podcasts stayed hidden because the
    // renderer's Redux sidebar.selected was never refreshed after the
    // settings file was overwritten by the prior import.
    await importFrom(app, window, withPodcastsPath);
    await expect(window.locator('[data-testid="nav-podcasts"]')).toBeVisible({ timeout: 10_000 });

    fs.unlinkSync(withPodcastsPath);
    fs.unlinkSync(withoutPodcastsPath);
  });

  test('Reset to Defaults reverts allowDevConsole back to its default value', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    const toggle = window.locator('[data-testid="allow-dev-console-toggle"]');

    // 1. Diverge from the default (false) so the reset has something to undo.
    await navigateToBackupSettings(window);
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked();

    // 2. Reset to defaults — goes through the same redux-refresh path as
    // import-settings (bridge:set-default-settings handler in main.dev.mjs).
    // setDefaultSettings(true) calls settings.clear(), which wipes
    // credentials along with everything else, so this also logs the user
    // out — that's expected (a "reset everything" action can't selectively
    // keep auth), not something to work around.
    await window.click('[data-testid="reset-defaults-button"]');
    const confirmButton = window.locator('[data-testid="reset-defaults-confirm-button"]');
    await expect(confirmButton).toBeVisible({ timeout: 10_000 });
    await confirmButton.click();

    // 3. Log back in, then confirm the toggle shows its default (off) value,
    // read fresh from Redux after the reload — not the stale "on" value
    // from before reset.
    await expect(window.locator('[data-testid="server-url-input"]')).toBeVisible({
      timeout: 30_000,
    });
    await loginViaUI(window, SERVERS.navidrome);
    await navigateToBackupSettings(window);
    await expect(toggle).not.toBeChecked();
  });
});
