import { describe, expect, it } from 'vitest';
import { PLANS } from '@cowork/shared';
import { hmacSha256Hex } from '../src/lib/crypto.js';
import { isPlanActive } from '../src/services/plan.js';
import { call, cookiesFrom, getApp, prisma, signup, testOutbox } from './helpers.js';

const SECRET = 'rzp_test_webhook_secret';

async function sendRazorpay(
  event: string,
  sub: Record<string, unknown>,
  eventId: string,
  signature?: string,
) {
  const app = await getApp();
  const body = JSON.stringify({ event, payload: { subscription: { entity: sub } } });
  return app.inject({
    method: 'POST',
    url: '/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': signature ?? hmacSha256Hex(SECRET, body),
      'x-razorpay-event-id': eventId,
    },
    payload: body,
  });
}

describe('plan state', () => {
  const base = { status: 'ACTIVE' as const, subscriptionStatus: null, currentPeriodEnd: null };
  it('trial is active only until trialEndsAt', () => {
    expect(isPlanActive({ ...base, plan: 'TRIAL', trialEndsAt: new Date(Date.now() + 1000) })).toBe(true);
    expect(isPlanActive({ ...base, plan: 'TRIAL', trialEndsAt: new Date(Date.now() - 1000) })).toBe(false);
  });
  it('suspended users are never active', () => {
    expect(
      isPlanActive({
        ...base,
        status: 'SUSPENDED',
        plan: 'GROWTH',
        trialEndsAt: null,
        currentPeriodEnd: new Date(Date.now() + 1e9),
      }),
    ).toBe(false);
  });
  it('a cancelled paid plan keeps access until the period ends', () => {
    expect(
      isPlanActive({
        ...base,
        plan: 'STARTER',
        trialEndsAt: null,
        subscriptionStatus: 'cancelled',
        currentPeriodEnd: new Date(Date.now() + 1e6),
      }),
    ).toBe(true);
    expect(
      isPlanActive({
        ...base,
        plan: 'STARTER',
        trialEndsAt: null,
        subscriptionStatus: 'cancelled',
        currentPeriodEnd: new Date(Date.now() - 1e6),
      }),
    ).toBe(false);
  });
});

describe('Razorpay webhooks', () => {
  it('rejects an invalid signature', async () => {
    const res = await sendRazorpay(
      'subscription.activated',
      { id: 'sub_x', status: 'active' },
      'evt_bad',
      'nope',
    );
    expect(res.statusCode).toBe(400);
  });

  it('activates the plan, is idempotent, and halts access after failed payments', async () => {
    const s = await signup();
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    const sub = {
      id: `sub_${s.userId}`,
      status: 'active',
      current_end: periodEnd,
      notes: { userId: s.userId, plan: 'STARTER' },
    };

    const first = await sendRazorpay('subscription.activated', sub, `evt_a_${s.userId}`);
    expect(first.json().result).toBe('processed');
    let u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(u).toMatchObject({
      plan: 'STARTER',
      subscriptionStatus: 'active',
      razorpaySubscriptionId: sub.id,
    });
    expect(isPlanActive(u)).toBe(true);

    const dup = await sendRazorpay('subscription.activated', sub, `evt_a_${s.userId}`);
    expect(dup.json().result).toBe('duplicate');

    await sendRazorpay('subscription.halted', { ...sub, status: 'halted' }, `evt_h_${s.userId}`);
    u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(u.subscriptionStatus).toBe('halted');
    expect(isPlanActive(u)).toBe(false);
  });

  it('billing summary reports plan usage', async () => {
    const s = await signup();
    const res = await call(s, 'GET', '/api/billing');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      plan: 'TRIAL',
      planActive: true,
      usage: { messages: { used: 0, limit: PLANS.TRIAL.limits.messagesPerMonth } },
    });
  });
});

async function adminSession() {
  const app = await getApp();
  const s = await signup();
  await prisma.user.update({ where: { id: s.userId }, data: { role: 'ADMIN' } });
  // re-login so the access token carries the ADMIN role
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: s.email, password: 'password123' },
    remoteAddress: '10.9.9.9',
  });
  const cookies = cookiesFrom(res);
  return { ...s, cookies, csrf: cookies.pa_csrf! };
}

