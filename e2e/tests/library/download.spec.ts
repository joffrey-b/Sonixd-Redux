import type { Page, ElectronApplication } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  test,
  expect,
  mockOpenDialog,
  mockClipboardWriteText,
  getClipboardWriteTextCalls,
} from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Download — updated for Phase 4 (ADR Section 8.3): the Album/Artist/
// Playlist "Download" button's underlying mechanism changed from a single
// server-generated zip (handed to shell.openExternal) to N individual
// per-song downloads written to a user-chosen download folder, with a new
// "Remove from offline" button alongside it. "Copy to clipboard" is
// untouched (still the old zip-link-based mechanism) -- see the unchanged
// suite below. testids: download-action-download, download-action-copy,
// download-action-remove-offline (new).
//
// The download folder is configured the same way Settings backup/restore
// configures its export/import paths: mockOpenDialog overrides
// dialog.showOpenDialog in the main process to return a fixed path without
// showing a real OS picker -- the exact same fixture works here unchanged,
// since select-download-folder (main.dev.mjs) calls dialog.showOpenDialog
// with the same { filePaths, canceled } result shape the fixture already
// returns.

async function configureDownloadFolder(app: ElectronApplication, window: Page, folderPath: string) {
  await mockOpenDialog(app, folderPath);
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-cache"]');
  await expect(window.locator('[data-testid="download-path-choose-folder"]')).toBeVisible({
    timeout: 10_000,
  });
  await window.click('[data-testid="download-path-choose-folder"]');
  await expect(window.locator('[data-testid="download-path-display"]')).toHaveValue(folderPath, {
    timeout: 10_000,
  });
}

async function openAlbumDownloadButtons(window: Page, app: ElectronApplication) {
  await mockClipboardWriteText(app);
  await window.click('[data-testid="nav-albums"]');
  await expect(window.getByText(TRACKS.track01.album, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.getByText(TRACKS.track01.album, { exact: true }).first().dblclick();
  await expect(window.locator('[data-testid="download-action-download"]')).toBeVisible({
    timeout: 5_000,
  });
}

test.describe('Download', () => {
  test('downloading an album writes every song to the configured download folder', async ({
    navidromeApp: { app, window },
  }) => {
    const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, downloadRoot);
    await openAlbumDownloadButtons(window, app);

    await window.click('[data-testid="download-action-download"]');

    // Real files land on disk under {DownloadRoot}/{Artist}/{Album}/ -- poll
    // since the fan-out is async and not awaited by the click itself.
    await expect
      .poll(
        () => {
          const artistDir = path.join(downloadRoot, TRACKS.track01.artist);
          if (!fs.existsSync(artistDir)) return [];
          const albumDir = path.join(artistDir, TRACKS.track01.album);
          return fs.existsSync(albumDir) ? fs.readdirSync(albumDir) : [];
        },
        { timeout: 20_000 }
      )
      .toEqual(
        expect.arrayContaining([
          expect.stringContaining(TRACKS.track01.title),
          expect.stringContaining(TRACKS.track02.title),
        ])
      );

    // The offline-status column shows the stronger "downloaded" icon (not
    // the lighter "cached" one) for a song that's both.
    const row = window.getByRole('row', { name: TRACKS.track01.title });
    await expect(row.getByLabel('download')).toBeVisible({ timeout: 10_000 });
  });

  test('Remove from offline deletes the downloaded files and cleans up empty folders', async ({
    navidromeApp: { app, window },
  }) => {
    const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, downloadRoot);
    await openAlbumDownloadButtons(window, app);

    await window.click('[data-testid="download-action-download"]');
    await expect
      .poll(
        () => {
          const albumDir = path.join(downloadRoot, TRACKS.track01.artist, TRACKS.track01.album);
          return fs.existsSync(albumDir) ? fs.readdirSync(albumDir).length : 0;
        },
        { timeout: 20_000 }
      )
      .toBeGreaterThan(0);

    await window.click('[data-testid="download-action-remove-offline"]');

    await expect
      .poll(
        () => fs.existsSync(path.join(downloadRoot, TRACKS.track01.artist, TRACKS.track01.album)),
        { timeout: 20_000 }
      )
      .toBe(false);
    // Empty-folder cleanup walks up to the now-also-empty Artist folder too.
    expect(fs.existsSync(path.join(downloadRoot, TRACKS.track01.artist))).toBe(false);
  });
});

test.describe('Copy to clipboard confirmation', () => {
  test('warning dialog appears when Copy to clipboard is clicked', async ({
    navidromeApp: { app, window },
  }) => {
    await openAlbumDownloadButtons(window, app);
    await window.click('[data-testid="download-action-copy"]');

    await expect(window.getByTestId('copy-clipboard-confirm-modal')).toBeVisible({
      timeout: 5_000,
    });
    await expect(window.getByText('Copy download link?')).toBeVisible();
    await expect(
      window.getByText(/This link contains your login credentials in plain text/)
    ).toBeVisible();

    // No fetch/clipboard write should have happened just from opening the dialog
    expect(await getClipboardWriteTextCalls(app)).toEqual([]);
  });

  test('clicking Cancel closes the dialog without copying', async ({
    navidromeApp: { app, window },
  }) => {
    await openAlbumDownloadButtons(window, app);
    await window.click('[data-testid="download-action-copy"]');
    await expect(window.getByTestId('copy-clipboard-confirm-modal')).toBeVisible({
      timeout: 5_000,
    });

    await window.click('[data-testid="copy-clipboard-confirm-cancel"]');

    await expect(window.getByTestId('copy-clipboard-confirm-modal')).not.toBeVisible();
    await expect(window.getByText('Download links copied!')).not.toBeVisible();
    expect(await getClipboardWriteTextCalls(app)).toEqual([]);
  });

  test('clicking Copy anyway proceeds with the copy and shows success toast', async ({
    navidromeApp: { app, window },
  }) => {
    await openAlbumDownloadButtons(window, app);
    await window.click('[data-testid="download-action-copy"]');
    await expect(window.getByTestId('copy-clipboard-confirm-modal')).toBeVisible({
      timeout: 5_000,
    });

    await window.click('[data-testid="copy-clipboard-confirm-copy-anyway"]');

    // Proves the app-level logic executed (fetch + IPC write call); does not
    // verify real OS clipboard contents, per the constraint noted above.
    await expect(window.getByText('Download links copied!')).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => getClipboardWriteTextCalls(app), { timeout: 10_000 })
      .not.toEqual([]);

    const [copiedText] = await getClipboardWriteTextCalls(app);
    expect(copiedText).toMatch(/^https?:\/\/.*\/download\.view\?/);
    // Audit fix: the pre-Phase-4 version of this suite additionally asserted
    // the download URL carried a real `id` and `u` (username) query param,
    // not just the right path shape -- restored here (this suite's only
    // remaining raw-URL-string signal now that the "Download" button itself
    // writes real files rather than handing a URL to shell.openExternal, per
    // the Download describe block above).
    const parsed = new URL(copiedText.split('\n')[0]);
    expect(parsed.searchParams.get('id')).toBeTruthy();
    expect(parsed.searchParams.get('u')).toBeTruthy();
  });
});
