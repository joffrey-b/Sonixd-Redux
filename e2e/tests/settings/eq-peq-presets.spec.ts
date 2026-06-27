import { _electron as electronLauncher } from '@playwright/test';
import type { Page, ElectronApplication } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';

// Named EQ/PEQ presets — confirmed from source (EQConfig.tsx / PEQConfig.tsx):
//   - No confirmation dialog on delete — both handleDeleteCustomPreset (EQ) and
//     the inline dispatch(deletePeqCustomPreset(...)) (PEQ) fire immediately.
//   - Saving a preset captures ALL bands (eq.gains / peq.bands) plus preampDb,
//     not just whichever field was last touched.
//   - If a name already exists, the first Save click only arms an overwrite
//     (button text flips to "Confirm"); not exercised here since each test
//     uses a fresh name.

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

function presetListItem(window: Page, prefix: string, name: string) {
  // PEQ's preset picker has a hidden native <select> alongside it (for
  // .selectOption() testability) that ALSO lists custom presets as <option>s
  // — a plain `text=${name}` locator ambiguously matches that hidden option
  // (DOM-earlier) before the real visible list item. Scope to the actual
  // list item testid instead.
  return window.locator(`[data-testid="${prefix}-preset-list-item"]`).filter({ hasText: name });
}

async function saveNamedPreset(window: Page, prefix: string, name: string) {
  await window.fill(`[data-testid="${prefix}-preset-name-input"]`, name);
  await window.click(`[data-testid="${prefix}-preset-save-button"]`);
  await expect(presetListItem(window, prefix, name)).toBeVisible({ timeout: 5_000 });
}

test.describe('EQ presets', () => {
  test('save a preset, change values, then load it back restores the saved values', async ({
    navidromeApp: { window },
  }) => {
    await openEqSettings(window);
    await ensureEnabled(window, 'eq-enable-toggle');

    const band0 = window.locator('[data-testid="eq-band-0-slider"]');
    await band0.focus();
    await band0.press('End'); // max gain (12)
    await window.waitForTimeout(300);

    await saveNamedPreset(window, 'eq', 'My EQ Preset');

    // Change band 0 away from the saved value.
    await band0.press('Home'); // min gain (-12)
    await window.waitForTimeout(300);
    expect(Number(await band0.inputValue())).toBeLessThan(0);

    await window.click('[data-testid="eq-preset-load-button"]');
    await window.waitForTimeout(300);
    expect(Number(await band0.inputValue())).toBe(12);
  });

  test('delete a preset removes it from the list', async ({ navidromeApp: { window } }) => {
    await openEqSettings(window);
    await ensureEnabled(window, 'eq-enable-toggle');
    await saveNamedPreset(window, 'eq', 'Preset To Delete');

    await window.click('[data-testid="eq-preset-delete-button"]');
    await expect(presetListItem(window, 'eq', 'Preset To Delete')).toHaveCount(0);
  });

  test('saved presets persist across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await openEqSettings(window);
    await ensureEnabled(window, 'eq-enable-toggle');

    const band0 = window.locator('[data-testid="eq-band-0-slider"]');
    await band0.focus();
    await band0.press('End'); // max gain (12)
    await window.waitForTimeout(300);

    await saveNamedPreset(window, 'eq', 'Persisted EQ Preset');
    await window.waitForTimeout(300); // let settings.set('eqCustomPresets', ...) land

    const { app2, w2 } = await relaunch(app, userDataDir);
    await openEqSettings(w2);
    await expect(presetListItem(w2, 'eq', 'Persisted EQ Preset')).toBeVisible({
      timeout: 10_000,
    });

    await w2.click('[data-testid="eq-preset-load-button"]');
    await w2.waitForTimeout(300);
    expect(Number(await w2.locator('[data-testid="eq-band-0-slider"]').inputValue())).toBe(12);
    await app2.close();
  });
});

test.describe('PEQ presets', () => {
  test('save a PEQ preset, change values, then load it back restores the saved values', async ({
    navidromeApp: { window },
  }) => {
    await openEqSettings(window);
    await ensureEnabled(window, 'peq-enable-toggle');

    await window.fill('[data-testid="peq-band-0-gain"] input', '7.5');
    await window.waitForTimeout(300);

    await saveNamedPreset(window, 'peq', 'My PEQ Preset');

    await window.fill('[data-testid="peq-band-0-gain"] input', '-3.2');
    await window.waitForTimeout(300);
    expect(await window.locator('[data-testid="peq-band-0-gain"] input').inputValue()).toBe('-3.2');

    await window.click('[data-testid="peq-preset-load-button"]');
    await window.waitForTimeout(500); // pendingReset round-trip + InputNumber remount
    expect(await window.locator('[data-testid="peq-band-0-gain"] input').inputValue()).toBe('7.5');
  });

  test('delete a PEQ preset removes it from the list', async ({ navidromeApp: { window } }) => {
    await openEqSettings(window);
    await ensureEnabled(window, 'peq-enable-toggle');
    await saveNamedPreset(window, 'peq', 'PEQ Preset To Delete');

    await window.click('[data-testid="peq-preset-delete-button"]');
    await expect(presetListItem(window, 'peq', 'PEQ Preset To Delete')).toHaveCount(0);
  });

  test('saved PEQ presets persist across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await openEqSettings(window);
    await ensureEnabled(window, 'peq-enable-toggle');

    await window.fill('[data-testid="peq-band-0-gain"] input', '7.5');
    await window.waitForTimeout(300);

    await saveNamedPreset(window, 'peq', 'Persisted PEQ Preset');
    await window.waitForTimeout(300); // let settings.set('peqCustomPresets', ...) land

    const { app2, w2 } = await relaunch(app, userDataDir);
    await openEqSettings(w2);
    await expect(presetListItem(w2, 'peq', 'Persisted PEQ Preset')).toBeVisible({
      timeout: 10_000,
    });

    await w2.click('[data-testid="peq-preset-load-button"]');
    await w2.waitForTimeout(500);
    expect(await w2.locator('[data-testid="peq-band-0-gain"] input').inputValue()).toBe('7.5');
    await app2.close();
  });
});
