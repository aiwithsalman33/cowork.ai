import { expect, request as pwRequest, test, type Page } from '@playwright/test';

const password = 'password123!';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** E2E can't open the inbox, so an admin marks the new account verified through the admin API. */
async function adminVerify(email: string) {
  const ctx = await pwRequest.newContext({ baseURL: BASE });
  const login = await ctx.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const csrf = (await ctx.storageState()).cookies.find((c) => c.name === 'pa_csrf')!.value;
  const users = await (await ctx.get(`/api/admin/users?q=${encodeURIComponent(email)}`)).json();
  const res = await ctx.patch(`/api/admin/users/${users.items[0].id}`, {
    data: { verifyEmail: true, approve: true },
    headers: { 'x-csrf-token': csrf },
  });
  expect(res.ok()).toBeTruthy();
  await ctx.dispose();
}

async function signup(page: Page) {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'ADMIN_EMAIL / ADMIN_PASSWORD needed to verify test accounts');
  const email = `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.dev`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('E2E Tester');
  await page.getByLabel('Business name').fill('E2E Bakery');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  // before verification, login is refused with a resend option
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Please verify your email first')).toBeVisible();

  await adminVerify(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

test('landing page shows hero, pricing and contact details @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your Next Co-Worker/i })).toBeVisible();
  await expect(page.getByText('₹999').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /aiwithsalman33@gmail.com/ }).first()).toBeVisible();
  await expect(page.getByText('+91 81480 35472').first()).toBeVisible();
});

test('contact form opens WhatsApp with the enquiry for 8148035472', async ({ page, context }) => {
  await page.goto('/#contact');
  await page.getByLabel('Your name').fill('E2E Visitor');
  await page.getByLabel('Phone / WhatsApp').fill('9876543210');
  await page.getByLabel('How can we help?').fill('Need a WhatsApp bot for my shop');
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Send on WhatsApp' }).click();
  const wa = await popup;
  expect(decodeURIComponent(wa.url())).toMatch(/(wa\.me\/918148035472|phone=918148035472)/);
  await expect(page.getByText('we got your message')).toBeVisible();
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

test('integrations page guides Google Cloud setup with the exact redirect URI', async ({ page }) => {
  await signup(page);
  await page.goto('/integrations');
  await expect(page.getByRole('heading', { name: 'Your Google Cloud credentials' })).toBeVisible();
  await page.getByText('How to create your Google Cloud credentials').click();
  await expect(page.getByText(/\/api\/integrations\/google\/callback/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Google account' })).toBeDisabled();
});

test('Google Sheets tab asks to connect Google first', async ({ page }) => {
  await signup(page);
  await page.goto('/agent?tab=sheets');
  await expect(page.getByText('Connect Google Sheets first')).toBeVisible();
});

test('clicking the link in the verification email activates the account (needs MAILPIT_URL)', async ({
  page,
}) => {
  const mailpit = process.env.MAILPIT_URL;
  test.skip(!mailpit, 'MAILPIT_URL not set');
  const email = `e2e_mail_${Date.now()}@test.dev`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Mail Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  let link: string | undefined;
  for (let i = 0; i < 20 && !link; i++) {
    const list = await (
      await page.request.get(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await page.request.get(`${mailpit}/api/v1/message/${id}`)).json();
      link = String(msg.Text).match(/https?:\/\/\S+\/verify-email\?token=\S+/)?.[0];
    }
    if (!link) await page.waitForTimeout(500);
  }
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page.getByText('Email verified!')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /on the list/ })).toBeVisible(); // waits for admin approval
});
