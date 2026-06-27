import { _electron as electronLauncher } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';

test.describe('Settings persistence', () => {
  test('EQ settings persist across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    // Enable EQ
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-equalizer"]');
    const eqToggle = window.locator('[data-testid="eq-enable-toggle"]');
    if (!(await eqToggle.isChecked())) await eqToggle.click();
    await expect(eqToggle).toBeChecked();

    // Close app and reopen
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

    await w2.click('[data-testid="settings-link"]');
    await w2.click('[data-testid="settings-equalizer"]');
    await expect(w2.locator('[data-testid="eq-enable-toggle"]')).toBeChecked();
    await app2.close();
  });

  test('volume setting persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);

    // Playwright's .fill() explicitly rejects input[type=range]. Driving it via 50
    // discrete keyboard ArrowRight presses was tried and confirmed unreliable: a
    // diagnostic run showed the browser keeps firing native keydown/input events on
    // every press (so it isn't dropped/coalesced events or a focus/disabled issue),
    // but Chromium's internal range-input keyboard-stepping baseline desyncs from the
    // React-controlled value when keys are dispatched programmatically faster than a
    // human would press them — the value reported to React's onChange handler stalls
    // partway and never reaches the target no matter how many more presses follow.
    // Setting the value via the native property setter and dispatching a real 'input'
    // event sidesteps that automation-only quirk while still exercising the actual
    // onChange → setLocalVolume → debounce → dispatch/settings.set code path.
    await window.evaluate(() => {
      const el = document.querySelector('[data-testid="volume-slider"]') as HTMLInputElement;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const nativeValueSetter = descriptor?.set;
      if (!nativeValueSetter) throw new Error('native value setter not found');
      nativeValueSetter.call(el, '50');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(window.locator('[data-testid="volume-slider"]')).toHaveValue('50');
    await window.waitForTimeout(300); // let the 100ms debounced settings.set('volume', ...) land

    // Close and relaunch with the same userData
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

    // Re-read the volume slider value in the fresh window
    const val = await w2
      .locator('[data-testid="volume-slider"]')
      .evaluate((el: HTMLInputElement) => el.value);
    expect(Number(val)).toBeCloseTo(50, -1); // within +-10
    await app2.close();
  });

  test('EQ band gain persists across app restart', async ({
    navidromeApp: { app, window, userDataDir },
  }) => {
    test.setTimeout(60_000);
    await window.click('[data-testid="settings-link"]');
    await window.click('[data-testid="settings-equalizer"]');

    // Enable EQ and set a non-default gain on band 0
    const eqToggle = window.locator('[data-testid="eq-enable-toggle"]');
    if (!(await eqToggle.isChecked())) await eqToggle.click();

    const band0 = window.locator('[data-testid="eq-band-0-slider"]');
    await band0.focus();
    await band0.press('End'); // max gain
    await window.waitForTimeout(300); // let the settings.set('eqGains', ...) effect land

    // Close and relaunch with the same userData
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

    await w2.click('[data-testid="settings-link"]');
    await w2.click('[data-testid="settings-equalizer"]');
    const val = await w2
      .locator('[data-testid="eq-band-0-slider"]')
      .evaluate((el: HTMLInputElement) => el.value);
    expect(Number(val)).toBeGreaterThan(0);
    await app2.close();
  });
});
