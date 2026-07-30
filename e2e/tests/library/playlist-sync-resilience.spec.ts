import { _electron as electronLauncher } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';

// Audit finding 2.5 — usePlaylistsCache.ts's syncPlaylists() used to write
// whatever getPlaylists() returned straight into the snapshot unconditionally,
// including a transient-but-successful anomalous empty response, silently
// erasing every previously-synced playlist's offline availability. Written
// from static analysis of the real fix, not from an actual passing run --
// same standing sandbox limitation as the rest of this suite (Electron
// cannot launch here).
//
// Reproduction: let the app's normal launch-time sync populate a real,
// non-empty playlists cache (the fixture server's pre-existing "Imported Mix"
// playlist), restart the app with the SAME persisted login (theme.spec.ts's
// restart pattern) but with getPlaylists.view intercepted to return a valid
// 200 response with zero playlists -- an anomalous-but-successful result a
// real server hiccup could plausibly produce. Confirm the previously-synced
// playlist is still browsable offline afterward, i.e. the anomalous pass did
// not wipe the cache.
test.describe('Playlist cache sync resilience (finding 2.5)', () => {
  test('an anomalous empty getPlaylists response does not wipe a previously-synced playlist cache', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(120_000);

    // Let the real, unintercepted launch-time sync (App.tsx's 2.5s-delayed
    // syncPlaylists) populate the cache with the fixture server's real
    // playlist before doing anything else.
    await window.click('[data-testid="nav-playlists"]');
    // Scoped to the main List view's row, not by role+name -- the sidebar's
    // own playlist entry also matches "Imported Mix" as a button, which
    // would make this assertion pass even if the main content failed to
    // render it (or vice versa once offline, see below).
    await expect(window.getByRole('row', { name: /Imported Mix/ })).toBeVisible({
      timeout: 15_000,
    });
    // Sidebar's own playlist entry (List view's title cell isn't a button,
    // so this reliably targets SidebarPlaylists.tsx, not the main content).
    await expect(window.getByRole('button', { name: 'Imported Mix' })).toBeVisible({
      timeout: 15_000,
    });
    // Give the background sync (fired on mount, independent of this
    // navigation) a moment to actually finish writing the snapshot.
    await window.waitForTimeout(4_000);

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
    const w2: Page = await app2.firstWindow();

    // Installed before the app has a chance to reach its own 2.5s sync timer.
    await w2.route('**/rest/getPlaylists.view*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          'subsonic-response': { status: 'ok', version: '1.16.1', playlists: { playlist: [] } },
        }),
      });
    });

    await w2.waitForSelector('[data-testid="nav-albums"]');
    // Past the 2.5s sync delay plus real margin for the intercepted
    // request/response round trip to actually complete.
    await w2.waitForTimeout(6_000);

    await w2.click('[data-testid="settings-link"]');
    await w2.click('[data-testid="settings-cache"]');
    const forceOfflineInput = w2.locator(
      '[data-testid="force-offline-mode-toggle"] input[type="checkbox"]'
    );
    await expect(forceOfflineInput).toBeVisible({ timeout: 10_000 });
    await forceOfflineInput.click({ force: true });

    await w2.click('[data-testid="nav-playlists"]');
    // The fix: still there, despite the anomalous empty sync pass that just
    // ran during this exact launch.
    await expect(w2.getByRole('row', { name: /Imported Mix/ })).toBeVisible({ timeout: 10_000 });
    // Audit follow-up fix: SidebarPlaylists.tsx used to have no offline
    // branch of its own, so it silently rendered zero entries here even
    // though the main content correctly fell back to the cache -- confirm
    // the sidebar now shows the same cached playlist while offline too.
    await expect(w2.getByRole('button', { name: 'Imported Mix' })).toBeVisible({
      timeout: 10_000,
    });

    await app2.close();
  });
});
