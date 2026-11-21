import { describe, expect, it } from 'vitest';
import {
  call,
  cookiesFrom,
  getApp,
  lastEmailToken,
  prisma,
  randomIp,
  signup,
  testOutbox,
} from './helpers.js';

const uniq = () => `u${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.dev`;

async function rawSignup(email: string, password = 'password123') {
  const app = await getApp();
  return app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    remoteAddress: randomIp(),
    payload: { name: 'Fresh User', email, password },
  });
}

async function post(url: string, payload: object) {
  const app = await getApp();
  return app.inject({ method: 'POST', url, remoteAddress: randomIp(), payload });
}

describe('signup + email verification', () => {
  it('signup sends a verification email and creates no session', async () => {
    const email = uniq();
    const res = await rawSignup(email);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ needsVerification: true, email });
    expect(res.cookies.find((c) => c.name === 'pa_at')).toBeUndefined();

    const mail = testOutbox.find((m) => m.to === email);
    expect(mail?.subject).toMatch(/verify your email/i);
    expect(mail?.text).toContain('/verify-email?token=');

    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.trialEndsAt).toBeNull();
  });

  it('login is blocked until the email is verified', async () => {
    const email = uniq();
    await rawSignup(email);
    const res = await post('/api/auth/login', { email, password: 'password123' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('verifying starts the 24h trial, signs the user in, and the link works only once', async () => {
    const email = uniq();
    await rawSignup(email);
    const token = lastEmailToken(email);
    const res = await post('/api/auth/verify-email', { token });
    expect(res.statusCode).toBe(200);
    const byName = Object.fromEntries(res.cookies.map((c) => [c.name, c]));
    expect(byName.pa_at?.httpOnly).toBe(true);
    expect(byName.pa_rt?.httpOnly).toBe(true);
    expect(byName.pa_rt?.path).toBe('/api/auth');
    expect(byName.pa_csrf?.httpOnly).toBeFalsy();

    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.emailVerifiedAt).not.toBeNull();
    const hours = (u.trialEndsAt!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    expect(await prisma.userSkill.count({ where: { userId: u.id, enabled: true } })).toBeGreaterThan(0);

    expect((await post('/api/auth/verify-email', { token })).statusCode).toBe(400);
    expect((await post('/api/auth/login', { email, password: 'password123' })).statusCode).toBe(200);
  });

  it('resend-verification never reveals whether an email exists', async () => {
    const before = testOutbox.length;
    const res = await post('/api/auth/resend-verification', { email: uniq() });
    expect(res.statusCode).toBe(200);
    expect(testOutbox.length).toBe(before);

    const email = uniq();
    await rawSignup(email);
    const first = lastEmailToken(email);
    await post('/api/auth/resend-verification', { email });
    const second = lastEmailToken(email);
    expect(second).not.toBe(first);
    // the older link is invalidated
    expect((await post('/api/auth/verify-email', { token: first })).statusCode).toBe(400);
  });

  it('password reset works with the emailed link', async () => {
    const s = await signup();
    await post('/api/auth/forgot-password', { email: s.email });
    const token = lastEmailToken(s.email);
    expect((await post('/api/auth/reset-password', { token, password: 'brand-new-pass' })).statusCode).toBe(
      200,
    );
    expect((await post('/api/auth/login', { email: s.email, password: 'brand-new-pass' })).statusCode).toBe(
      200,
    );
  });
});

describe('auth', () => {
  it('a verified user gets a working session', async () => {
    const s = await signup();
    const me = await call(s, 'GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: s.email, plan: 'TRIAL', planActive: true, role: 'USER' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(user.passwordHash).not.toContain('password123');
  });

  it('rejects duplicate signup of a verified account and bad passwords', async () => {
    const s = await signup();
    expect((await rawSignup(s.email)).statusCode).toBe(409);
    expect((await post('/api/auth/login', { email: s.email, password: 'nope-nope' })).statusCode).toBe(401);
  });

  it('validates input with zod', async () => {
    expect((await post('/api/auth/signup', { email: 'not-an-email', password: 'x' })).statusCode).toBe(400);
  });

  it('requires a CSRF token for cookie-authenticated mutations', async () => {
    const app = await getApp();
    const s = await signup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      cookies: s.cookies,
      payload: { currentPassword: 'password123', newPassword: 'password456' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const app = await getApp();
    const s = await signup();
    const refresh = (cookies: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies,
        headers: { 'x-csrf-token': cookies.pa_csrf! },
      });
    const first = await refresh(s.cookies);
    expect(first.statusCode).toBe(200);
    const rotated = cookiesFrom(first, s.cookies);
    expect(rotated.pa_rt).not.toBe(s.cookies.pa_rt);
    expect((await refresh(s.cookies)).statusCode).toBe(401);
    expect((await refresh(rotated)).statusCode).toBe(401);
  });

  it('blocks suspended users', async () => {
    const s = await signup();
    await prisma.user.update({ where: { id: s.userId }, data: { status: 'SUSPENDED' } });
    expect((await call(s, 'GET', '/api/auth/me')).statusCode).toBe(403);
  });

  it('rejects unauthenticated requests', async () => {
    const app = await getApp();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
  });
});
