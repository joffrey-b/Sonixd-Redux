import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// Folder view — confirmed from source (FolderList.tsx, folderSlice.ts):
//   - The fix is in place: getMusicDirectory's query has
//     `enabled: Boolean(folder.currentViewedFolder)`, so it never even fires
//     (not just "fires with an empty id guarded elsewhere") when no folder
//     is selected. Navigating to Folders with no folderId query param
//     dispatches setCurrentViewedFolder('') (confirmed from the
//     query.get('folderId') !== 'null' effect — note the string 'null'
//     comparison, not the JS null literal), which is falsy, so the root
//     view renders from the separate, always-enabled getIndexes query
//     instead (indexData), never getMusicDirectory.
//   - getIndexes (api.ts) flattens Subsonic's index response into folder
//     entries named after each top-level ARTIST directory — confirmed
//     e2e/test-music/ is laid out as {Artist}/{Album}/{track}.flac (real
//     directory listing), so the folder view's root shows "Test Artist",
//     "Solo Artist", "Jazz Artist" as folder rows, drilling into an artist
//     folder shows its one album folder, and drilling into that shows the
//     actual track files. Double-click navigates into folders or plays a
//     track (isDir branch in useListClickHandler's doubleClick), same
//     convention as every other ListViewType-based view.
//   - "Go up" had no testid — added folder-go-up-button. It navigates using
//     folderData.parent, defaulting to '' if absent (e.g. at a top-level
//     artist folder, whose parent is the music root) — going up from there
//     returns to the root/indexData view, exercising the exact navigation
//     shape the original bug occurred in.

async function navigateToFolders(window: Page) {
  await window.click('[data-testid="nav-folders"]');
  await expect(window.locator(`text=${TRACKS.track01.artist}`).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('Folder view', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await navigateToFolders(window);
  });

  test('folder view shows the top-level artist folders', async ({ navidromeApp: { window } }) => {
    await expect(window.locator(`text=${TRACKS.track01.artist}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.soloTrack.artist}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.jazzTrack.artist}`).first()).toBeVisible();
  });

  test('navigating into an artist folder shows its album folder', async ({
    navidromeApp: { window },
  }) => {
    await window.locator(`text=${TRACKS.track01.artist}`).first().dblclick();

    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    // Other artists' folders must not appear one level down.
    await expect(window.locator(`text=${TRACKS.soloTrack.artist}`)).not.toBeVisible();
  });

  test('navigating into an album folder shows its tracks', async ({ navidromeApp: { window } }) => {
    await window.locator(`text=${TRACKS.track01.artist}`).first().dblclick();
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();

    await expect(window.locator(`text=${TRACKS.track01.title}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(window.locator(`text=${TRACKS.track02.title}`).first()).toBeVisible();
    await expect(window.locator(`text=${TRACKS.track03.title}`).first()).toBeVisible();
  });

  test('"Go up" returns from an artist folder to the root folder list', async ({
    navidromeApp: { window },
  }) => {
    await window.locator(`text=${TRACKS.track01.artist}`).first().dblclick();
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });

    await window.click('[data-testid="folder-go-up-button"]');

    // Back at the root — the other artist folders are visible again.
    await expect(window.locator(`text=${TRACKS.soloTrack.artist}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(window.locator(`text=${TRACKS.jazzTrack.artist}`).first()).toBeVisible();
  });

  test('a track from the folder view can be played', async ({ navidromeApp: { window } }) => {
    await window.locator(`text=${TRACKS.jazzTrack.artist}`).first().dblclick();
    await expect(window.locator(`text=${TRACKS.jazzTrack.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.locator(`text=${TRACKS.jazzTrack.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.jazzTrack.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.jazzTrack.title,
      { timeout: 10_000 }
    );
  });
});

// Separate describe block, deliberately with no shared beforeEach — the route
// interceptor below must be registered BEFORE the very first navigation to
// Folders, not after, so it can't share the outer block's beforeEach (which
// navigates there immediately). Still named 'Folder view' so it's included
// by --grep "Folder view" (a standalone test() here would NOT match that
// filter, since its title would have no "Folder view" prefix — confirmed by
// `playwright test --list --grep "Folder view"` only finding 5 of what
// should have been 6 tests on the first real run).
test.describe('Folder view', () => {
  test('no getMusicDirectory request is ever made with an empty id', async ({
    navidromeApp: { window },
  }) => {
    // This is the specific scenario the original bug occurred in: an
    // empty/undefined currentViewedFolder sent getMusicDirectory an empty
    // id. Exercises the full root -> folder -> "Go up" -> root cycle, since
    // the bug could in principle resurface on the way back up too.
    let emptyIdSeen = false;
    await window.route('**/rest/getMusicDirectory.view*', async (route) => {
      const url = new URL(route.request().url());
      const id = url.searchParams.get('id');
      if (!id || id.trim() === '') emptyIdSeen = true;
      await route.continue();
    });

    await navigateToFolders(window);
    await window.locator(`text=${TRACKS.track01.artist}`).first().dblclick();
    await expect(window.locator(`text=${TRACKS.track01.album}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await window.click('[data-testid="folder-go-up-button"]');
    await expect(window.locator(`text=${TRACKS.track01.artist}`).first()).toBeVisible({
      timeout: 15_000,
    });

    expect(emptyIdSeen).toBe(false);
  });
});
