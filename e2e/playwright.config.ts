import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: path.join(__dirname, 'tests'),
  timeout: 180_000, // 3 minutes per test
  globalTimeout: 14_400_000, // 4 hours for the whole suite
  retries: 0,
  workers: 1, // Electron app runs one at a time
  reporter: [
    ['html', { outputFolder: path.join(__dirname, 'playwright-report'), open: 'never' }],
    ['list'],
  ],
  use: {
    // 'on-first-retry' never fires with retries: 0 above -- this suite would
    // never capture a trace on any failure. 'retain-on-failure' matches the
    // screenshot/video settings below: free on passing runs, keeps a full
    // trace (network timeline, console, step-by-step snapshots) on any test
    // that actually fails.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
