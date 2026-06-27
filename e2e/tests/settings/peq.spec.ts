import { _electron as electronLauncher } from '@playwright/test';
import { test, expect, MAIN_JS, ELECTRON_BIN } from '../../fixtures';
import { TRACKS } from '../../fixtures/constants';

// PEQ (Parametric EQ) — confirmed from source (peqSlice.ts / PEQConfig.tsx /
// mpvEqFilter.ts / Player.tsx):
//   - Fixed 10 bands, no add/remove UI. Each band: enabled, type
//     (peaking/lowshelf/highshelf/lowpass/highpass/notch), freq, gain, q.
//   - Persisted via useEffects in PEQConfig.tsx itself (peqEnabled/peqBands/
//     peqCustomPresets/peqPreampDb), same mechanism as EQ.
//   - Applies to both backends: a 10-BiquadFilterNode chain for Web Audio
//     (Player.tsx), and mpvEqFilter.ts's lavfi chain for MPV — confirmed by
//     the user, and independently confirmed symmetric: gain has no audible
//     effect for lowpass/highpass/notch on EITHER backend (MPV's filter
//     strings omit g= for those types; BiquadFilterNode.gain is spec-ignored
//     for those types) — the UI already disables the gain field for them.
//   - Freq/gain/Q are RSuite InputNumber, which renders a native type="text"
//     input under the hood (confirmed by reading node_modules/rsuite source)
//     — .fill() works directly, no keyboard workaround needed.
//   - Per-band type and the preset picker are RSuite InputPicker — given the
//     hidden-native-select testability workaround already established for
//     player-backend-select/replaygain-mode-select in PlaybackConfig.tsx
//     (peq-band-{i}-type, peq-preset-select).
//   - Preamp is a native <input type="range"> — keyboard Home+ArrowRight,
//     same as the volume/EQ sliders.

async function relaunch(app: import('@playwright/test').ElectronApplication, userDataDir: string) {
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

async function openPeqSettings(window: import('@playwright/test').Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-equalizer"]');
}

async function ensurePeqEnabled(window: import('@playwright/test').Page) {
  const toggle = window.locator('[data-testid="peq-enable-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if (!(await toggle.isChecked())) await toggle.click();
}

test('PEQ enabled state persists across app restart', async ({
  navidromeApp: { app, window, userDataDir },
}) => {
  test.setTimeout(60_000);
  await openPeqSettings(window);
  await ensurePeqEnabled(window);
  await expect(window.locator('[data-testid="peq-enable-toggle"]')).toBeChecked();
  await window.waitForTimeout(300); // let settings.set('peqEnabled', ...) land

  const { app2, w2 } = await relaunch(app, userDataDir);
  await openPeqSettings(w2);
  await expect(w2.locator('[data-testid="peq-enable-toggle"]')).toBeChecked();
  await app2.close();
});

// Combined rather than one test per field: all four band fields persist via
// the SAME settings key (peqBands, the whole array written as one unit by a
// single useEffect) and the UI groups them in one row — there is no
// per-field code path to exercise separately, so one app restart covers all
// four with the same rigor four would.
test('PEQ band frequency/gain/Q/type all persist across app restart', async ({
  navidromeApp: { app, window, userDataDir },
}) => {
  test.setTimeout(60_000);
  await openPeqSettings(window);
  await ensurePeqEnabled(window);

  // Band 0 defaults: peaking, freq=32, gain=0, q=1.0. Pick a type that keeps
  // gain editable (NO_GAIN_TYPES only disables it for lowpass/highpass/notch)
  // so all four fields are meaningfully exercised in one band.
  await window.selectOption('[data-testid="peq-band-0-type"]', 'highshelf');
  await window.fill('[data-testid="peq-band-0-freq"] input', '250');
  await window.fill('[data-testid="peq-band-0-gain"] input', '5.5');
  await window.fill('[data-testid="peq-band-0-q"] input', '3.2');
  await window.waitForTimeout(300);

  const { app2, w2 } = await relaunch(app, userDataDir);
  await openPeqSettings(w2);

  await expect(w2.locator('[data-testid="peq-band-0-type"]')).toHaveValue('highshelf');
  expect(await w2.locator('[data-testid="peq-band-0-freq"] input').inputValue()).toBe('250');
  expect(await w2.locator('[data-testid="peq-band-0-gain"] input').inputValue()).toBe('5.5');
  expect(await w2.locator('[data-testid="peq-band-0-q"] input').inputValue()).toBe('3.2');
  await app2.close();
});

test.describe('PEQ toggle while playing — Web Audio', () => {
  test('PEQ can be toggled while music is playing without crashing', async ({
    navidromeApp: { window },
  }) => {
    await window.click('[data-testid="nav-albums"]');
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');
    await window.waitForTimeout(2000);

    const before = await window.locator('[data-testid="player-current-time"]').textContent();

    await openPeqSettings(window);
    await window.click('[data-testid="peq-enable-toggle"]');
    await window.waitForTimeout(1000);

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );
    const after = await window.locator('[data-testid="player-current-time"]').textContent();
    expect(after).not.toBe(before);
  });
});

test.describe('PEQ toggle while playing — MPV', () => {
  test('PEQ can be toggled while music is playing without crashing', async ({
    navidromeAppMpv: { window },
  }) => {
    await window.click('[data-testid="nav-albums"]');
    await window.locator(`text=${TRACKS.track01.album}`).first().dblclick();
    await window.locator(`text=${TRACKS.track01.title}`).first().dblclick();
    await window.waitForSelector('[data-testid="player-bar"]');
    await window.waitForTimeout(2000);

    const before = await window.locator('[data-testid="player-current-time"]').textContent();

    await openPeqSettings(window);
    await window.click('[data-testid="peq-enable-toggle"]');
    await window.waitForTimeout(1000);

    await expect(window.locator('[data-testid="player-track-title"]')).toContainText(
      TRACKS.track01.title
    );
    const after = await window.locator('[data-testid="player-current-time"]').textContent();
    expect(after).not.toBe(before);
  });
});

test('loading a PEQ preset updates all band values at once', async ({
  navidromeApp: { window },
}) => {
  await openPeqSettings(window);
  await ensurePeqEnabled(window);

  // Bass Boost (PEQConfig.tsx BUILT_IN_PEQ_PRESETS): band0 lowshelf
  // freq=60/gain=4/q=0.7, band1 peaking freq=100/gain=5/q=1.0.
  await window.selectOption('[data-testid="peq-preset-select"]', 'bassBoost');
  await window.waitForTimeout(500); // pendingReset round-trip + InputNumber remount

  await expect(window.locator('[data-testid="peq-band-0-type"]')).toHaveValue('lowshelf');
  expect(await window.locator('[data-testid="peq-band-0-freq"] input').inputValue()).toBe('60');
  expect(await window.locator('[data-testid="peq-band-0-gain"] input').inputValue()).toBe('4');
  expect(await window.locator('[data-testid="peq-band-0-q"] input').inputValue()).toBe('0.7');

  await expect(window.locator('[data-testid="peq-band-1-type"]')).toHaveValue('peaking');
  expect(await window.locator('[data-testid="peq-band-1-freq"] input').inputValue()).toBe('100');
  expect(await window.locator('[data-testid="peq-band-1-gain"] input').inputValue()).toBe('5');
  expect(await window.locator('[data-testid="peq-band-1-q"] input').inputValue()).toBe('1');
});
