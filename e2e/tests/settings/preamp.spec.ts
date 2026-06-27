import { _electron as electronLauncher } from '@playwright/test';
import type { Page, ElectronApplication } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';

// EQ preamp: native <input type="range"> (VerticalSlider), min=-15 max=15
// step=0.5, default 0. PEQ preamp: also native <input type="range">
// (PreampSlider), min=-15 max=15 step=0.1, default 0. Both use the same
// focus + Home/End keyboard pattern as the existing volume/EQ band sliders
// (.fill() throws on a native range input).

async function relaunch(app: ElectronApplication, userDataDir: string) {
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
  return { app2, w2 };
}

async function openEqSettings(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-equalizer"]');
}

async function ensureEnabled(window: Page, toggleTestId: string) {
  const toggle = window.locator(`[data-testid="${toggleTestId}"]`);
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if (!(await toggle.isChecked())) await toggle.click();
}

test.describe('EQ preamp', () => {
  test('preamp slider changes the value', async ({ navidromeApp: { window } }) => {
    await openEqSettings(window);
    await ensureEnabled(window, 'eq-enable-toggle');

    const preamp = window.locator('[data-testid="eq-preamp-slider"]');
    const before = Number(await preamp.inputValue());
    await preamp.focus();
    await preamp.press('End'); // max (15)
    await window.waitForTimeout(300);
    const after = Number(await preamp.inputValue());
    expect(after).not.toBe(before);
    expect(after).toBe(15);
  });

  test('EQ preamp value persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await openEqSettings(window);
    await ensureEnabled(window, 'eq-enable-toggle');

    const preamp = window.locator('[data-testid="eq-preamp-slider"]');
    await preamp.focus();
    await preamp.press('End'); // max (15)
    await window.waitForTimeout(300); // let settings.set('eqPreampDb', ...) land

    const { app2, w2 } = await relaunch(app, userDataDir);
    await openEqSettings(w2);
    expect(Number(await w2.locator('[data-testid="eq-preamp-slider"]').inputValue())).toBe(15);
    await app2.close();
  });
});

test.describe('PEQ preamp', () => {
  test('preamp slider changes the value', async ({ navidromeApp: { window } }) => {
    await openEqSettings(window);
    await ensureEnabled(window, 'peq-enable-toggle');

    const preamp = window.locator('[data-testid="peq-preamp-slider"]');
    const before = Number(await preamp.inputValue());
    await preamp.focus();
    await preamp.press('End'); // max (15)
    await window.waitForTimeout(300);
    const after = Number(await preamp.inputValue());
    expect(after).not.toBe(before);
    expect(after).toBe(15);
  });

  test('PEQ preamp value persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await openEqSettings(window);
    await ensureEnabled(window, 'peq-enable-toggle');

    const preamp = window.locator('[data-testid="peq-preamp-slider"]');
    await preamp.focus();
    await preamp.press('End'); // max (15)
    await window.waitForTimeout(300); // let settings.set('peqPreampDb', ...) land

    const { app2, w2 } = await relaunch(app, userDataDir);
    await openEqSettings(w2);
    expect(Number(await w2.locator('[data-testid="peq-preamp-slider"]').inputValue())).toBe(15);
    await app2.close();
  });
});
