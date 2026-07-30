import type { Page, ElectronApplication } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, expect, mockOpenDialog } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Phase 4 — the full download lifecycle (ADR Section 8): configure the
// download folder, download an individual song via right-click, download a
// whole album via the button, verify the offline-status column, confirm
// playback prefers a downloaded file while offline, delete via the button
// and confirm cleanup. Could not be run in this sandboxed tool environment
// (Electron fails to launch here) -- same standing limitation as every prior
// phase. Written from static analysis of the real source and this suite's
// own established patterns (download.spec.ts's per-song-file assertions,
// offline-browsing.spec.ts's setForceOfflineMode, mpv-cache-preference.spec.ts's
// "no stream request" verification via route interception), not from an
// actual passing run.

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

async function setForceOfflineMode(window: Page, desired: boolean) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-cache"]');
  const input = window.locator('[data-testid="force-offline-mode-toggle"] input[type="checkbox"]');
  await expect(input).toBeVisible({ timeout: 10_000 });
  if ((await input.isChecked()) !== desired) {
    await input.click({ force: true });
  }
}

test.describe('Download lifecycle', () => {
  test('right-click Download on a single song writes it to the configured folder and updates the offline-status column', async ({
    navidromeApp: { app, window },
  }) => {
    const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, downloadRoot);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    const row = window.getByRole('row', { name: TRACKS.track01.title });
    await row.click({ button: 'right' });
    await expect(window.locator('[data-testid="context-menu-download"]')).toBeVisible({
      timeout: 5_000,
    });
    await window.click('[data-testid="context-menu-download"]');

    await expect
      .poll(
        () => {
          const albumDir = path.join(downloadRoot, TRACKS.track01.artist, TRACKS.track01.album);
          return fs.existsSync(albumDir) ? fs.readdirSync(albumDir) : [];
        },
        { timeout: 20_000 }
      )
      .toEqual(expect.arrayContaining([expect.stringContaining(TRACKS.track01.title)]));

    await expect(row.getByLabel('download')).toBeVisible({ timeout: 10_000 });

    // Right-click again: Remove from offline should now be enabled.
    await row.click({ button: 'right' });
    await expect(window.locator('[data-testid="context-menu-remove-from-offline"]')).toBeEnabled({
      timeout: 5_000,
    });
  });

  test('playback prefers the downloaded file over the network stream while offline', async ({
    navidromeApp: { app, window },
  }) => {
    const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, downloadRoot);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.click('[data-testid="download-action-download"]');

    await expect
      .poll(
        () => {
          const albumDir = path.join(downloadRoot, TRACKS.track01.artist, TRACKS.track01.album);
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

    // App.tsx delays the launch-time library sync 2.5s past mount, then runs
    // a paginated fetch against the server -- the same race documented in
    // offline-browsing.spec.ts's "Albums, Artists, Genres, and Search remain
    // browsable ... when offline" test, which added this identical wait for
    // the same reason. Without it, going offline before that sync has
    // written its snapshot leaves getCachedSongs() empty, so the offline
    // Albums branch renders "No data found" instead of the downloaded album
    // -- this raced on CI (reproduced twice) despite passing locally.
    await window.waitForTimeout(5_000);
    await setForceOfflineMode(window, true);

    // Web Audio backend: assert no stream.view request occurs when playing
    // the now-downloaded track -- mirrors mpv-cache-preference.spec.ts's
    // equivalent assertion for the MPV backend's cache-preference fix.
    const streamRequests: string[] = [];
    await window.route('**/rest/stream.view*', async (route) => {
      streamRequests.push(route.request().url());
      await route.continue();
    });

    await window.click('[data-testid="nav-albums"]');
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');
    await window.waitForTimeout(5_000);

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );
    await window.waitForFunction(
      () => document.querySelector('[data-testid="player-current-time"]')?.textContent !== '0:00',
      { timeout: 15_000 }
    );
    expect(streamRequests).toEqual([]);

    await setForceOfflineMode(window, false);
  });
});

