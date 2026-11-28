import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApp, prisma } from './helpers.js';

afterEach(() => vi.restoreAllMocks());

describe('health checks (M14)', () => {
  it('/health answers without touching the database', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('/health/ready is 200 when the database answers and 503 when it does not', async () => {
    const app = await getApp();
    expect((await app.inject({ method: 'GET', url: '/health/ready' })).json()).toEqual({
      ok: true,
      db: 'up',
    });
    vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connection refused'));
    const down = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(down.statusCode).toBe(503);
    expect(down.json()).toEqual({ ok: false, db: 'down' });
  });
});
