import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearMaintenanceCache } from '../src/services/maintenance.js';
import { canReply } from '../src/services/plan.js';
import { call, getApp, prisma, signup } from './helpers.js';

async function setFlag(key: string, enabled: boolean) {
  await prisma.featureFlag.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
  clearMaintenanceCache();
}

afterEach(async () => {
  vi.restoreAllMocks();
  await setFlag('maintenance_read_only', false);
  await setFlag('maintenance_agent_paused', false);
});

describe('maintenance mode (M5)', () => {
  it('read-only: tenant writes get 503, reads, sign-in and webhooks keep working', async () => {
    const s = await signup();
    await setFlag('maintenance_read_only', true);
    const write = await call(s, 'PUT', '/api/agent/knowledge', { businessDetails: 'x' });
    expect(write.statusCode).toBe(503);
    expect(write.json().code).toBe('MAINTENANCE');
    expect(write.headers['retry-after']).toBe('300');
    expect((await call(s, 'GET', '/api/agent')).statusCode).toBe(200);
    expect((await call(s, 'POST', '/api/auth/logout')).statusCode).toBe(200);
    const app = await getApp();
    const hook = await app.inject({ method: 'POST', url: '/webhooks/telegram/none', payload: {} });
    expect(hook.statusCode).not.toBe(503);
    expect((await app.inject({ method: 'GET', url: '/api/public/status' })).json()).toEqual({
      readOnly: true,
    });
  });

  it('agent paused: replies stop with reason "maintenance"', async () => {
    const s = await signup();
    const u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(await canReply(u, true)).toEqual({ ok: true });
    await setFlag('maintenance_agent_paused', true);
    expect(await canReply(u, true)).toEqual({ ok: false, reason: 'maintenance' });
  });

  it('fails open: if the flag lookup breaks, the product keeps working', async () => {
    const s = await signup();
    clearMaintenanceCache();
    vi.spyOn(prisma.featureFlag, 'findUnique').mockRejectedValue(new Error('db hiccup'));
    expect(
      (await call(s, 'PUT', '/api/agent/knowledge', { businessDetails: 'still works' })).statusCode,
    ).toBe(200);
  });
});
