import { describe, expect, it } from 'vitest';
import { reqSerializer } from '../src/lib/logger.js';
import { call, getApp, signup } from './helpers.js';

describe('request ids and log hygiene (M6, L3)', () => {
  it('every response carries a request id; a sane incoming id is kept', async () => {
    const app = await getApp();
    const fresh = await app.inject({ method: 'GET', url: '/health' });
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'edge-abc.123' },
    });
    expect(kept.headers['x-request-id']).toBe('edge-abc.123');
    const junk = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': `${'x'.repeat(80)}<script>` },
    });
    expect(junk.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const s = await signup();
    expect((await call(s, 'GET', '/api/auth/me')).headers['x-request-id']).toBeTruthy();
  });

  it('API responses are never cached, except the public plan list (L7)', async () => {
    const app = await getApp();
    const s = await signup();
    expect((await call(s, 'GET', '/api/auth/me')).headers['cache-control']).toBe('private, no-store');
    expect((await app.inject({ method: 'GET', url: '/api/public/plans' })).headers['cache-control']).toBe(
      'public, max-age=60',
    );
  });

  it('logged URLs drop the query string', () => {
    expect(
      reqSerializer({ method: 'GET', url: '/api/integrations/google/callback?code=SECRET&state=x', id: '1' }),
    ).toEqual({
      method: 'GET',
      url: '/api/integrations/google/callback',
      id: '1',
    });
  });
});
