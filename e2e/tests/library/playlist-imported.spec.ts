import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { IMPORTED_PLAYLIST, TRACKS } from '../../fixtures/constants';

// Imported playlist — confirmed from source (PlaylistView.tsx, ContextMenu.tsx,
// api.ts) and e2e/scripts/setup-navidrome.sh:
//   - "Imported Mix" (e2e/test-music/Imported Mix.m3u) is a real, pre-existing
//     Navidrome playlist — not app-created. The automatic @startup scan runs
//     before the admin account exists, so it can't be attributed/imported on
//     that first pass; setup-navidrome.sh now triggers an explicit second
//     scan after admin creation and waits for the playlist to appear before
//     handing off to the test suite.
//   - Editing (name/description/public) hits /updatePlaylist.view with a
//     `name` param. Removing a track + Save (for a playlist this size) hits
//     /createPlaylist.view with a `playlistId` param — Subsonic overloads
//     that endpoint to mean "replace this playlist's song list" when
//     playlistId is present, confirmed by reading updatePlaylistSongs in
//     api.ts directly, not assumed from the function name. Adding a track
//     back via the context menu's "Add to playlist" hits the SAME
//     /updatePlaylist.view endpoint as editing, but with a `songIdToAdd`
//     param instead of `name` — distinguished by checking for that param,
//     not just the path.
//   - Removing a track from a playlist is two-step and NOT auto-persisted:
//     the context menu's "Remove selected" only updates local Redux state
//     (immediately reflected in the table); nothing reaches the server
//     until the playlist's own Save button is clicked. The Undo button only
//     reverts pre-save local edits, not a save that already happened.
//   - This fixture is shared Docker-level state, not per-test local data —
//     unlike everything else in this suite, it is NOT re-created between
//     test runs (only a full `docker compose down -v` + rescan cycle does
//     that). Permanently deleting it here would break every subsequent
//     local rerun until that heavier reset, so "deleting a playlist" is
//     intentionally tested against a disposable, app-created playlist
//     instead (playlist-management.spec.ts) — editing and track removal
//     ARE tested here, but each test restores the original state
//     (name / track list) before finishing, since both are safely
//     reversible through the same UI.

