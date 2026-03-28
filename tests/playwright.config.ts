import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config cho CRM V4 E2E tests.
 * Base URL: http://localhost:3011 (Next.js)
 * API: http://localhost:3010/api/v1 (NestJS)
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // Chạy tests tuần tự trong mỗi file, song song giữa các file
  fullyParallel: false,
  workers: 1,

  // Retry 1 lần khi fail (CI environment)
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['html', { outputFolder: './test-results/html-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:3011',
    screenshot: 'on', // luôn chụp screenshot
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
