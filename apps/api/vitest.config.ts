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
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
      ENCRYPTION_KEY: '0'.repeat(63) + '1',
      WEB_ORIGIN: 'http://localhost:3000',
      PUBLIC_API_URL: 'http://localhost:4000',
      QUEUE_ENABLED: 'false',
      WORKERS_ENABLED: 'false',
      BAILEYS_ENABLED: 'false',
      RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
    },
  },
});
