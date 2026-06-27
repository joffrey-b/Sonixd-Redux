import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// App-created playlist management — confirmed from source (PlaylistList.tsx,
// ContextMenu.tsx, api.ts):
//   - Creating via the Playlists page's "+" button hits /createPlaylist.view
//     with a `name` param, no songs — an empty playlist.
//   - The context menu's "Add to playlist" picker adds to an EXISTING
//     playlist via /updatePlaylist.view with a `songIdToAdd` param.
//   - The SAME context menu's "Create new playlist" sub-flow also hits
//     /createPlaylist.view, but — confirmed by reading handleCreatePlaylist
//     in ContextMenu.tsx directly — it does NOT add the originally
//     right-clicked track. It only creates an empty playlist and refetches
//     the picker's list; the track is only added once that playlist is
//     selected from the (now-refreshed) picker and "Add" is clicked
//     explicitly. Each test below exercises that real two-step flow rather
//     than assuming a one-click "create and add".
//   - Deleting hits /deletePlaylist.view?id=... — tested here (not against
//     the imported playlist fixture, see playlist-imported.spec.ts's file
//     header) since these playlists are fully disposable: created and
//     destroyed within the same test, no lasting consequence for reruns.
//   - Every playlist name includes Date.now() so concurrent/rerun test
//     instances never collide with each other or with the fixed-name
//     fixture playlists used elsewhere in this suite.
//   - The add-to-playlist picker is virtualized, and its option list is
//     every playlist that has EVER been created on the shared Navidrome
//     instance and never deleted — across every local and CI run, not just
//     this file. A real full-suite run timed out selecting a brand-new
//     playlist by plain text because, by then, the list had grown long
//     enough that the target wasn't rendered within the virtualization
//     window yet. Typing into the picker's own search input filters the
//     list first, side-stepping list length entirely.
//   - Getting there reliably took three attempts. (1) Guessed the search
//     input's CSS class from rsuite's InputSearch.js source
//     (.rs-picker-search-input) — never matched anything live. (2) Scoped
//     to getByTestId('picker-popup') then getByRole('textbox') — timed out
//     too, even though a real run's ARIA snapshot showed a `textbox` role
//     nested directly inside an `aria-expanded="true"` combobox; this
//     InputPicker has a custom `container` ref (ContextMenu.tsx:
//     container={() => playlistPickerContainerRef.current}), and neither
//     approach reliably resolves wherever that redirects rendering to.
//     (3) Dropped element-targeting for the input entirely: clicking the
//     picker's toggle already focuses its internal search field (standard
//     combobox behavior), so typing via the keyboard directly reaches it
//     regardless of where in the DOM it actually lives. Matching options
//     still expose a real role="option" reliably.
//   - Every test below also deletes its own disposable playlist when it's
//     done, so this suite stops being part of the problem going forward —
//     only the dedicated "deleting a playlist" test needed to do that
//     before.

async function selectPlaylistInPicker(window: Page, name: string) {
  await window.keyboard.type(name);
  await window.getByRole('option', { name, exact: true }).click();
}

async function deletePlaylistByName(window: Page, name: string) {
  await window.click('[data-testid="nav-playlists"]');
  await window.getByText(name, { exact: true }).first().dblclick();
  await window.click('[data-testid="delete-playlist-button"]');
  await window.click('[data-testid="delete-playlist-confirm-yes"]');
  await expect(window.getByText(name, { exact: true })).toHaveCount(0, { timeout: 10_000 });
}

async function createPlaylistFromList(window: Page, name: string) {
  await window.click('[data-testid="nav-playlists"]');
  await window.click('[data-testid="add-playlist-button"]');
  await window.fill('[data-testid="new-playlist-name-input"]', name);
  const createRequest = window.waitForRequest(
    (req) => {
      const url = new URL(req.url());
      return url.pathname.endsWith('/createPlaylist.view') && url.searchParams.get('name') === name;
    },
    { timeout: 10_000 }
  );
  await window.click('[data-testid="create-playlist-confirm-button"]');
  await createRequest;
}