// Audit findings 1.1/1.2/1.3/2.2 — written from static analysis of the real
// fix in main.dev.mjs/useBulkDownload.ts/downloadedPathResilience.ts, not
// from an actual passing run (same standing sandbox limitation as the rest
// of this file).
test.describe('Download/Delete correctness under folder changes and overlapping operations', () => {
  test('changing the download folder after downloading, then removing the song, does not silently orphan the file (finding 1.1)', async ({
    navidromeApp: { app, window },
  }) => {
    const originalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, originalRoot);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.click('[data-testid="download-action-download"]');

    const albumDir = path.join(originalRoot, TRACKS.track01.artist, TRACKS.track01.album);
    await expect
      .poll(() => (fs.existsSync(albumDir) ? fs.readdirSync(albumDir) : []), { timeout: 20_000 })
      .toEqual(expect.arrayContaining([expect.stringContaining(TRACKS.track01.title)]));

    // Reconfigure to a DIFFERENT folder -- every manifest entry captured
    // under originalRoot is now "outside the current download root".
    const newRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, newRoot);

    // configureDownloadFolder leaves the window on the Settings page --
    // navigate back to the album detail view before using its buttons.
    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    await window.click('[data-testid="download-action-remove-offline"]');

    // The fix: the delete attempt fails visibly (assertUnderDir rejects the
    // stale path, surfaced as a real IPC error) rather than silently
    // reporting success. The real file must still exist on disk under the
    // ORIGINAL root -- never silently orphaned by an app that forgot about
    // it while leaving the bytes behind.
    await expect(window.getByText(/could not be removed/i)).toBeVisible({ timeout: 15_000 });
    expect(fs.existsSync(albumDir)).toBe(true);
    expect(fs.readdirSync(albumDir).some((name) => name.includes(TRACKS.track01.title))).toBe(true);
  });

  test('changing the download folder mid-batch surfaces a failure instead of falsely reporting success (finding 1.2)', async ({
    navidromeApp: { app, window },
  }) => {
    const originalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, originalRoot);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    // Hold every song download request open until the folder has been
    // reconfigured, guaranteeing a genuine in-flight write at reconfiguration
    // time -- a fixed wait can't reliably land inside the real network+disk
    // window against a fast local test server (this raced in a live run).
    let releaseDownloads: () => void = () => {};
    const holdDownloads = new Promise<void>((resolve) => {
      releaseDownloads = resolve;
    });
    await window.route('**/rest/download.view*', async (route) => {
      await holdDownloads;
      await route.continue();
    });

    await window.click('[data-testid="download-action-download"]');

    const newRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await mockOpenDialog(app, newRoot);
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-cache"]');
    await window.click('[data-testid="download-path-choose-folder"]');
    await expect(window.locator('[data-testid="download-path-display"]')).toHaveValue(newRoot, {
      timeout: 10_000,
    });

    releaseDownloads();

    // The fix means at least one song's write against the now-stale
    // originalRoot destination fails visibly (the "could not be downloaded"
    // toast) rather than every song silently no-op'ing while still being
    // recorded as successfully downloaded.
    await expect(window.getByText(/could not be downloaded/i)).toBeVisible({ timeout: 20_000 });
  });

  test('starting a second bulk operation while one is in progress is blocked, not raced (findings 1.3/2.2)', async ({
    navidromeApp: { app, window },
  }) => {
    const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, downloadRoot);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    const downloadButton = window.locator('[data-testid="download-action-download"]');
    const removeButton = window.locator('[data-testid="download-action-remove-offline"]');

    // Hold every song download request open for the duration of this test's
    // own checks, guaranteeing the batch is still genuinely in-flight no
    // matter how long the UI interactions below take. Test Album's 3 tracks
    // download fast enough against a real local test server that even the
    // minimal steps here (two toBeDisabled polls, a right-click, a menu
    // visibility check) can outlast the real batch -- this raced in a live
    // run despite there being no extra navigation left to trim.
    let releaseDownloads: () => void = () => {};
    const holdDownloads = new Promise<void>((resolve) => {
      releaseDownloads = resolve;
    });
    await window.route('**/rest/download.view*', async (route) => {
      await holdDownloads;
      await route.continue();
    });

    await downloadButton.click();

    // The fix: both buttons are disabled for the duration of the in-flight
    // batch (downloadProgress.inProgress), so a user physically cannot start
    // an overlapping operation on the same album's folder -- this is exactly
    // the condition finding 2.2's ensureDir/cleanup race needed to occur.
    await expect(downloadButton).toBeDisabled({ timeout: 5_000 });
    await expect(removeButton).toBeDisabled({ timeout: 5_000 });

    // Defense-in-depth: even a direct trigger while disabled (e.g. a
    // right-click on the same album's songs) is rejected with a toast by
    // useBulkDownload's own guard, not silently raced.
    const row = window.getByRole('row', { name: TRACKS.track01.title });
    await row.click({ button: 'right' });
    await expect(window.locator('[data-testid="context-menu-download"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(window.locator('[data-testid="context-menu-download"]')).toBeDisabled();

    // Let the original batch finish cleanly so the app/folder are left in a
    // sane state.
    releaseDownloads();
    await expect
      .poll(
        () => {
          const albumDir = path.join(downloadRoot, TRACKS.track01.artist, TRACKS.track01.album);
          return fs.existsSync(albumDir) ? fs.readdirSync(albumDir).length : 0;
        },
        { timeout: 20_000 }
      )
      .toBeGreaterThan(0);
    await expect(downloadButton).toBeEnabled({ timeout: 10_000 });
  });
});

