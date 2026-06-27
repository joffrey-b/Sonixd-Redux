import { _electron as electronLauncher } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { ELECTRONIC_TRACK_TITLES, TRACKS } from '../../fixtures/constants';

// Save as static playlist — confirmed from source:
//   - The prompt assumed a "Save as playlist" button inside the
//     SmartPlaylistEditor modal. That doesn't exist — the editor's Save
//     button (save-playlist) only saves/updates the SMART playlist
//     definition (rules/sort/limit), via SmartPlaylistList.tsx's handleSave.
//   - The real feature is the cloud-upload button on each smart playlist row
//     (SmartPlaylistRow's onSaveToServer -> handleSaveToServer in
//     SmartPlaylistList.tsx). No testid existed — added
//     playlist-save-to-server-btn this session.
//   - No name input dialog: handleSaveToServer reuses playlist.name directly
//     — createPlaylist({ name: playlist.name }) followed by
//     updatePlaylistSongsLg with the resolved song list.
//   - Confirmation is a toast only ("Playlist saved to server.", via
//     notifyToast('success', ...)) — no auto-navigation to the new playlist.
//     Both API calls are awaited sequentially before the toast fires, so by
//     the time the toast is visible the playlist is already live on the
//     server and a subsequent getPlaylists fetch will include it.
//   - The Playlists sidebar nav item had no testid (only Smart Playlists did)
//     — added nav-playlists this session.
//   - PlaylistView.tsx (the per-playlist detail page) renders tracks through
//     the same musicListColumns-driven ListViewTable as AlbumView, so track
//     titles are plain text rows — same text=${title} matching used
//     throughout the rest of this suite, no new testid needed there.

async function createElectronicSmartPlaylist(window: Page, name: string) {
  await window.click('[data-testid="nav-smart-playlists"]');
  await window.click('[data-testid="create-smart-playlist"]');
  await window.fill('[data-testid="playlist-name-input"]', name);
  await window.click('[data-testid="add-rule"]');
  await window.fill('[data-testid="rule-value-input"]', TRACKS.track01.genre);
  // Default sort is playCount, which filters out every unplayed song (see
  // useSmartPlaylist.ts) — all fixture tracks have 0 plays, so use random
  // sort instead, same fix as the existing smart-playlists.spec.ts tests.
  await window.locator('[data-testid="sort-field-select"]').selectOption('random');
  await window.click('[data-testid="save-playlist"]');
}

async function saveToServer(window: Page, name: string) {
  const row = window.locator('[data-testid="smart-playlist-row"]').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.locator('[data-testid="playlist-save-to-server-btn"]').click();
  await expect(window.locator('text=Playlist saved to server.')).toBeVisible({ timeout: 15_000 });
}

test.describe('Smart playlist — save as static playlist', () => {
  test('saving a smart playlist creates a new static playlist visible in Playlists', async ({
    navidromeApp: { window },
  }) => {
    await createElectronicSmartPlaylist(window, 'Electronic Saved');
    await saveToServer(window, 'Electronic Saved');

    await window.click('[data-testid="nav-playlists"]');
    await expect(window.locator('text=Electronic Saved').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the saved static playlist contains the correct tracks', async ({
    navidromeApp: { window },
  }) => {
    await createElectronicSmartPlaylist(window, 'Electronic Contents');
    await saveToServer(window, 'Electronic Contents');

    await window.click('[data-testid="nav-playlists"]');
    const playlistEntry = window.locator('text=Electronic Contents').first();
    await expect(playlistEntry).toBeVisible({ timeout: 15_000 });
    await playlistEntry.dblclick();

    // The genre=Electronic rule matched tracks 01-04 (4 Electronic tracks).
    for (const title of ELECTRONIC_TRACK_TITLES) {
      await expect(window.locator(`text=${title}`).first()).toBeVisible({ timeout: 10_000 });
    }
    await expect(window.locator(`text=${TRACKS.jazzTrack.title}`)).not.toBeVisible();
  });

  test('the saved playlist persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await createElectronicSmartPlaylist(window, 'Electronic Persisted');
    await saveToServer(window, 'Electronic Persisted');

    // Close and relaunch with the same userDataDir — the playlist itself
    // lives on Navidrome, not in local app state, so a restart should not
    // affect it (the Docker containers stay up between test runs).
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
    await w2.waitForSelector('[data-testid="nav-albums"]');

    await w2.click('[data-testid="nav-playlists"]');
    await expect(w2.locator('text=Electronic Persisted').first()).toBeVisible({
      timeout: 15_000,
    });
    await app2.close();
  });
});
