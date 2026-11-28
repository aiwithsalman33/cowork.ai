import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { afterAll, describe, expect, it } from 'vitest';
import { scrubEvent } from '../src/lib/sentry.js';
import { call, getApp, prisma, randomIp, signup, cookiesFrom } from './helpers.js';

describe('Sentry (H4)', () => {
  it('scrubs cookies, auth headers, bodies, query strings and personal fields', () => {
    const e = scrubEvent({
      type: undefined,
      request: {
        url: '/api/x',
        cookies: { pa_at: 'jwt' },
        data: { password: 'p' },
        query_string: 'code=SECRET',
        headers: { authorization: 'Bearer x', cookie: 'a=b', 'x-csrf-token': 't', 'user-agent': 'ua' },
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
    } as ErrorEvent);
    expect(e.request).toEqual({ url: '/api/x', headers: { 'user-agent': 'ua' } });
    expect(e.user).toEqual({ id: 'u1' });
  });

  const events: ErrorEvent[] = [];
  afterAll(() => Sentry.close());

  it('the admin test endpoint reports a 500 with its request id', async () => {
    Sentry.init({
      dsn: 'https://public@o1.ingest.sentry.io/1',
      beforeSend: (event) => {
        events.push(scrubEvent(event));
        return null; // never leaves the test
      },
    });
    const app = await getApp();
    const s = await signup();
    await prisma.user.update({ where: { id: s.userId }, data: { role: 'ADMIN' } });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: randomIp(),
      payload: { email: s.email, password: 'password123' },
    });
    const admin = { ...s, cookies: cookiesFrom(login), csrf: cookiesFrom(login).pa_csrf! };
    const res = await call(admin, 'POST', '/api/admin/debug/error');
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('Something went wrong'); // no internals to the client
    await Sentry.flush(2000);
    const ev = events.find((e) => e.exception?.values?.[0]?.value?.includes('Sentry test error'));
    expect(ev?.tags?.request_id).toBe(res.headers['x-request-id']);
    expect(ev?.user).toEqual({ id: s.userId });
  });
});
