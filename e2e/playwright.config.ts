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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