async function openTrackContextMenu(window: Page, album: string, title: string) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.getByText(album, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await window.getByText(album, { exact: true }).first().dblclick();
  await window.getByText(title, { exact: true }).first().click({ button: 'right' });
  await window.click('[data-testid="context-menu-add-to-playlist"]');
}

test.describe('Playlist management', () => {
  test('creating a playlist from the Playlists page creates it on the server', async ({
    navidromeApp: { window },
  }) => {
    const name = `App Created ${Date.now()}`;
    await createPlaylistFromList(window, name);
    await expect(window.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    await deletePlaylistByName(window, name);
  });

  test('adding a track to an existing playlist via the context menu persists to the server', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    const name = `Add Track Test ${Date.now()}`;
    await createPlaylistFromList(window, name);

    await openTrackContextMenu(window, TRACKS.track01.album, TRACKS.track01.title);
    await window.locator('[data-testid="add-to-playlist-select"]').click();
    await selectPlaylistInPicker(window, name);

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
    await window.getByText(name, { exact: true }).first().dblclick();
    await expect(window.getByText(TRACKS.track01.title, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    await deletePlaylistByName(window, name);
  });

  test('creating a new playlist via the context menu and adding the track to it', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    const name = `Context Menu Created ${Date.now()}`;

    await openTrackContextMenu(window, TRACKS.jazzTrack.album, TRACKS.jazzTrack.title);
    await window.click('[data-testid="context-menu-create-new-playlist-toggle"]');
    await window.fill('[data-testid="context-menu-new-playlist-name-input"]', name);

    const createRequest = window.waitForRequest(
      (req) => {
        const url = new URL(req.url());
        return (
          url.pathname.endsWith('/createPlaylist.view') && url.searchParams.get('name') === name
        );
      },
      { timeout: 10_000 }
    );
    // handleCreatePlaylist (ContextMenu.tsx) awaits createPlaylist.view, then
    // ALSO awaits a refetchQueries(['playlists']) before resolving — a
    // separate getPlaylists.view round trip that has to land before the
    // picker's own data actually includes the just-created playlist. A real
    // run that only waited for createRequest opened the picker and typed
    // the right name, but the option never existed in time. Waiting for the
    // refetch's response, not just its request, before opening the picker.
    const refetchResponse = window.waitForResponse(
      (res) => new URL(res.url()).pathname.endsWith('/getPlaylists.view'),
      { timeout: 10_000 }
    );
    await window.click('[data-testid="context-menu-new-playlist-ok-button"]');
    await createRequest;
    await refetchResponse;

    // Creating does not auto-add the track — select the now-refreshed
    // playlist from the picker and add it explicitly (see file header).
    await window.locator('[data-testid="add-to-playlist-select"]').click();
    await selectPlaylistInPicker(window, name);

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
    await window.getByText(name, { exact: true }).first().dblclick();
    await expect(window.getByText(TRACKS.jazzTrack.title, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    await deletePlaylistByName(window, name);
  });

  test('deleting a playlist removes it from the server', async ({ navidromeApp: { window } }) => {
    const name = `Delete Me ${Date.now()}`;
    await createPlaylistFromList(window, name);
    await window.getByText(name, { exact: true }).first().dblclick();

    const deleteRequest = window.waitForRequest(
      (req) => new URL(req.url()).pathname.endsWith('/deletePlaylist.view'),
      { timeout: 10_000 }
    );
    await window.click('[data-testid="delete-playlist-button"]');
    await window.click('[data-testid="delete-playlist-confirm-yes"]');
    await deleteRequest;

    // .toHaveCount(0) rather than .not.toBeVisible() — SidebarPlaylists.tsx's
    // quick-access list and the page's own H1 heading both show the same
    // playlist name while it exists, so a single .first().not.toBeVisible()
    // could pass falsely if just one of the two had disappeared. This
    // confirms every instance of the name is actually gone.
    await expect(window.getByText(name, { exact: true })).toHaveCount(0, { timeout: 10_000 });
  });
});
