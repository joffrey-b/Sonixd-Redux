import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';

// PEQ frequency response curve — confirmed from source (PEQConfig.tsx):
//   - It's a hand-written <svg><path d={curvePath} .../></svg>, not canvas or
//     a charting library. curvePath = useMemo(() => buildCurvePath(peq.bands,
//     peq.enabled), [peq.bands, peq.enabled]) — recomputes on ANY band field
//     change (gain/freq/Q/type) or the enabled toggle, since the whole bands
//     array is a single dependency.
//   - buildCurvePath only sums band contributions `enabled ? ... : 0` — if PEQ
//     itself is disabled, the curve is ALWAYS flat regardless of band values,
//     so every test here enables PEQ first.
//   - All 10 default bands start at gain=0. A 0dB peaking/lowshelf/highshelf
//     filter is the mathematical identity at every frequency, so changing a
//     band's freq/type while its OWN gain is still 0 produces no visible
//     change at all. The frequency- and type-change tests below therefore set
//     a non-zero baseline gain first, then change the other field — gain
//     itself doesn't need this since going from 0 to non-zero is inherently
//     the change being tested.
//   - d is non-empty even at the flat baseline (300 sample points still
//     produce real path syntax), so "renders on open" just checks for content,
//     not for a specific shape.

async function openPeqSettings(window: Page) {
  await window.click('[data-testid="settings-link"]');
  await window.click('[data-testid="settings-equalizer"]');
}

async function ensurePeqEnabled(window: Page) {
  const toggle = window.locator('[data-testid="peq-enable-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if (!(await toggle.isChecked())) await toggle.click();
}

test.describe('PEQ frequency response curve', () => {
  test.beforeEach(async ({ navidromeApp: { window } }) => {
    await openPeqSettings(window);
    await ensurePeqEnabled(window);
  });

  test('curve renders on opening the PEQ panel', async ({ navidromeApp: { window } }) => {
    const curve = window.locator('[data-testid="peq-frequency-response-curve"]');
    // Not .toBeVisible() — at the default all-zero-gain baseline the curve is
    // a perfectly flat horizontal line, whose geometric bounding box
    // (getBoundingClientRect()) has zero height. Playwright's visibility
    // check reports that as "hidden" even though the path has real, painted
    // stroke data. toHaveCount confirms it's attached; the content checks
    // below are the actual substance of this test.
    await expect(curve).toHaveCount(1);
    const d = await curve.getAttribute('d');
    expect(d).toBeTruthy();
    expect((d ?? '').length).toBeGreaterThan(20);
  });

  test('curve changes shape when a band gain is adjusted', async ({ navidromeApp: { window } }) => {
    const curve = window.locator('[data-testid="peq-frequency-response-curve"]');
    const before = await curve.getAttribute('d');

    await window.fill('[data-testid="peq-band-0-gain"] input', '10');
    await window.waitForTimeout(300);

    const after = await curve.getAttribute('d');
    expect(after).not.toBe(before);
  });

  test('curve changes shape when a band frequency is adjusted', async ({
    navidromeApp: { window },
  }) => {
    // Non-zero baseline gain first — otherwise a frequency change on a 0dB
    // peaking filter is a no-op for the curve (see comment above).
    await window.fill('[data-testid="peq-band-0-gain"] input', '8');
    await window.waitForTimeout(300);

    const curve = window.locator('[data-testid="peq-frequency-response-curve"]');
    const before = await curve.getAttribute('d');

    await window.fill('[data-testid="peq-band-0-freq"] input', '5000');
    await window.waitForTimeout(300);

    const after = await curve.getAttribute('d');
    expect(after).not.toBe(before);
  });

  test('curve changes shape when a band filter type is changed', async ({
    navidromeApp: { window },
  }) => {
    // Non-zero baseline gain first — a 0dB peaking and a 0dB lowshelf are
    // both the identity transform, so switching type would otherwise be
    // indistinguishable in the curve.
    await window.fill('[data-testid="peq-band-0-gain"] input', '8');
    await window.waitForTimeout(300);

    const curve = window.locator('[data-testid="peq-frequency-response-curve"]');
    const before = await curve.getAttribute('d');

    await window.selectOption('[data-testid="peq-band-0-type"]', 'lowshelf');
    await window.waitForTimeout(300);

    const after = await curve.getAttribute('d');
    expect(after).not.toBe(before);
  });
});
