import { expect, test, type Page } from '@playwright/test';

const password = 'password123!';

async function signup(page: Page) {
  const email = `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.dev`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('E2E Tester');
  await page.getByLabel('Business name').fill('E2E Bakery');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Start free trial' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

test('landing page shows pricing @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /answers your customers/i })).toBeVisible();
  await expect(page.getByText('₹999')).toBeVisible();
});

test('protected pages redirect to login when signed out', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test('signup → dashboard with trial banner and getting-started checklist @mobile', async ({ page }) => {
  await signup(page);
  await expect(page.getByText(/Free trial · \d+h \d+m left/)).toBeVisible();
  await expect(page.getByText('Your impact')).toBeVisible();
  await expect(page.getByText('Getting started')).toBeVisible();
  await expect(page.getByRole('link', { name: /Add your AI key/ })).toBeVisible();
});

test('knowledge base autosaves', async ({ page }) => {
  await signup(page);
  await page.goto('/knowledge');
  const box = page.getByLabel('Business details');
  await box.fill('Open 9am–9pm every day. Free delivery within 3 km.');
  await expect(page.getByText(/Saved · /)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByLabel('Business details')).toHaveValue(/Free delivery within 3 km/);
});

test('personality save marks the checklist step done', async ({ page }) => {
  await signup(page);
  await page.goto('/agent?tab=personality');
  await page.getByLabel('Agent name').fill('Meera');
  await page.getByRole('button', { name: 'professional' }).click();
  await page.getByRole('button', { name: 'Save personality' }).click();
  await expect(page.getByText('Personality saved')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByText('1/4 done')).toBeVisible();
});

test('skills can be searched and toggled', async ({ page }) => {
  await signup(page);
  await page.goto('/agent?tab=skills');
  await page.getByPlaceholder('Search skills…').fill('Complaint');
  const toggle = page.getByRole('switch', { name: 'Toggle Complaint Handler' });
  await expect(toggle).toHaveAttribute('data-state', 'unchecked');
  await toggle.click();
  await expect(toggle).toHaveAttribute('data-state', 'checked');
});

test('WhatsApp QR option shows the ban warning and recommends the Business API', async ({ page }) => {
  await signup(page);
  await page.goto('/agent?tab=channels');
  await expect(page.getByText('Recommended', { exact: true })).toBeVisible();
  await expect(page.getByText(/can be temporarily or permanently banned/i)).toBeVisible();
});

test('API keys are saved encrypted and only the last 4 characters are shown', async ({ page }) => {
  await signup(page);
  await page.goto('/agent?tab=keys');
  await page.getByRole('button', { name: 'Groq' }).click();
  await page.getByPlaceholder(/gsk_/).fill('gsk_e2eTestKey0000WXYZ');
  await page.getByRole('button', { name: /Save & use this model/ }).click();
  await expect(page.getByText('••••WXYZ', { exact: false })).toBeVisible();
  await expect(page.getByText('gsk_e2eTestKey0000WXYZ')).toHaveCount(0);
});

test('admin can open the panel and find a user', async ({ page, browser }) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  test.skip(!adminEmail || !adminPassword, 'ADMIN_EMAIL / ADMIN_PASSWORD not set');
  const email = await signup(page);

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await admin.goto('/login');
  await admin.getByLabel('Email').fill(adminEmail!);
  await admin.getByLabel('Password').fill(adminPassword!);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await expect(admin).toHaveURL(/\/admin/);
  await expect(admin.getByText('Platform overview')).toBeVisible();
  await admin.goto('/admin/users');
  await admin.getByPlaceholder('Search name or email').fill(email);
  await expect(admin.getByText(email)).toBeVisible();
  await ctx.close();
});
