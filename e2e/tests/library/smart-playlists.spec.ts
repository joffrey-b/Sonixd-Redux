import { test, expect } from '../../fixtures';
import { ELECTRONIC_TRACK_TITLES, TRACKS } from '../../fixtures/constants';

test.describe('Smart playlists', () => {
  test('genre rule returns Electronic tracks and excludes the Jazz track', async ({
    navidromeApp: { window },
  }) => {
    await window.click('[data-testid="nav-smart-playlists"]');
    await window.click('[data-testid="create-smart-playlist"]');

    // Name the playlist
    await window.fill('[data-testid="playlist-name-input"]', 'Electronic Only');

    // Add a rule — new rules default to genre / is / (empty), so just fill the value
    await window.click('[data-testid="add-rule"]');
    await window.fill('[data-testid="rule-value-input"]', TRACKS.track01.genre);

    // Default sort is playCount, which filters out every song with 0 plays (see
    // useSmartPlaylist.ts) — all test fixture tracks have never been played, so
    // that would always return an empty result. Use random sort instead.
    await window.locator('[data-testid="sort-field-select"]').selectOption('random');

    // Save
    await window.click('[data-testid="save-playlist"]');

    // Playlist row appears in the list
    const row = window
      .locator('[data-testid="smart-playlist-row"]')
      .filter({ hasText: 'Electronic Only' });
    await expect(row).toBeVisible({ timeout: 5_000 });

    // Play the playlist
    await row.locator('[data-testid="playlist-play-btn"]').click();

    // Player should start with one of the Electronic test tracks
    await expect(window.locator('[data-testid="player-bar"]')).toBeVisible({ timeout: 10_000 });
    await window.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="player-track-title"]');
        return el && el.textContent && el.textContent.trim().length > 0;
      },
      { timeout: 15_000 }
    );

    const title = (
      await window.locator('[data-testid="player-track-title"]').textContent()
    )?.trim();

    // Must be one of the Electronic tracks...
    expect(ELECTRONIC_TRACK_TITLES.some((t) => title?.includes(t))).toBe(true);
    // ...and must NOT be the Jazz track — proves the rule actually filters rather
    // than passing every track through (the Jazz track shares no other distinguishing
    // field with the Electronic tracks, so this is the only way to falsify the rule).
    expect(title?.includes(TRACKS.jazzTrack.title)).toBe(false);
  });

  test('genre rule with Jazz returns only the Jazz track', async ({ navidromeApp: { window } }) => {
    await window.click('[data-testid="nav-smart-playlists"]');
    await window.click('[data-testid="create-smart-playlist"]');

    await window.fill('[data-testid="playlist-name-input"]', 'Jazz Only');

    await window.click('[data-testid="add-rule"]');
    await window.fill('[data-testid="rule-value-input"]', TRACKS.jazzTrack.genre);

    // Default sort is playCount, which filters out every song with 0 plays (see
    // useSmartPlaylist.ts) — all test fixture tracks have never been played, so
    // that would always return an empty result. Use random sort instead.
    await window.locator('[data-testid="sort-field-select"]').selectOption('random');

    await window.click('[data-testid="save-playlist"]');

    const row = window
      .locator('[data-testid="smart-playlist-row"]')
      .filter({ hasText: 'Jazz Only' });
    await expect(row).toBeVisible({ timeout: 5_000 });

    await row.locator('[data-testid="playlist-play-btn"]').click();

    await expect(window.locator('[data-testid="player-bar"]')).toBeVisible({ timeout: 10_000 });
    await window.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="player-track-title"]');
        return el && el.textContent && el.textContent.trim().length > 0;
      },
      { timeout: 15_000 }
    );

    const title = (
      await window.locator('[data-testid="player-track-title"]').textContent()
    )?.trim();
    expect(title?.includes(TRACKS.jazzTrack.title)).toBe(true);
  });

  test('playlist appears in list after creation with no rules', async ({
    navidromeApp: { window },
  }) => {
    await window.click('[data-testid="nav-smart-playlists"]');
    await window.click('[data-testid="create-smart-playlist"]');

    await window.fill('[data-testid="playlist-name-input"]', 'No Rules Test');
    // No rules added — plays a random pool from the server. Default sort is
    // playCount, which filters out every song with 0 plays (see
    // useSmartPlaylist.ts) — all test fixture tracks have never been played, so
    // that would always return an empty result. Use random sort instead.
    await window.locator('[data-testid="sort-field-select"]').selectOption('random');
    await window.click('[data-testid="save-playlist"]');

    const row = window.locator('[data-testid="smart-playlist-row"]').filter({
      hasText: 'No Rules Test',
    });
    await expect(row).toBeVisible({ timeout: 5_000 });

    // Play and verify the player starts
    await row.locator('[data-testid="playlist-play-btn"]').click();
    await expect(window.locator('[data-testid="player-bar"]')).toBeVisible({ timeout: 15_000 });
  });

  test('playlist can be deleted', async ({ navidromeApp: { window } }) => {
    await window.click('[data-testid="nav-smart-playlists"]');
    await window.click('[data-testid="create-smart-playlist"]');
    await window.fill('[data-testid="playlist-name-input"]', 'Delete Me');
    await window.click('[data-testid="save-playlist"]');

    const row = window
      .locator('[data-testid="smart-playlist-row"]')
      .filter({ hasText: 'Delete Me' });
    await expect(row).toBeVisible({ timeout: 5_000 });

    // Click delete (first click shows confirm buttons)
    const trashBtn = row.locator('button').last();
    await trashBtn.click();
    // Confirm deletion (Yes button appears)
    await row.locator('text=Yes').click();

    await expect(row).not.toBeVisible({ timeout: 5_000 });
  });
});