async function navigateToImportedPlaylist(window: Page) {
  await window.click('[data-testid="nav-playlists"]');
  await expect(window.getByText(IMPORTED_PLAYLIST.name, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.getByText(IMPORTED_PLAYLIST.name, { exact: true }).first().dblclick();
}

// The add-to-playlist picker is virtualized and, on a long-lived shared
// Navidrome instance, its option list keeps growing across every test run
// that's ever created a disposable playlist without deleting it — a real
// full-suite run timed out here because the target name simply wasn't
// rendered yet (off the end of the virtualization window) by the time a
// plain text search found it. Typing into the picker's own search input
// filters the list first, side-stepping list length entirely.
//
// Getting there reliably took three attempts. (1) Guessed the search
// input's CSS class from rsuite's InputSearch.js source
// (.rs-picker-search-input) — never matched anything live. (2) Scoped the
// search to getByTestId('picker-popup') then getByRole('textbox') — timed
// out too, even though a real run's ARIA snapshot showed a `textbox` role
// nested directly inside an `aria-expanded="true"` combobox; this
// InputPicker has a custom `container` ref (ContextMenu.tsx:
// container={() => playlistPickerContainerRef.current}), and neither
// picker-popup's testid nor a role lookup nested inside the combobox
// reliably resolves wherever that redirects rendering to. (3) Dropped
// element-targeting for the input entirely: clicking the picker's toggle
// already focuses its internal search field (standard combobox behavior),
// so typing via the keyboard directly — instead of calling .fill() on a
// located element — reaches it regardless of where in the DOM it actually
// lives. Matching options still expose a real role="option" reliably.
async function selectPlaylistInPicker(window: Page, name: string) {
  await window.keyboard.type(name);
  await window.getByRole('option', { name, exact: true }).click();
}

async function renamePlaylist(window: Page, newName: string) {
  await window.click('[data-testid="edit-playlist-button"]');
  await window.fill('[data-testid="edit-playlist-name-input"]', newName);
  const updateRequest = window.waitForRequest(
    (req) => {
      const url = new URL(req.url());
      return url.pathname.endsWith('/updatePlaylist.view') && url.searchParams.has('name');
    },
    { timeout: 10_000 }
  );
  await window.click('[data-testid="edit-playlist-save-button"]');
  await updateRequest;
}

test.describe('Imported playlist', () => {
  test('appears in the Playlists view', async ({ navidromeApp: { window } }) => {
    await window.click('[data-testid="nav-playlists"]');
    await expect(window.getByText(IMPORTED_PLAYLIST.name, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('contains the expected tracks', async ({ navidromeApp: { window } }) => {
    await navigateToImportedPlaylist(window);
    for (const title of IMPORTED_PLAYLIST.trackTitles) {
      await expect(window.getByText(title, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test('editing the name persists to the server', async ({ navidromeApp: { window } }) => {
    await navigateToImportedPlaylist(window);
    const tempName = `${IMPORTED_PLAYLIST.name} (renamed)`;

    await renamePlaylist(window, tempName);
    // SidebarPlaylists.tsx's quick-access list shows the same playlist name
    // as the page's own H1 heading simultaneously — .first() avoids a
    // strict-mode ambiguity between the two (same root cause as the
    // duplicate column-header DOM nodes from an earlier session, different
    // pair of elements).
    await expect(window.getByText(tempName, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Restore the original name — see file header on why this fixture must
    // come out of every test exactly as it went in.
    await renamePlaylist(window, IMPORTED_PLAYLIST.name);
    await expect(window.getByText(IMPORTED_PLAYLIST.name, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('removing a track and saving persists the change, then restores it', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    await navigateToImportedPlaylist(window);

    // Remove Solo Track — local change only until Save.
    await window
      .getByText(TRACKS.soloTrack.title, { exact: true })
      .first()
      .click({ button: 'right' });
    await window.click('[data-testid="context-menu-remove-selected"]');
    await expect(window.getByText(TRACKS.soloTrack.title, { exact: true })).not.toBeVisible({
      timeout: 5_000,
    });

    const saveRequest = window.waitForRequest(
      (req) => {
        const url = new URL(req.url());
        return url.pathname.endsWith('/createPlaylist.view') && url.searchParams.has('playlistId');
      },
      { timeout: 10_000 }
    );
    await window.click('[data-testid="playlist-save-button"]');
    await saveRequest;

    // Reload the playlist to confirm the removal is server-side, not just local.
    await window.click('[data-testid="nav-playlists"]');
    await navigateToImportedPlaylist(window);
    await expect(window.getByText(TRACKS.soloTrack.title, { exact: true })).not.toBeVisible();
    await expect(window.getByText(TRACKS.track01.title, { exact: true }).first()).toBeVisible();
    await expect(window.getByText(TRACKS.jazzTrack.title, { exact: true }).first()).toBeVisible();

    // Restore: add Solo Track back via its own context menu's "Add to playlist".
    await window.click('[data-testid="nav-albums"]');
    await expect(window.getByText(TRACKS.soloTrack.album, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.getByText(TRACKS.soloTrack.album, { exact: true }).first().dblclick();
    await window
      .getByText(TRACKS.soloTrack.title, { exact: true })
      .first()
      .click({ button: 'right' });
    await window.click('[data-testid="context-menu-add-to-playlist"]');
    await window.locator('[data-testid="add-to-playlist-select"]').click();
    await selectPlaylistInPicker(window, IMPORTED_PLAYLIST.name);

    const addRequest = window.waitForRequest(
      (req) => {
        const url = new URL(req.url());
        return url.pathname.endsWith('/updatePlaylist.view') && url.searchParams.has('songIdToAdd');
      },
      { timeout: 10_000 }
    );
    await window.click('[data-testid="add-to-playlist-confirm-button"]');
    await addRequest;

    await window.click('[data-testid="nav-playlists"]');
    await navigateToImportedPlaylist(window);
    await expect(window.getByText(TRACKS.soloTrack.title, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
