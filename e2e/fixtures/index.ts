import { test as base, _electron as electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

// Path to built main process entry point after `yarn build`
export const MAIN_JS = path.join(__dirname, '../../src/main.prod.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const ELECTRON_BIN = require('electron') as unknown as string;

// Explicit MPV binary path — avoids PATH lookup failures when Electron is launched
// programmatically by Playwright with a stripped-down PATH that may omit /usr/bin.
export const MPV_BIN = '/usr/bin/mpv';

type AppFixture = {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
};

type LoggedInFixture = AppFixture & {
  serverUrl: string;
};

export type BackendFixture = LoggedInFixture & {
  backend: 'web' | 'mpv';
};

export async function loginViaUI(
  window: Page,
  opts: { url: string; username: string; password: string; type?: string }
) {
  await window.fill('[data-testid="server-url-input"]', opts.url);
  await window.fill('[data-testid="username-input"]', opts.username);
  await window.fill('[data-testid="password-input"]', opts.password);
  if (opts.type === 'jellyfin') {
    // Select Jellyfin server type if the UI has a toggle
    const jellyfinToggle = window.locator('[data-testid="server-type-jellyfin"]');
    if (await jellyfinToggle.isVisible()) await jellyfinToggle.click();
  }
  await window.click('[data-testid="connect-button"]');
  // The sidebar (and its nav-albums item) is always present in the DOM, even on the
  // login screen — disableSidebar only sets data-disabled on each nav item (a JS-level
  // check inside RSuite's Nav.Item click handler, not a native HTML disabled attribute),
  // it doesn't unmount anything. Waiting for visibility or for a stale element reference
  // to detach both race ahead of the actual async login flow (network auth -> IPC
  // settings persistence -> window.location.reload()) and can resolve on a transient
  // mid-reload DOM state. Polling the live data-disabled attribute is the one signal
  // that's actually tied to whether login succeeded.
  await expect(window.locator('[data-testid="nav-albums"]')).toHaveAttribute(
    'data-disabled',
    'false',
    { timeout: 30_000 }
  );
}

// Switches the running app to the MPV backend via the Settings UI, then sets an
// explicit absolute MPV path (see MPV_BIN above) so the main process's binary lookup
// can't fail due to a stripped PATH. The mpv-path-input field is gated behind
// {isMpv && ...} in PlaybackConfig.tsx, so it doesn't exist in the DOM until the
// backend selector already reads 'mpv' — the path must be set AFTER switching, not
// before.
export async function switchToMpvBackend(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-playback"]');

  // Step 1: switch backend FIRST — this makes the MPV settings panel render
  await window.locator('[data-testid="player-backend-select"]').selectOption('mpv');

  // Step 2: wait for the MPV settings panel to appear — proves the Redux action
  // landed and the panel conditionally rendered (not just that selectOption resolved)
  await window.waitForSelector('[data-testid="mpv-path-input"]', { timeout: 10_000 });

  // Step 3: set the explicit binary path — avoids PATH lookup failure in
  // Playwright's programmatic Electron launch environment
  await window.locator('[data-testid="mpv-path-input"]').fill(MPV_BIN);

  // Step 4: wait for the ReplayGain select to appear — the MPV-exclusive panel
  // that appears only once all MPV settings have rendered; a reliable signal that
  // the backend switch propagated through Redux before we navigate away
  await window.waitForSelector('[data-testid="replaygain-mode-select"]', { timeout: 5_000 });

  // Step 5: navigate away — triggers MPV process initialization
  await window.click('[data-testid="nav-albums"]');

  // Step 6: wait for the albums nav item to be non-disabled, confirming the app
  // is stable and MPV's initialization (which happens asynchronously after
  // backend switch) has had time to start
  await window.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="nav-albums"]');
      return el !== null && el.getAttribute('data-disabled') !== 'true';
    },
    { timeout: 15_000 }
  );
}

// Overrides dialog.showSaveDialog in the Electron main process to return
// `savePath` without showing any OS file picker. Must be called BEFORE the
// click that triggers the save dialog (export-settings IPC handler in
// main.dev.mjs) — the mock replaces the function in the main process, so it
// has to be in place before that handler runs.
export async function mockSaveDialog(app: ElectronApplication, savePath: string): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath });
  }, savePath);
}

