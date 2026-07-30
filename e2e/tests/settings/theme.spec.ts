import { _electron as electronLauncher } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';

// Theme switching — confirmed from source:
//   - Selector: a single-select RSuite InputPicker in LookAndFeelConfig.tsx's
//     ThemeConfigPanel (under the settings-lookandfeel tab, which had no
//     testid either — added this session). No existing testid on the
//     picker — added the established hidden-native-<select> workaround
//     (theme-select).
//   - CSS mechanism: App.tsx's useEffect sets CSS custom properties via
//     document.body.style.setProperty(...) — on document.body, NOT
//     document.documentElement/:root. Custom properties only inherit
//     DOWNWARD to descendants, so reading them from :root would see
//     nothing (they're not set on any ancestor of <body>).
//     getComputedStyle(document.body) is the correct read.
//   - --app-primary is the first variable set, sourced directly from
//     theme.colors.primary. Three built-in themes confirmed pairwise
//     distinct (setDefaultSettings.ts's themesDefault) — chosen
//     deliberately, since e.g. defaultDark and oledDark coincidentally
//     SHARE the same primary color (#2196F3), which would make a naive
//     "any 2 themes differ" test flaky/wrong:
//       defaultDark:  #2196F3
//       defaultLight: #285DA0
//       spotifyLike:  #1DB954
//   - Persisted via settings.set('theme', value); read back on init via
//     miscSlice.ts's theme: String(parsedSettings.theme).

async function openThemeSettings(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-lookandfeel"]');
}

// Confirmed pairwise-distinct built-in themes (setDefaultSettings.ts), used
// below to wait for the SPECIFIC expected color rather than merely "changed
// from before" -- the default theme setting is 'followSystem', which
// resolves to defaultDark's exact palette when the OS/CI environment
// prefers dark mode (App.tsx), so a test's very first selectTheme() call
// could otherwise be waiting for a change that never visibly happens.
const THEME_PRIMARY_COLORS: Record<string, string> = {
  defaultDark: '#2196F3',
  defaultLight: '#285DA0',
  spotifyLike: '#1DB954',
};

async function readPrimaryColor(window: Page): Promise<string> {
  return window.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue('--app-primary').trim()
  );
}

async function selectTheme(window: Page, value: string) {
  // Audit fix: Playwright's default 30s action timeout was observed to be
  // exhausted on a live full-suite run, even though the error-context
  // snapshot at failure time showed the Look & Feel panel fully and
  // correctly rendered (picker present, showing its then-current value) --
  // not a stuck/broken render, just slower than the default budget under
  // real system load late in a long sequential run. Widened rather than
  // treated as a hang.
  await window.selectOption('[data-testid="theme-select"]', value, { timeout: 60_000 });
  // Applying a theme is a multi-step chain, not a single state update:
  // Redux dispatch -> App.tsx resolves the string to a theme object via
  // getTheme() in one effect -> a SECOND effect (keyed on that object) then
  // writes the CSS custom properties to document.body. A fixed wait here
  // previously raced this chain on a live run (a later readPrimaryColor()
  // call read back the PREVIOUS theme's color, still in mid-transition) --
  // poll for the actual expected CSS variable value instead of assuming a
  // fixed delay is always enough.
  await expect
    .poll(() => readPrimaryColor(window), { timeout: 10_000 })
    .toBe(THEME_PRIMARY_COLORS[value]);
}

test.describe('Theme switching', () => {
  test('switching theme changes the CSS variable on document.body', async ({
    navidromeApp: { window },
  }) => {
    await openThemeSettings(window);
    await selectTheme(window, 'defaultDark');
    const before = await readPrimaryColor(window);
    expect(before).toBe('#2196F3');

    await selectTheme(window, 'defaultLight');
    const after = await readPrimaryColor(window);
    expect(after).toBe('#285DA0');
    expect(after).not.toBe(before);
  });

  test('switching between three themes produces three distinct CSS states', async ({
    navidromeApp: { window },
  }) => {
    await openThemeSettings(window);

    await selectTheme(window, 'defaultDark');
    const colorA = await readPrimaryColor(window);

    await selectTheme(window, 'defaultLight');
    const colorB = await readPrimaryColor(window);
    expect(colorB).not.toBe(colorA);

    await selectTheme(window, 'spotifyLike');
    const colorC = await readPrimaryColor(window);
    expect(colorC).not.toBe(colorA);
    expect(colorC).not.toBe(colorB);
  });

  test('selected theme persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    // Audit fix: 60s was exhausted on a live full-suite run purely on
    // cumulative real work (login, 2 tab navigations, theme switch, app
    // close, second app launch, second readback) taking longer than usual
    // under load late in a long sequential run -- the trace showed no single
    // stuck step, just several ordinary steps each taking a few seconds
    // longer than their fast-path timing. Doubled to match this suite's
    // established practice of generous margin for genuinely multi-step flows.
    test.setTimeout(120_000);
    await openThemeSettings(window);
    await selectTheme(window, 'spotifyLike');
    const themeValue = await readPrimaryColor(window);
    expect(themeValue).toBe('#1DB954');
    await window.waitForTimeout(300); // let settings.set('theme', ...) land

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

    const themeValueAfterRestart = await readPrimaryColor(w2);
    expect(themeValueAfterRestart).toBe(themeValue);
    await app2.close();
  });
});
