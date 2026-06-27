import { _electron as electronLauncher } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Keyboard shortcut rebinding — confirmed from source:
//   - The prompt's suggested candidate ("next track") is one of 6 actions
//     (playPause/nextTrack/prevTrack/volumeUp/volumeDown/mute) that are
//     EXCLUSIVELY implemented via Electron's globalShortcut API in the main
//     process (registerCustomShortcuts / the update-local-shortcut IPC
//     handler in main.dev.mjs) — never a renderer-level keydown listener.
//     globalShortcut hooks at the OS level, completely bypassing Chromium's
//     DOM event pipeline, so window.keyboard.press() (CDP's
//     Input.dispatchKeyEvent, injected into the renderer) cannot trigger it
//     no matter what key is chosen. Confirmed by reading both the IPC
//     handler and the registration functions directly — there is no
//     fallback renderer listener for these 6.
//   - The other 4 actions (navigateBack/search/selectAll/removeSelected) are
//     NOT in either main-process actions map — they're bound via
//     react-hotkeys-hook's useHotkeys in the renderer (confirmed in
//     Layout.tsx: useHotkeys(config.hotkeys.navigateBack, () =>
//     navigate(-1), ...)), a real DOM-level listener that Playwright's
//     simulated keypresses DO reach. Rebinding navigateBack (default:
//     'backspace', configSlice.ts) instead of nextTrack.
//   - useHotkeys is called with config.hotkeys.navigateBack as both the key
//     string AND a dependency — it re-registers reactively on every change,
//     so a rebind takes effect immediately with no restart needed.
//   - The rebind UI (KeyboardShortcutsConfig.tsx) has no save button or text
//     input — it's record-key-press: click the KeyBadge to enter
//     "listening" mode, then press the new combination, which auto-saves
//     via captureKey()'s onKeyDown handler. Escape cancels. No testids
//     existed on the row or badge — added shortcut-row-{action} and
//     shortcut-key-{action} this session, plus settings-shortcuts on the
//     tab itself (the only settings tab still missing one).
//   - There is no reset-to-default button anywhere in this component —
//     confirmed by reading the full file. Per the prompt's own fallback
//     instruction, that test is skipped and documented here instead of
//     invented.
//   - captureKey() does not lowercase function keys (only e.g. 'ctrl'/other
//     keys get lowercased) — F9 is stored and matched as exactly "F9".
//     react-hotkeys-hook lowercases internally on both sides of the
//     comparison, so case doesn't actually matter, but this is the exact
//     string that appears in the UI and in settings.

const TEST_KEY = 'F9';
const DEFAULT_NAVIGATE_BACK_KEY = 'Backspace'; // configSlice.ts default: 'backspace'

async function openShortcutsSettings(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-shortcuts"]');
  await expect(window.locator('[data-testid="shortcut-key-navigateBack"]')).toBeVisible({
    timeout: 10_000,
  });
}

async function rebindNavigateBack(window: Page, key: string) {
  await window.click('[data-testid="shortcut-key-navigateBack"]');
  await window.keyboard.press(key);
  // Settle wait — save() dispatches Redux, calls settings.set(), and sends
  // an IPC message; give it a moment before navigating away.
  await window.waitForTimeout(300);
}

async function openAlbumDetail(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
  // album-filter-button only renders on the Albums LIST page, not the detail
  // page navigated into above — its absence confirms we're on the detail page.
  await expect(window.locator('[data-testid="album-filter-button"]')).not.toBeVisible();
}

async function isOnAlbumsListPage(window: Page): Promise<boolean> {
  return window.locator('[data-testid="album-filter-button"]').isVisible();
}

test.describe('Keyboard shortcut rebinding', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await openShortcutsSettings(window);
  });

  test('rebinding a shortcut saves the new key', async ({ navidromeApp: { window } }) => {
    await rebindNavigateBack(window, TEST_KEY);
    await expect(window.locator('[data-testid="shortcut-key-navigateBack"]')).toContainText(
      TEST_KEY,
      { timeout: 10_000 }
    );
  });

  test('new shortcut triggers the action', async ({ navidromeApp: { window } }) => {
    await rebindNavigateBack(window, TEST_KEY);

    await openAlbumDetail(window);
    await window.keyboard.press(TEST_KEY);

    await expect.poll(() => isOnAlbumsListPage(window), { timeout: 10_000 }).toBe(true);
  });

  test('old default shortcut no longer triggers the action after rebind', async ({
    navidromeApp: { window },
  }) => {
    await rebindNavigateBack(window, TEST_KEY);

    await openAlbumDetail(window);
    await window.keyboard.press(DEFAULT_NAVIGATE_BACK_KEY);
    await window.waitForTimeout(1_000);

    // Still on the detail page — the old binding no longer does anything.
    expect(await isOnAlbumsListPage(window)).toBe(false);
  });

  test('rebinding persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await rebindNavigateBack(window, TEST_KEY);

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
    await w2.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="nav-albums"]');
        return el !== null && el.getAttribute('data-disabled') !== 'true';
      },
      { timeout: 30_000 }
    );

    await openShortcutsSettings(w2);
    await expect(w2.locator('[data-testid="shortcut-key-navigateBack"]')).toContainText(TEST_KEY);

    await app2.close();
  });

  // No reset-to-default button exists anywhere in KeyboardShortcutsConfig.tsx
  // (confirmed by reading the full component) — there's only a per-rebind
  // Cancel ("✕") that aborts an in-progress key capture, not a restore of a
  // previously-saved binding. Nothing to test here; documented per the
  // prompt's own fallback instruction rather than inventing a control that
  // doesn't exist.
});
