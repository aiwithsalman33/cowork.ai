import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against a running stack (default: `docker compose up` on localhost:3000).
 * Override with E2E_BASE_URL. Admin tests use ADMIN_EMAIL / ADMIN_PASSWORD from the environment.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@smoke/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    // CI smoke test (npm run test:smoke -w @cowork/web) at phone and laptop sizes
    {
      name: 'smoke-phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
      grep: /@smoke/,
    },
    {
      name: 'smoke-laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      grep: /@smoke/,
    },
  ],
});