describe('admin panel', () => {
  it('is forbidden for normal users', async () => {
    const s = await signup();
    expect((await call(s, 'GET', '/api/admin/overview')).statusCode).toBe(403);
    expect((await call(s, 'GET', '/api/admin/users')).statusCode).toBe(403);
  });

  it('shows the overview and searches users', async () => {
    const admin = await adminSession();
    const target = await signup({ name: 'Searchable Person' });
    const ov = await call(admin, 'GET', '/api/admin/overview');
    expect(ov.statusCode).toBe(200);
    expect(ov.json().series).toHaveLength(30);
    const list = await call(admin, 'GET', `/api/admin/users?q=${encodeURIComponent(target.email)}`);
    expect(list.json().items.map((u: { id: string }) => u.id)).toEqual([target.userId]);
  });

  it('changes plan, extends trial, suspends — and writes the audit log', async () => {
    const admin = await adminSession();
    const target = await signup();
    expect(
      (await call(admin, 'PATCH', `/api/admin/users/${target.userId}`, { plan: 'GROWTH' })).statusCode,
    ).toBe(200);
    let u = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(u.plan).toBe('GROWTH');
    expect(isPlanActive(u)).toBe(true);

    await call(admin, 'PATCH', `/api/admin/users/${target.userId}`, { extendTrialHours: 48 });
    u = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(u.plan).toBe('TRIAL');
    expect(u.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000);

    await call(admin, 'PATCH', `/api/admin/users/${target.userId}`, { status: 'SUSPENDED' });
    expect((await call(target, 'GET', '/api/auth/me')).statusCode).toBe(403);

    const audit = await prisma.auditLog.findMany({
      where: { actorId: admin.userId, targetId: target.userId },
    });
    expect(audit.length).toBe(3);
    expect(audit.every((a) => a.action === 'user.update')).toBe(true);
  });

  it('impersonates a user and can exit back to the admin session', async () => {
    const app = await getApp();
    const admin = await adminSession();
    const target = await signup();
    const imp = await call(admin, 'POST', `/api/admin/users/${target.userId}/impersonate`);
    expect(imp.statusCode).toBe(200);
    expect(imp.json().user).toMatchObject({ id: target.userId, impersonatedBy: { id: admin.userId } });
    const jar = cookiesFrom(imp, admin.cookies);
    const asUser = { ...admin, cookies: jar, csrf: jar.pa_csrf! };

    const me = await call(asUser, 'GET', '/api/auth/me');
    expect(me.json().user.id).toBe(target.userId);
    // impersonated session cannot reach the admin panel
    expect((await call(asUser, 'GET', '/api/admin/overview')).statusCode).toBe(403);

    const exit = await app.inject({
      method: 'POST',
      url: '/api/auth/impersonation/exit',
      cookies: jar,
      headers: { 'x-csrf-token': jar.pa_csrf! },
    });
    expect(exit.json().user.id).toBe(admin.userId);
    expect(
      await prisma.auditLog.count({ where: { actorId: admin.userId, action: 'user.impersonate' } }),
    ).toBe(1);
  });

  it('manages the global skill library and feature flags', async () => {
    const admin = await adminSession();
    const slug = `admin-skill-${Date.now()}`;
    const created = await call(admin, 'POST', '/api/admin/skills', {
      slug,
      name: 'Festival Offers',
      description: 'Shares festival offers with customers.',
      category: 'Sales & Marketing',
      promptFragment: 'Mention the current festival offer from the knowledge base when relevant.',
      isPublic: false,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().skill.id;
    const published = await call(admin, 'PUT', `/api/admin/skills/${id}`, {
      ...created.json().skill,
      tools: [],
      isPublic: true,
    });
    expect(published.json().skill.isPublic).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'skill.publish', targetId: id } })).toBe(1);

    const flag = await call(admin, 'PUT', '/api/admin/flags/beta_widget', {
      description: 'test',
      enabled: true,
      plans: ['GROWTH'],
    });
    expect(flag.json().flag).toMatchObject({ key: 'beta_widget', enabled: true, plans: ['GROWTH'] });
  });
});

describe('admin approval (payments on hold)', () => {
  it('lists pending accounts and approving starts the trial + emails the user', async () => {
    const app = await getApp();
    const admin = await adminSession();
    const email = `pending_${Date.now()}@test.dev`;
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      remoteAddress: '10.77.1.1',
      payload: { name: 'Pending Person', email, password: 'password123' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.77.1.2',
      payload: { email, password: 'password123' },
    });
    const userCookies = cookiesFrom(login);
    // signup auto-starts the trial; simulate an account the admin put back on hold
    await prisma.user.update({ where: { email }, data: { approvedAt: null, trialEndsAt: null } });
    // admin was notified (ADMIN_EMAIL is not set in tests, so only check the user flow)
    const pending = await call(admin, 'GET', '/api/admin/users?status=PENDING&pageSize=100');
    const row = pending.json().items.find((u: { email: string }) => u.email === email);
    expect(row).toMatchObject({ approved: false, emailVerified: true });

    expect(
      (await app.inject({ method: 'GET', url: '/api/dashboard', cookies: userCookies })).statusCode,
    ).toBe(403);

    const res = await call(admin, 'PATCH', `/api/admin/users/${row.id}`, { approve: true });
    expect(res.statusCode).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.approvedAt).not.toBeNull();
    expect((u.trialEndsAt!.getTime() - Date.now()) / 3_600_000).toBeGreaterThan(7 * 24 - 0.1);
    expect(testOutbox.some((m) => m.to === email && /approved/i.test(m.subject))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'user.approve', targetId: row.id } })).toBe(1);

    expect(
      (await app.inject({ method: 'GET', url: '/api/dashboard', cookies: userCookies })).statusCode,
    ).toBe(200);
  });

  it('an unapproved tenant’s agent never replies', async () => {
    expect(
      isPlanActive({
        status: 'ACTIVE',
        plan: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 1e7),
        subscriptionStatus: null,
        currentPeriodEnd: null,
        approvedAt: null,
      }),
    ).toBe(false);
  });
});
