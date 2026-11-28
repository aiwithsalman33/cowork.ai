import { expect, test } from '@playwright/test';

/**
 * Smoke test (audit M14 / L10): runs in CI against `docker compose up`, at phone (375×812) and
 * laptop (1280×800) sizes. Only public sign-up and sign-in; no admin account or AI key needed.
 */
test('login page renders @smoke', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  // no sideways scrolling on small screens
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});

test('sign up, sign in and see the usage meter on the dashboard @smoke', async ({ page }) => {
  const email = `smoke_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.dev`;
  const password = 'smoke-pass-123';
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Smoke Tester');
  await page.getByLabel('Business name').fill('Smoke Bakery');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // generous waits for slow CI machines
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByLabel('Email')).toHaveValue(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByText('AI replies this month')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});
