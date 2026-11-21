import { describe, expect, it } from 'vitest';
import { call, cookiesFrom, getApp, prisma, signup } from './helpers.js';

describe('auth', () => {
  it('signup starts a 24h trial, sets httpOnly cookies and enables default skills', async () => {
    const s = await signup();
    expect(s.cookies.pa_at).toBeTruthy();
    expect(s.cookies.pa_rt).toBeTruthy();
    expect(s.csrf).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    const hours = (user.trialEndsAt!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    expect(user.plan).toBe('TRIAL');
    expect(user.passwordHash).not.toContain('password123');

    const skills = await prisma.userSkill.count({ where: { userId: s.userId, enabled: true } });
    expect(skills).toBeGreaterThan(0);

    const me = await call(s, 'GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: s.email, plan: 'TRIAL', planActive: true, role: 'USER' });
  });

  it('marks session cookies httpOnly (except the CSRF cookie)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { name: 'Cookie Test', email: `cookie${Date.now()}@test.dev`, password: 'password123' },
    });
    const byName = Object.fromEntries(res.cookies.map((c) => [c.name, c]));
    expect(byName.pa_at?.httpOnly).toBe(true);
    expect(byName.pa_rt?.httpOnly).toBe(true);
    expect(byName.pa_rt?.path).toBe('/api/auth');
    expect(byName.pa_csrf?.httpOnly).toBeFalsy();
  });

  it('rejects duplicate signup and bad passwords', async () => {
    const app = await getApp();
    const s = await signup();
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { name: 'Dup', email: s.email, password: 'password123' },
    });
    expect(dup.statusCode).toBe(409);

    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: s.email, password: 'nope-nope' } });
    expect(bad.statusCode).toBe(401);

    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: s.email, password: 'password123' } });
    expect(ok.statusCode).toBe(200);
  });

  it('validates input with zod', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'not-an-email', password: 'x' } });
    expect(res.statusCode).toBe(400);
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
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: s.cookies,
      headers: { 'x-csrf-token': s.csrf },
    });
    expect(first.statusCode).toBe(200);
    const rotated = cookiesFrom(first, s.cookies);
    expect(rotated.pa_rt).not.toBe(s.cookies.pa_rt);

    // replaying the old refresh token revokes the whole family
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: s.cookies,
      headers: { 'x-csrf-token': s.csrf },
    });
    expect(replay.statusCode).toBe(401);
    const afterTheft = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: rotated,
      headers: { 'x-csrf-token': rotated.pa_csrf! },
    });
    expect(afterTheft.statusCode).toBe(401);
  });

  it('blocks suspended users', async () => {
    const s = await signup();
    await prisma.user.update({ where: { id: s.userId }, data: { status: 'SUSPENDED' } });
    const me = await call(s, 'GET', '/api/auth/me');
    expect(me.statusCode).toBe(403);
  });

  it('rejects unauthenticated requests', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});
