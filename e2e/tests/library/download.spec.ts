import type { Page, ElectronApplication } from '@playwright/test';
import {
  test,
  expect,
  mockOpenExternal,
  getOpenExternalCalls,
  mockClipboardWriteText,
  getClipboardWriteTextCalls,
} from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Download — confirmed from source (AlbumView.tsx, useBrowserDownload.ts,
// api.ts, main.dev.mjs):
//   - There is no per-track download — only album/artist/playlist level, via
//     two standalone always-visible toolbar buttons: DownloadButton and
//     CopyToClipboardButton (previously a single hover-revealed Whisper popup
//     offering both as text options — split into separate buttons for
//     discoverability, since Copy to clipboard now carries its own
//     confirmation dialog anyway). testids: download-action-download,
//     download-action-copy.
//   - getDownloadUrl (api.ts) is a plain synchronous string-builder, not a
//     network call — it constructs `${apiBase}/download.view?id=...` locally
//     from stored credentials. The only real "did this work" signal is what
//     happens to that URL afterward, not a request to intercept.
//   - "Download" hands the URL to shell.openExternal, which goes through
//     bridge:shell:open-external in main.dev.mjs to the real Electron `shell`
//     module — opening a separate, external OS browser process entirely
//     outside Electron, which Playwright cannot observe directly. Mocked the
//     same way as the self-signed-cert session mocked dialog.showSaveDialog:
//     override shell.openExternal in the main process via app.evaluate() to
//     record calls instead of actually invoking it (mockOpenExternal/
//     getOpenExternalCalls, added to fixtures/index.ts this session).
//   - "Copy to clipboard" now goes through a confirmation dialog (the copied
//     URL embeds live server credentials) before clipboard.writeText is ever
//     reached — see the "Copy to clipboard confirmation" suite below. That
//     dialog flow, and whether clipboard.writeText is/isn't called, is fully
//     covered by mocking clipboard.writeText in the main process
//     (mockClipboardWriteText/getClipboardWriteTextCalls, same technique as
//     mockOpenExternal above). What is NOT covered, and can't be in this
//     environment: verifying the real OS clipboard actually receives the
//     text. clipboard.writeText needs a running X11 clipboard manager/
//     selection owner that a bare Xvfb session doesn't provide — confirmed
//     separately by calling window.bridge.clipboard.writeText directly from
//     a test and observing the same failure. That's an environment gap in
//     this CI sandbox, not a product bug (real desktop sessions work fine;
//     see the clipboard bridge fix).
//   - For Subsonic/Navidrome specifically, the download ID is the album's
//     first song's `parent` (the folder id) — confirmed by reading
//     AlbumView.tsx's local handleDownload directly, not the shared
//     useBrowserDownload hook (AlbumView.tsx defines its own copy, used here
//     instead).

async function openAlbumDownloadButtons(window: Page, app: ElectronApplication) {
  await mockOpenExternal(app);
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
  test('downloading an album hands a real download URL to the external browser', async ({
    navidromeApp: { app, window },
  }) => {
    await openAlbumDownloadButtons(window, app);
    await window.click('[data-testid="download-action-download"]');

    await expect
      .poll(async () => getOpenExternalCalls(app), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([expect.stringMatching(/^https?:\/\/.*\/download\.view\?/)]));

    const [url] = await getOpenExternalCalls(app);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('id')).toBeTruthy();
    // `u` (username) is present in both the legacy and token-auth branches of
    // getDownloadUrl — confirmed by reading both unconditionally include it,
    // only the password representation differs. A link missing it would just
    // 401 in the external browser.
    expect(parsed.searchParams.get('u')).toBeTruthy();
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
  });
});
