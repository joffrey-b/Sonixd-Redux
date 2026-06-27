import type { Page, ElectronApplication } from '@playwright/test';
import { test, expect, mockOpenExternal, getOpenExternalCalls } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Download — confirmed from source (AlbumView.tsx, useBrowserDownload.ts,
// api.ts, main.dev.mjs):
//   - There is no per-track download — only album/artist/playlist level, via
//     a hover-revealed Whisper popup on the DownloadButton (trigger="hover"),
//     offering "Download" and "Copy to clipboard". No testids existed on any
//     of the three elements — added download-button, download-action-download,
//     download-action-copy this session.
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
//   - "Copy to clipboard" is intentionally NOT covered: clipboard.writeText
//     throws "Cannot read properties of undefined (reading 'writeText')"
//     under this project's headless Xvfb test environment — confirmed by
//     calling window.bridge.clipboard.writeText directly from a test,
//     bypassing the app's click handler entirely, and getting the exact
//     same error. The preload's own clipboard wrapper closes over Electron's
//     real clipboard module (`(text) => clipboard.writeText(text)` in
//     preload.js, referencing the 'electron' import, not the exposed bridge
//     property of the same name) — that module needs a running X11
//     clipboard manager/selection owner that a bare Xvfb session doesn't
//     provide. Not a product bug or a test bug, just an environment gap not
//     worth closing for this feature.
//   - For Subsonic/Navidrome specifically, the download ID is the album's
//     first song's `parent` (the folder id) — confirmed by reading
//     AlbumView.tsx's local handleDownload directly, not the shared
//     useBrowserDownload hook (AlbumView.tsx defines its own copy, used here
//     instead).

async function openAlbumDownloadMenu(window: Page, app: ElectronApplication) {
  await mockOpenExternal(app);
  await window.click('[data-testid="nav-albums"]');
  await expect(window.getByText(TRACKS.track01.album, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.getByText(TRACKS.track01.album, { exact: true }).first().dblclick();
  await window.hover('[data-testid="download-button"]');
  await expect(window.locator('[data-testid="download-action-download"]')).toBeVisible({
    timeout: 5_000,
  });
}

test.describe('Download', () => {
  test('downloading an album hands a real download URL to the external browser', async ({
    navidromeApp: { app, window },
  }) => {
    await openAlbumDownloadMenu(window, app);
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
