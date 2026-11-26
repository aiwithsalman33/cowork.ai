import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PLANS, planToJSON } from '@cowork/shared';
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

describe('admin plan editing', () => {
  it('admins edit a plan; prices, limits and the pricing page follow; reset restores defaults', async () => {
    const app = await getApp();
    const admin = await adminSession();
    const s = await signup();
    const body = {
      ...planToJSON(PLANS.TRIAL),
      name: 'Try it free',
      durationDays: 14,
      features: ['Everything'],
      limits: { ...planToJSON(PLANS.TRIAL).limits, channels: 0 },
    };
    expect((await call(s, 'PUT', '/api/admin/plans/TRIAL', body)).statusCode).toBe(403);
    expect((await call(admin, 'PUT', '/api/admin/plans/TRIAL', { ...body, priceInr: 99 })).statusCode).toBe(
      400,
    );
    expect((await call(admin, 'PUT', '/api/admin/plans/TRIAL', body)).statusCode).toBe(200);

    const pub = await app.inject({ method: 'GET', url: '/api/public/plans' });
    expect(pub.json().plans[0]).toMatchObject({ id: 'TRIAL', name: 'Try it free', durationDays: 14 });
    // the new channel limit applies right away
    const tg = await call(s, 'POST', '/api/channels/telegram', {
      botToken: '123456789:AAH' + 'x'.repeat(32),
    });
    expect(tg.statusCode).toBe(402);
    expect(tg.json().error).toMatch(/Try it free/);

    const reset = await call(admin, 'DELETE', '/api/admin/plans/TRIAL');
    expect(reset.json().plan).toMatchObject({
      name: PLANS.TRIAL.name,
      durationDays: PLANS.TRIAL.durationDays,
    });
  });
});

describe('Cashfree payments', () => {
  it('creates an order, applies the paid webhook once, and extends the plan', async () => {
    const app = await getApp();
    const s = await signup();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const json = url.endsWith('/pg/orders')
        ? { order_id: 'x', order_status: 'ACTIVE', order_amount: 499, payment_session_id: 'session_123' }
        : { order_status: 'ACTIVE', order_amount: 499 };
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    try {
      expect(
        (await call(s, 'POST', '/api/billing/checkout', { plan: 'STARTER', phone: '12345' })).statusCode,
      ).toBe(400);
      const res = await call(s, 'POST', '/api/billing/checkout', {
        plan: 'STARTER',
        phone: '+91 98765 43210',
      });
      expect(res.statusCode).toBe(200);
      const { orderId, paymentSessionId } = res.json();
      expect(paymentSessionId).toBe('session_123');
      expect(calls[0]!.body).toMatchObject({
        order_id: orderId,
        order_amount: PLANS.STARTER.priceInr,
        customer_details: { customer_phone: '9876543210' },
      });
      // returning before the bank confirms: still unpaid, no access change
      expect((await call(s, 'GET', `/api/billing/orders/${orderId}`)).json().payment.status).toBe('CREATED');

      const send = (body: object, secret = 'cf-secret-test') => {
        const raw = JSON.stringify(body);
        const ts = String(Math.floor(Date.now() / 1000));
        const sig = createHmac('sha256', secret)
          .update(ts + raw)
          .digest('base64');
        return app.inject({
          method: 'POST',
          url: '/webhooks/cashfree',
          headers: {
            'content-type': 'application/json',
            'x-webhook-signature': sig,
            'x-webhook-timestamp': ts,
          },
          payload: raw,
        });
      };
      const paid = (amount: number) => ({
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: {
          order: { order_id: orderId, order_amount: amount },
          payment: { cf_payment_id: 555, payment_status: 'SUCCESS', payment_amount: amount },
        },
      });
      expect((await send(paid(PLANS.STARTER.priceInr), 'wrong')).statusCode).toBe(400);
      expect((await send(paid(PLANS.STARTER.priceInr))).json().result).toBe('processed');
      expect((await send(paid(PLANS.STARTER.priceInr))).json().result).toBe('duplicate');
      const u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
      expect(u.plan).toBe('STARTER');
      expect(isPlanActive(u)).toBe(true);
      const days = (u.currentPeriodEnd!.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
      const bill = await call(s, 'GET', '/api/billing');
      expect(bill.json().payments[0]).toMatchObject({ orderId, status: 'PAID' });

      // a second Starter payment adds 30 days on top
      const again = (
        await call(s, 'POST', '/api/billing/checkout', { plan: 'STARTER', phone: '9876543210' })
      ).json();
      await send({
        ...paid(PLANS.STARTER.priceInr),
        data: { ...paid(PLANS.STARTER.priceInr).data, order: { order_id: again.orderId } },
      });
      const u2 = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
      expect((u2.currentPeriodEnd!.getTime() - Date.now()) / 86_400_000).toBeGreaterThan(59.9);

      // a wrong amount never activates anything
      const third = (
        await call(s, 'POST', '/api/billing/checkout', { plan: 'GROWTH', phone: '9876543210' })
      ).json();
      const bad = await send({ ...paid(1), data: { ...paid(1).data, order: { order_id: third.orderId } } });
      expect(bad.json().result).toBe('amount_mismatch');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: s.userId } })).plan).toBe('STARTER');
    } finally {
      spy.mockRestore();
    }
  });
});
