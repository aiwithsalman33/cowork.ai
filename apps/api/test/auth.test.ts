import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { call, cookiesFrom, getApp, lastEmailToken, prisma, randomIp, signup } from './helpers.js';

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

describe('signup', () => {
  it('signup creates a ready account with a 7-day trial, then the user signs in', async () => {
    const app = await getApp();
    const email = uniq();
    const res = await rawSignup(email);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ created: true, email });
    expect(res.cookies.find((c) => c.name === 'pa_at')).toBeUndefined();

    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(u.approvedAt).not.toBeNull();
    expect(u.plan).toBe('TRIAL');
    const hours = (u.trialEndsAt!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(7 * 24 - 0.1);
    expect(hours).toBeLessThanOrEqual(7 * 24);
    expect(await prisma.userSkill.count({ where: { userId: u.id, enabled: true } })).toBeGreaterThan(0);

    const login = await post('/api/auth/login', { email, password: 'password123' });
    expect(login.statusCode).toBe(200);
    expect(login.json().user).toMatchObject({ approved: true, planActive: true, plan: 'TRIAL' });
    const byName = Object.fromEntries(login.cookies.map((c) => [c.name, c]));
    expect(byName.pa_at?.httpOnly).toBe(true);
    expect(byName.pa_rt?.httpOnly).toBe(true);
    expect(byName.pa_rt?.path).toBe('/api/auth');
    expect(byName.pa_csrf?.httpOnly).toBeFalsy();
    const dash = await app.inject({ method: 'GET', url: '/api/dashboard', cookies: cookiesFrom(login) });
    expect(dash.statusCode).toBe(200);
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

describe('input caps (L9)', () => {
  it('rejects oversized emails and passwords before doing any work', async () => {
    const long = `${'a'.repeat(250)}@test.dev`;
    expect((await post('/api/auth/login', { email: long, password: 'x' })).statusCode).toBe(400);
    expect((await post('/api/auth/forgot-password', { email: long })).statusCode).toBe(400);
    const s = await signup();
    const res = await call(s, 'POST', '/api/auth/password', {
      currentPassword: 'p'.repeat(201),
      newPassword: 'new-password-123',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('login rate limit (L4)', () => {
  it('the 6th login attempt in a minute from one address is refused', async () => {
    const app = await getApp();
    const ip = randomIp();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: ip,
        payload: { email: 'nobody@test.dev', password: 'wrong-password' },
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('a refused attempt tells the client when to retry (M14)', async () => {
    const app = await getApp();
    const ip = randomIp();
    let last;
    for (let i = 0; i < 6; i++)
      last = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: ip,
        payload: { email: 'nobody@test.dev', password: 'wrong-password' },
      });
    expect(last!.statusCode).toBe(429);
    expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('expired sessions (M14)', () => {
  it('an expired access token is rejected with 401', async () => {
    const s = await signup();
    const expired = await new SignJWT({ role: 'USER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(s.userId)
      .setIssuer('cowork-ai')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.statusCode).toBe(401);
    const fresh = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: s.cookies,
    });
    expect(fresh.statusCode).toBe(200);
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
