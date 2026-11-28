import { afterEach, describe, expect, it, vi } from 'vitest';
import { encrypt } from '../src/lib/crypto.js';
import { call, prisma, signup } from './helpers.js';

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

describe('error responses (M12)', () => {
  it('a payment-provider failure is a generic 502, details stay in the logs', async () => {
    const s = await signup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respond(500, { message: 'internal cashfree detail xyz' }),
    );
    const res = await call(s, 'POST', '/api/billing/checkout', { plan: 'STARTER', phone: '9876543210' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('Could not start the payment. Please try again.');
    expect(res.body).not.toContain('xyz');
  });

  it('an AI provider failure in the Skill Creator is a 503', async () => {
    const s = await signup();
    await prisma.apiKey.create({
      data: {
        userId: s.userId,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        encryptedKey: encrypt('sk-x'),
        last4: 'x',
      },
    });
    await prisma.agent.update({
      where: { userId: s.userId },
      data: { provider: 'openai', model: 'gpt-4.1-mini' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(503, { error: { message: 'overloaded' } }));
    const res = await call(s, 'POST', '/api/skills/generate', {
      description: 'A skill that answers questions about delivery times in a friendly way',
    });
    expect(res.statusCode).toBe(503);
  });

  it('another tenant’s custom skill looks like a missing one', async () => {
    const owner = await signup();
    const skill = await prisma.skill.create({
      data: {
        slug: `custom-${owner.userId}`,
        name: 'Mine',
        description: 'd',
        category: 'Custom',
        promptFragment: 'p',
        authorId: owner.userId,
      },
    });
    const other = await signup();
    const res = await call(other, 'DELETE', `/api/skills/${skill.id}`);
    expect(res.statusCode).toBe(404);
    expect(await prisma.skill.count({ where: { id: skill.id } })).toBe(1);
  });
});

describe('HttpError headers', () => {
  it('the error handler sends headers attached to an HttpError', async () => {
    const { buildApp } = await import('../src/app.js');
    const { HttpError } = await import('../src/lib/errors.js');
    const app = await buildApp();
    app.get('/__throw', async () => {
      throw new HttpError(429, 'slow down', 'RATE_LIMITED', undefined, { 'retry-after': '30' });
    });
    const res = await app.inject({ method: 'GET', url: '/__throw' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('30');
    await app.close();
  });
});
