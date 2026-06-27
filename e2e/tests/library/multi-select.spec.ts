import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Multi-select bulk actions — confirmed from source (useListClickHandler.ts,
// ListViewTable.tsx, ContextMenu.tsx):
//   - A plain click on a row does nothing on its own — handleRowClick only
//     acts on ctrl-click (toggleSelected, one row at a time) or shift-click
//     (setSelected, a contiguous range from the last-selected row to the
//     clicked one). Both are wrapped in a 100ms setTimeout (to distinguish
//     from a double-click, which cancels it) — clicks need a short settle
//     wait afterward, not just an immediate read.
//   - Selected rows get a real, observable "selected" CSS class
//     (ListViewTable.tsx's rowClassName), not just internal Redux state —
//     used here as a direct, visible signal rather than only inferring
//     selection indirectly through a bulk action's side effects.
//   - Right-clicking a row that's ALREADY part of the current multi-select
//     preserves the whole selection for the context menu; right-clicking a
//     DIFFERENT, not-yet-selected row resets the selection to just that one
//     (confirmed in ListViewTable.tsx's onContextMenu handler) — every test
//     below right-clicks one of the rows it just ctrl/shift-clicked, never a
//     fresh one.
//   - handleAddToQueue, handleAddToPlaylist, and handleRemoveSelected in
//     ContextMenu.tsx all operate on the full multiSelect.selected array,
//     not just the single right-clicked row — confirmed by reading each
//     directly, not assumed from the "selected" naming.
//   - Clicking via track title text (not the row itself) avoids landing on
//     the artist-name or album-name sub-links also present in the same row
//     (confirmed via the ARIA row snapshot from an earlier session showing
//     "Test Artist"/"Test Album" as separate nested buttons) — same
//     text-based locator style already used for right-clicks throughout
//     this suite, extended here to the ctrl/shift-click itself.

async function navigateToTestAlbum(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.getByText(TRACKS.track01.album, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.getByText(TRACKS.track01.album, { exact: true }).first().dblclick();
}

async function playSoloTrack(window: Page) {
  await window.click('[data-testid="nav-albums"]');
  await expect(window.getByText(TRACKS.soloTrack.album, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await window.getByText(TRACKS.soloTrack.album, { exact: true }).first().dblclick();
  await window.getByText(TRACKS.soloTrack.title, { exact: true }).first().dblclick();
  await window.waitForSelector('[data-testid="player-bar"]');
}

async function ctrlClickTrack(window: Page, title: string) {
  await window
    .getByText(title, { exact: true })
    .first()
    .click({ modifiers: ['Control'] });
  await window.waitForTimeout(200);
}

async function shiftClickTrack(window: Page, title: string) {
  await window
    .getByText(title, { exact: true })
    .first()
    .click({ modifiers: ['Shift'] });
  await window.waitForTimeout(200);
}

async function rightClickTrack(window: Page, title: string) {
  await window.getByText(title, { exact: true }).first().click({ button: 'right' });
}

async function isRowSelected(window: Page, title: string): Promise<boolean> {
  const classAttr = await window.getByRole('row', { name: title }).first().getAttribute('class');
  return /\bselected\b/.test(classAttr ?? '');
}

async function createPlaylistAndAddSelected(window: Page, name: string) {
  await window.click('[data-testid="context-menu-add-to-playlist"]');
  await window.click('[data-testid="context-menu-create-new-playlist-toggle"]');
  await window.fill('[data-testid="context-menu-new-playlist-name-input"]', name);

  // handleCreatePlaylist (ContextMenu.tsx) awaits createPlaylist.view, then
  // ALSO awaits a refetchQueries(['playlists']) before resolving — a
  // separate getPlaylists.view round trip that has to land before the
  // picker's own data actually includes the just-created playlist. A blind
  // wait here risks the same race a real run hit in playlist-management.spec.ts:
  // the picker opens and the name gets typed, but the option doesn't exist
  // in the (still-stale) list yet.
  const refetchResponse = window.waitForResponse(
    (res) => new URL(res.url()).pathname.endsWith('/getPlaylists.view'),
    { timeout: 10_000 }
  );
  await window.click('[data-testid="context-menu-new-playlist-ok-button"]');
  await refetchResponse;

  // The add-to-playlist picker is virtualized, and its option list is every
  // playlist ever created on the shared Navidrome instance and never
  // deleted — across every local and CI run, not just this file. A real
  // full-suite run timed out selecting a brand-new playlist by plain text
  // because the list had grown long enough that the target wasn't rendered
  // within the virtualization window yet. Typing into the picker's own
  // search input filters the list first, side-stepping list length
  // entirely. Getting there reliably took three attempts: a guessed CSS
  // class (.rs-picker-search-input, from rsuite's InputSearch.js source —
  // never matched anything live), then scoping to
  // getByTestId('picker-popup') then getByRole('textbox') (ALSO timed out,
  // even for a real `textbox` role confirmed present in that exact run's
  // ARIA snapshot — this InputPicker's custom `container` ref means neither
  // approach reliably resolves wherever it actually renders). Dropped
  // element-targeting for the input entirely: clicking the picker's toggle
  // already focuses its internal search field (standard combobox
  // behavior), so typing via the keyboard directly reaches it regardless
  // of where in the DOM it actually lives. Matching options still expose a
  // real role="option" reliably. Both tests using this helper also delete
  // their own playlist when done, so this suite stops contributing further
  // to the list's growth.
  await window.locator('[data-testid="add-to-playlist-select"]').click();
  await window.keyboard.type(name);
  await window.getByRole('option', { name, exact: true }).click();
  await window.click('[data-testid="add-to-playlist-confirm-button"]');
  await window.waitForTimeout(1_000);
}

async function deletePlaylistByName(window: Page, name: string) {
  await window.click('[data-testid="nav-playlists"]');
  await window.getByText(name, { exact: true }).first().dblclick();
  await window.click('[data-testid="delete-playlist-button"]');
  await window.click('[data-testid="delete-playlist-confirm-yes"]');
  await expect(window.getByText(name, { exact: true })).toHaveCount(0, { timeout: 10_000 });
}

test.describe('Multi-select bulk actions', () => {
  test('ctrl-clicking multiple rows selects each independently', async ({
    navidromeApp: { window },
  }) => {
    await navigateToTestAlbum(window);
    await ctrlClickTrack(window, TRACKS.track01.title);
    await ctrlClickTrack(window, TRACKS.track03.title);

    expect(await isRowSelected(window, TRACKS.track01.title)).toBe(true);
    expect(await isRowSelected(window, TRACKS.track03.title)).toBe(true);
    // Track02 was never clicked — must not be swept in.
    expect(await isRowSelected(window, TRACKS.track02.title)).toBe(false);
  });

  test('shift-clicking selects the full contiguous range', async ({ navidromeApp: { window } }) => {
    await navigateToTestAlbum(window);
    await ctrlClickTrack(window, TRACKS.track01.title);
    await shiftClickTrack(window, TRACKS.track03.title);

    expect(await isRowSelected(window, TRACKS.track01.title)).toBe(true);
    expect(await isRowSelected(window, TRACKS.track02.title)).toBe(true);
    expect(await isRowSelected(window, TRACKS.track03.title)).toBe(true);
  });

  test('bulk-adding selected tracks to the queue adds all of them', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    // Solo Track first for a clean queue baseline — opening Test Album
    // directly would auto-queue all 3 of its tracks (setPlayQueueByRowClick
    // queues the whole album), making it ambiguous whether a later
    // bulk-add actually added anything or the tracks were already there.
    await playSoloTrack(window);
    await navigateToTestAlbum(window);

    await ctrlClickTrack(window, TRACKS.track01.title);
    await ctrlClickTrack(window, TRACKS.track03.title);
    await rightClickTrack(window, TRACKS.track03.title);
    await window.click('[data-testid="context-menu-play-next"]');

    await window.click('[data-testid="player-queue-button"]');
    await window.waitForTimeout(1_000);

    // The queue view is an overlay on top of the still-mounted Test Album
    // page underneath, not a full navigation — Track02's row in that
    // underlying table would also count as "visible" to Playwright (it
    // doesn't check z-index occlusion), so there's no reliable way to assert
    // its absence here specifically. .first() resolves the matching
    // ambiguity between the two pages for what IS expected to be present;
    // proving both tracks landed in the queue is already sufficient to
    // falsify a broken multi-select (a single-item fallback would only add
    // the right-clicked track, failing the Track01 check below).
    await expect(window.getByRole('row', { name: TRACKS.track01.title }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByRole('row', { name: TRACKS.track03.title }).first()).toBeVisible();
  });

  test('bulk-adding selected tracks to a playlist adds all of them', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    const name = `Bulk Add ${Date.now()}`;

    await navigateToTestAlbum(window);
    await ctrlClickTrack(window, TRACKS.track01.title);
    await ctrlClickTrack(window, TRACKS.track02.title);
    await rightClickTrack(window, TRACKS.track02.title);
    await createPlaylistAndAddSelected(window, name);

    await window.click('[data-testid="nav-playlists"]');
    await window.getByText(name, { exact: true }).first().dblclick();
    await expect(window.getByText(TRACKS.track01.title, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.getByText(TRACKS.track02.title, { exact: true }).first()).toBeVisible();
    await expect(window.getByText(TRACKS.track03.title, { exact: true })).not.toBeVisible();

    await deletePlaylistByName(window, name);
  });

  test('bulk-removing selected tracks from a playlist removes all of them', async ({
    navidromeApp: { window },
  }) => {
    test.setTimeout(60_000);
    const name = `Bulk Remove ${Date.now()}`;

    // Set up: a disposable playlist containing all 3 Test Album tracks.
    await navigateToTestAlbum(window);
    await ctrlClickTrack(window, TRACKS.track01.title);
    await ctrlClickTrack(window, TRACKS.track02.title);
    await ctrlClickTrack(window, TRACKS.track03.title);
    await rightClickTrack(window, TRACKS.track03.title);
    await createPlaylistAndAddSelected(window, name);

    await window.click('[data-testid="nav-playlists"]');
    await window.getByText(name, { exact: true }).first().dblclick();
    await expect(window.getByText(TRACKS.track01.title, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Bulk-remove 2 of the 3 — local change until Save, same as the
    // single-track removal flow confirmed in playlist-imported.spec.ts.
    await ctrlClickTrack(window, TRACKS.track01.title);
    await ctrlClickTrack(window, TRACKS.track02.title);
    await rightClickTrack(window, TRACKS.track02.title);
    await window.click('[data-testid="context-menu-remove-selected"]');
    await window.click('[data-testid="playlist-save-button"]');
    await window.waitForTimeout(1_000);

    await expect(window.getByText(TRACKS.track01.title, { exact: true })).not.toBeVisible();
    await expect(window.getByText(TRACKS.track02.title, { exact: true })).not.toBeVisible();
    await expect(window.getByText(TRACKS.track03.title, { exact: true }).first()).toBeVisible();

    await deletePlaylistByName(window, name);
  });
});