// Audit fix (finding 1.5): the entire downloads feature had zero coverage of
// the Jellyfin backend anywhere, unit or e2e -- both jellyfinApiEndpoints
// .test.ts's new getDownloadUrl coverage and this e2e spec now close that
// gap, matching this suite's established both-backend discipline elsewhere
// (e.g. offline-browsing.spec.ts's Jellyfin playlist variant). Written from
// static analysis, not from an actual passing run -- same standing sandbox
// limitation as the rest of this file.
test.describe('Download lifecycle (Jellyfin)', () => {
  test('downloading and removing an album works end-to-end against the Jellyfin backend', async ({
    jellyfinApp: { app, window },
  }) => {
    const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, downloadRoot);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.click('[data-testid="download-action-download"]');

    const albumDir = path.join(downloadRoot, TRACKS.track01.artist, TRACKS.track01.album);
    await expect
      .poll(() => (fs.existsSync(albumDir) ? fs.readdirSync(albumDir) : []), { timeout: 20_000 })
      .toEqual(
        expect.arrayContaining([
          expect.stringContaining(TRACKS.track01.title),
          expect.stringContaining(TRACKS.track02.title),
        ])
      );

    const row = window.getByRole('row', { name: TRACKS.track01.title });
    await expect(row.getByLabel('download')).toBeVisible({ timeout: 10_000 });

    await window.click('[data-testid="download-action-remove-offline"]');
    await expect.poll(() => fs.existsSync(albumDir), { timeout: 15_000 }).toBe(false);
  });
});

test.describe('Downloads overview screen', () => {
  test('shows total space, the full content list, and clear-all-downloads works', async ({
    navidromeApp: { app, window },
  }) => {
    const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonixd-e2e-download-'));
    await configureDownloadFolder(app, window, downloadRoot);

    await window.click('[data-testid="nav-albums"]');
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.click('[data-testid="download-action-download"]');

    await expect
      .poll(
        () => {
          const albumDir = path.join(downloadRoot, TRACKS.track01.artist, TRACKS.track01.album);
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

    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-cache"]');
    await window.click('[data-testid="downloads-view-overview"]');

    // "Test Album" has 3 tracks (confirmed live: track01/02/03), not 2 --
    // the album Download button downloads all of them, so the overview
    // screen correctly lists all 3. Fixed after a live run caught the
    // original assertion's miscount (this test was written from static
    // analysis, assuming only the 2 tracks this file explicitly names).
    await expect(window.locator('[data-testid="downloads-row"]')).toHaveCount(3, {
      timeout: 10_000,
    });
    await expect(window.locator('[data-testid="downloads-total-size"]')).toContainText('MB');

    await window.click('[data-testid="downloads-clear-all"]');

    await expect(window.locator('[data-testid="downloads-empty-message"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(() => fs.existsSync(path.join(downloadRoot, TRACKS.track01.artist)), {
        timeout: 15_000,
      })
      .toBe(false);
  });
});
