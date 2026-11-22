import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import { testOutbox } from '../src/lib/mailer.js';

let appPromise: Promise<FastifyInstance> | null = null;

export async function getApp(): Promise<FastifyInstance> {
  appPromise ??= (async () => {
    await seed();
    const app = await buildApp();
    await app.ready();
    return app;
  })();
  return appPromise;
}

export interface Session {
  cookies: Record<string, string>;
  csrf: string;
  userId: string;
  email: string;
}

export function cookiesFrom(res: LightMyRequestResponse, prev: Record<string, string> = {}) {
  const jar = { ...prev };
  for (const c of res.cookies) {
    if (c.value === '' || (c.maxAge !== undefined && c.maxAge <= 0)) delete jar[c.name];
    else jar[c.name] = c.value;
  }
  return jar;
}

let counter = 0;
export async function signup(
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<Session> {
  const app = await getApp();
  const email = overrides.email ?? `user${Date.now()}_${counter++}@test.dev`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    remoteAddress: `10.${counter % 250}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    payload: { name: overrides.name ?? 'Test User', email, password: overrides.password ?? 'password123' },
  });
  if (res.statusCode !== 201) throw new Error(`signup failed ${res.statusCode}: ${res.body}`);
  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-email',
    remoteAddress: randomIp(),
    payload: { token: lastEmailToken(email) },
  });
  if (verified.statusCode !== 200) throw new Error(`verify failed ${verified.statusCode}: ${verified.body}`);
  await approve(email);
  const cookies = cookiesFrom(verified);
  return { cookies, csrf: cookies.pa_csrf!, userId: verified.json().user.id, email };
}

/** What an admin's "Approve" does: grant access and start the 24h trial. */
export async function approve(email: string) {
  await prisma.user.update({
    where: { email },
    data: { approvedAt: new Date(), trialEndsAt: new Date(Date.now() + 24 * 3600_000) },
  });
}

export function randomIp() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
}

/** Extracts the token from the most recent verification/reset email sent to `email` (test outbox). */
export function lastEmailToken(email: string): string {
  const mail = [...testOutbox].reverse().find((m) => m.to === email);
  const token = mail?.text.match(/token=([^\s&]+)/)?.[1];
  if (!token) throw new Error(`no email with token found for ${email}`);
  return decodeURIComponent(token);
}

export { testOutbox };

/** Authenticated request helper (cookie session + CSRF header, exactly like the web app). */
export async function call(
  s: Session,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) {
  const app = await getApp();
  return app.inject({
    method,
    url,
    cookies: s.cookies,
    headers: { 'x-csrf-token': s.csrf },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

export { prisma };
