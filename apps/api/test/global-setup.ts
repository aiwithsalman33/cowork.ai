import { execSync } from 'node:child_process';

/**
 * Applies migrations to the dedicated test database before any test file runs.
 * Non-destructive: tests create uniquely named users, so no reset is needed.
 */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://cowork:cowork@localhost:5433/cowork_test?schema=public';
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
