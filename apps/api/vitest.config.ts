import { defineConfig } from 'vitest/config';

const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgresql://cowork:cowork@localhost:5433/cowork_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // entry points and the CLI prompt exporter are exercised by e2e/manual runs, not unit tests
      exclude: ['src/index.ts', 'src/llm/prompts/export.ts', 'src/db/seed.ts'],
      reporter: ['text-summary', 'json-summary'],
      // floor just under the measured coverage (2026-11-28: lines 66.4, functions 64.6, branches 53.8);
      // raise it as tests are added — the audit target is 70 / 70 / 60
      thresholds: { lines: 66, functions: 64, branches: 53 },
    },
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
      ENCRYPTION_KEY: '0'.repeat(63) + '1',
      WEB_ORIGIN: 'http://localhost:3000',
      PUBLIC_API_URL: 'http://localhost:4000',
      BILLING_ENABLED: 'true',
      CASHFREE_APP_ID: 'cf-app-test',
      CASHFREE_SECRET_KEY: 'cf-secret-test',
      QUEUE_ENABLED: 'false',
      WORKERS_ENABLED: 'false',
      BAILEYS_ENABLED: 'false',
      RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
    },
  },
});
