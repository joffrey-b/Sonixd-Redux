import type { Page } from '@playwright/test';
import { _electron as electronLauncher } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Layout customization — confirmed from source (ListViewConfig.tsx,
// LookAndFeelConfig.tsx, ListViewColumns.ts):
//   - There are no individual per-column toggle checkboxes
//     (column-toggle-duration etc., as the prompt assumed). It's a single
//     StyledCheckPicker (multi-select dropdown) — column-picker-{type}
//     testid, already added in an earlier session for the same reason
//     (rating.spec.ts's ensureRatingColumnVisible). Hiding/showing a column
//     means opening the picker and clicking that column's label text inside
//     it, which toggles its membership in the selected-columns array —
//     exactly the same interaction whether adding or removing.
//   - For the Songs/track list (used inside an opened album), the relevant
//     instance is columnSelectorTab === 'music' (settingsConfig.columnList:
//     'musicListColumns'), which is also the default active tab
//     (configSlice.ts), so no extra tab click is needed once on
//     settings-lookandfeel.
//   - Default musicListColumns (setDefaultSettings.ts): # (Drag/Drop),
//     Title (Combined), Album, Duration, Bitrate, Favorite — Duration is
//     visible by default, matching the prompt's own example. Rating is NOT
//     in the default list — confirmed off by default (same fact established
//     in the earlier rating session).
//   - The picker's selectable item is labeled "Rating" (getSongColumnPicker),
//     but the resulting column's actual header text is the shorter "Rate"
//     (getSongColumnListAuto's id/dataKey: 'userRating' entry) — confirmed
//     via a real run's page snapshot showing the header row literally as
//     "# Title Album Duration Bitrate Fav Rate". Click "Rating" in the
//     picker; check for "Rate" in the header.
//   - When a column is ALREADY selected, its label text appears in 3 places
//     simultaneously: the picker's own selected-value chip
//     (rs-picker-value-item), the actual checkbox item inside the dropdown
//     popup, and the column-reorder preview grid below the picker (which
//     lists currently-selected columns as rows) — a real run hit a strict
//     mode violation clicking "Duration" by plain text for exactly this
//     reason. RSuite's picker popup carries its own data-testid
//     ("picker-popup", confirmed from that same error's resolved locator
//     suggestion) — scope the click to it to disambiguate.
//   - Column headers (ListViewTable.tsx's StyledTableHeaderCell) render the
//     label text in two separate DOM nodes (confirmed via a real run's
//     strict-mode violation on a plain `text=Duration` check, despite the
//     accessibility-tree snapshot showing only one logical header row) —
//     use .first() the same way every other text= check in this whole suite
//     already does for data rows, just not previously applied to headers.
//   - Each test launches a fresh Electron app with its own temp userDataDir
//     (fixtures/index.ts), so column visibility changes (local
//     electron-store, not server-side like ratings) never leak between
//     tests — no need to restore state at the end of a test.

async function navigateToTestAlbum(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
}

async function toggleSongColumn(window: Page, pickerItemLabel: string) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-lookandfeel"]');
  const picker = window.locator('[data-testid="column-picker-music"]');
  await expect(picker).toBeVisible({ timeout: 10_000 });
  await picker.click();
  await window.getByTestId('picker-popup').getByText(pickerItemLabel, { exact: true }).click();
  await window.keyboard.press('Escape');
  // Settle wait for settings.set() + the Redux dispatch to land.
  await window.waitForTimeout(300);
}

// Header text renders in two separate DOM nodes (confirmed via a real run —
// .first() consistently resolved to a hidden one, .nth(1) the real, visible
// header; document order isn't reliable either way). Check every match
// rather than guessing which index is the genuine one.
async function isColumnHeaderVisible(window: Page, headerLabel: string): Promise<boolean> {
  const matches = window.locator(`text=${headerLabel}`);
  const count = await matches.count();
  for (let i = 0; i < count; i += 1) {
    if (await matches.nth(i).isVisible()) return true;
  }
  return false;
}

test.describe('Layout customization — column visibility', () => {
  test('hiding a visible column removes it from the track list', async ({
    navidromeApp: { window },
  }) => {
    await navigateToTestAlbum(window);
    await expect.poll(() => isColumnHeaderVisible(window, 'Duration')).toBe(true);

    await toggleSongColumn(window, 'Duration');

    await navigateToTestAlbum(window);
    await expect.poll(() => isColumnHeaderVisible(window, 'Duration')).toBe(false);
  });

  test('showing a hidden column adds it to the track list', async ({
    navidromeApp: { window },
  }) => {
    await navigateToTestAlbum(window);
    await expect.poll(() => isColumnHeaderVisible(window, 'Rate')).toBe(false);

    await toggleSongColumn(window, 'Rating');

    await navigateToTestAlbum(window);
    await expect.poll(() => isColumnHeaderVisible(window, 'Rate')).toBe(true);
  });

  test('re-enabling a hidden column restores it', async ({ navidromeApp: { window } }) => {
    await toggleSongColumn(window, 'Duration');
    await navigateToTestAlbum(window);
    await expect.poll(() => isColumnHeaderVisible(window, 'Duration')).toBe(false);

    await toggleSongColumn(window, 'Duration');
    await navigateToTestAlbum(window);
    await expect.poll(() => isColumnHeaderVisible(window, 'Duration')).toBe(true);
  });

  test('column visibility persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await toggleSongColumn(window, 'Duration');
    await navigateToTestAlbum(window);
    await expect.poll(() => isColumnHeaderVisible(window, 'Duration')).toBe(false);

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

    await navigateToTestAlbum(w2);
    await expect.poll(() => isColumnHeaderVisible(w2, 'Duration')).toBe(false);

    await app2.close();
  });
});