// Overrides dialog.showOpenDialog in the Electron main process to return
// `openPath` without showing any OS file picker. Must be called BEFORE the
// click that triggers the open dialog (import-settings IPC handler).
export async function mockOpenDialog(app: ElectronApplication, openPath: string): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, openPath);
}

// Overrides shell.openExternal in the Electron main process to record calls
// instead of actually handing the URL off to the OS (download.view links open
// in an external browser, which Playwright has no way to observe). Must be
// called BEFORE the click that triggers it. getOpenExternalCalls reads back
// what was recorded.
export async function mockOpenExternal(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__openExternalCalls = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (shell as any).openExternal = async (url: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__openExternalCalls.push(url);
    };
  });
}

export async function getOpenExternalCalls(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).__openExternalCalls || [];
  });
}

/* eslint-disable react-hooks/rules-of-hooks */
export const test = base.extend<{
  freshApp: AppFixture;
  navidromeApp: BackendFixture;
  navidromeAppMpv: BackendFixture;
  jellyfinApp: BackendFixture;
  jellyfinAppMpv: BackendFixture;
}>({
  // A fresh Electron app with clean settings (no prior login)
  freshApp: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-'));

    const app = await electron.launch({
      executablePath: ELECTRON_BIN,
      args: [MAIN_JS],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DISPLAY: process.env.DISPLAY || ':99',
        SONIXD_USER_DATA: userDataDir,
      },
    });

    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await use({ app, window, userDataDir });

    // Kill any lingering MPV process BEFORE closing the app, not after — MPV is
    // spawned as a child of the Electron main process and stays alive (--idle)
    // independently of it. If MPV is still holding the IPC socket/inherited
    // stdio open when we ask Electron to close, app.close() can hang waiting on
    // it, which would leave this cleanup unreachable if placed afterward. SIGKILL
    // (not the default SIGTERM) is used because MPV does not reliably exit on
    // SIGTERM once its controlling app has already gone away.
    try {
      execSync('pkill -9 -f mpv 2>/dev/null || true');
    } catch {}
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  // App pre-logged-in to Navidrome, running on the default Web Audio backend
  navidromeApp: async ({ freshApp }, use) => {
    const { app, window, userDataDir } = freshApp;
    await loginViaUI(window, {
      url: 'http://localhost:4533',
      username: 'admin',
      password: 'admin',
    });
    await use({ app, window, userDataDir, serverUrl: 'http://localhost:4533', backend: 'web' });
  },

  // App pre-logged-in to Navidrome, switched to the MPV backend
  navidromeAppMpv: async ({ freshApp }, use) => {
    const { app, window, userDataDir } = freshApp;
    await loginViaUI(window, {
      url: 'http://localhost:4533',
      username: 'admin',
      password: 'admin',
    });
    await switchToMpvBackend(window);
    await use({ app, window, userDataDir, serverUrl: 'http://localhost:4533', backend: 'mpv' });
  },

  // App pre-logged-in to Jellyfin, running on the default Web Audio backend
  jellyfinApp: async ({ freshApp }, use) => {
    const { app, window, userDataDir } = freshApp;
    await loginViaUI(window, {
      url: 'http://localhost:8096',
      username: 'admin',
      password: 'admin',
      type: 'jellyfin',
    });
    await use({ app, window, userDataDir, serverUrl: 'http://localhost:8096', backend: 'web' });
  },

  // App pre-logged-in to Jellyfin, switched to the MPV backend
  jellyfinAppMpv: async ({ freshApp }, use) => {
    const { app, window, userDataDir } = freshApp;
    await loginViaUI(window, {
      url: 'http://localhost:8096',
      username: 'admin',
      password: 'admin',
      type: 'jellyfin',
    });
    await switchToMpvBackend(window);
    await use({ app, window, userDataDir, serverUrl: 'http://localhost:8096', backend: 'mpv' });
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

export { expect } from '@playwright/test';
