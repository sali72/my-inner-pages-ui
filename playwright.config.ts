import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  workers: 1,

  use: {
    baseURL: 'http://localhost:5173',
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
