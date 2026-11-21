import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encrypt, encryptJson } from '../src/lib/crypto.js';
import { filterRows } from '../src/agent/tools.js';
import { buildAgentPrompt } from '../src/agent/runtime.js';
import { call, getApp, prisma, randomIp, signup, type Session } from './helpers.js';

const SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
const sent: { url: string; method: string; body: unknown }[] = [];
let llmQueue: unknown[] = [];

const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;

beforeEach(() => {
  sent.length = 0;
  llmQueue = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const raw = init?.body ? String(init.body) : '';
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = Object.fromEntries(new URLSearchParams(raw));
    }
    sent.push({ url, method: init?.method ?? 'GET', body });
    const json = (d: unknown, status = 200) =>
      new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const b = body as Record<string, string>;
      if (b.grant_type === 'authorization_code') {
        return json({
          access_token: 'at-1',
          expires_in: 3600,
          refresh_token: 'rt-1',
          scope: `openid email ${SHEETS}`,
          id_token: idToken('owner@biz.in'),
        });
      }
      return json({ access_token: 'at-2', expires_in: 3600 });
    }
    if (url.includes('sheets.googleapis.com') && url.includes('?fields=')) {
      return json({
        properties: { title: 'Price list 2026' },
        sheets: [{ properties: { title: 'Sheet1' } }],
      });
    }
    if (url.includes(':append')) return json({ updates: { updatedRows: 1 } });
    if (url.includes('sheets.googleapis.com')) {
      return json({
        values: [
          ['Product', 'Price', 'Stock'],
          ['Kaju Katli 500g', '₹450', '12'],
          ['Rasgulla 1kg', '₹320', '0'],
          ['Kaju Katli 1kg', '₹880', '4'],
        ],
      });
    }
    if (url.includes('api.openai.com')) {
      return json(
        llmQueue.shift() ?? {
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        },
      );
    }
    if (url.includes('api.telegram.org')) return json({ ok: true, result: { message_id: 1 } });
    return json({ error: `unmocked ${url}` }, 500);
  });
});
afterEach(() => vi.restoreAllMocks());

async function withCredentials(s: Session) {
  const res = await call(s, 'PUT', '/api/integrations/google/credentials', {
    clientId: '1234567890-abcdef.apps.googleusercontent.com',
    clientSecret: 'GOCSPX-secret-value-123',
  });
  expect(res.statusCode).toBe(200);
}

describe('Google OAuth with the tenant’s own Cloud credentials', () => {
  it('validates the client id format', async () => {
    const s = await signup();
    const res = await call(s, 'PUT', '/api/integrations/google/credentials', {
      clientId: 'nope',
      clientSecret: 'x'.repeat(20),
    });
    expect(res.statusCode).toBe(400);
  });

  it('builds the consent URL and completes the callback', async () => {
    const app = await getApp();
    const s = await signup();
    await withCredentials(s);
    const status = await call(s, 'GET', '/api/integrations/google');
    expect(status.json()).toMatchObject({ credentialsSaved: true, connected: false });
    expect(status.json().redirectUri).toBe('http://localhost:3000/api/integrations/google/callback');
    expect(JSON.stringify(status.json())).not.toContain('GOCSPX');

    const connect = await call(s, 'POST', '/api/integrations/google/connect', {
      services: ['googlesheets', 'gmail'],
    });
    const url = new URL(connect.json().url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('1234567890-abcdef.apps.googleusercontent.com');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toContain(SHEETS);
    expect(url.searchParams.get('scope')).toContain('gmail.send');
    const state = url.searchParams.get('state')!;

    const cb = await app.inject({
      method: 'GET',
      url: `/api/integrations/google/callback?code=abc&state=${encodeURIComponent(state)}`,
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('http://localhost:3000/integrations?google=connected');

    const conn = await prisma.googleConnection.findUniqueOrThrow({ where: { userId: s.userId } });
    expect(conn).toMatchObject({ status: 'CONNECTED', email: 'owner@biz.in' });
    expect(conn.encryptedRefreshToken).not.toContain('rt-1');
    const after = await call(s, 'GET', '/api/integrations/google');
    expect(after.json().services).toEqual(['googlesheets']);
  });

  it('rejects a forged or expired state', async () => {
    const app = await getApp();
    const cb = await app.inject({
      method: 'GET',
      url: '/api/integrations/google/callback?code=abc&state=forged',
    });
    expect(cb.headers.location).toContain('google=error');
  });
});

async function connectedTenant() {
  const s = await signup();
  await prisma.googleConnection.create({
    data: {
      userId: s.userId,
      encryptedCredentials: encryptJson({ clientId: 'c.apps.googleusercontent.com', clientSecret: 'secret' }),
      encryptedRefreshToken: encrypt('rt-1'),
      scopes: ['openid', 'email', SHEETS],
      status: 'CONNECTED',
      email: 'owner@biz.in',
    },
  });
  return s;
}

describe('Agent Google Sheets', () => {
  it('adds a sheet after checking it can be opened', async () => {
    const s = await connectedTenant();
    const res = await call(s, 'POST', '/api/sheets', {
      sheet: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0',
      name: 'Price list',
      description: 'Sweets with prices and stock',
      purpose: 'LOOKUP',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().sheet).toMatchObject({
      name: 'Price list',
      title: 'Price list 2026',
      spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
    });
    const bad = await call(s, 'POST', '/api/sheets', {
      sheet: 'https://example.com/nope',
      name: 'X sheet',
      purpose: 'LEADS',
    });
    expect(bad.statusCode).toBe(400);
  });

  it('exposes read_sheet and lists lookup sheets in the prompt', async () => {
    const s = await connectedTenant();
    await prisma.agentSheet.create({
      data: {
        userId: s.userId,
        spreadsheetId: 'x'.repeat(30),
        name: 'Price list',
        description: 'prices + stock',
        purpose: 'LOOKUP',
      },
    });
    const { system, tools } = await buildAgentPrompt(s.userId, { channel: 'WhatsApp' });
    expect(tools.map((t) => t.name)).toContain('read_sheet');
    expect(system).toContain('"Price list": prices + stock');
  });

  it('filterRows matches all query words and keeps the header', () => {
    const r = filterRows(
      [
        ['Product', 'Price'],
        ['Kaju Katli 500g', '450'],
        ['Rasgulla', '320'],
        ['Kaju Katli 1kg', '880'],
      ],
      'kaju 1kg',
    );
    expect(r.header).toEqual(['Product', 'Price']);
    expect(r.rows).toEqual([['Kaju Katli 1kg', '880']]);
  });

  it('the agent reads a sheet and logs leads to the leads sheet during a real conversation', async () => {
    const s = await connectedTenant();
    await prisma.apiKey.create({
      data: {
        userId: s.userId,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        encryptedKey: encrypt('sk-test-1234567890'),
        last4: '7890',
      },
    });
    await prisma.agent.update({
      where: { userId: s.userId },
      data: { provider: 'openai', model: 'gpt-4.1-mini' },
    });
    await prisma.agentSheet.createMany({
      data: [
        { userId: s.userId, spreadsheetId: 'p'.repeat(30), name: 'Price list', purpose: 'LOOKUP' },
        { userId: s.userId, spreadsheetId: 'l'.repeat(30), name: 'Leads', purpose: 'LEADS' },
      ],
    });
    const channel = await prisma.channel.create({
      data: {
        userId: s.userId,
        type: 'TELEGRAM',
        name: '@b',
        status: 'CONNECTED',
        webhookSecret: 'sec',
        encryptedConfig: encryptJson({ botToken: '1:x' }),
      },
    });
    const tc = (name: string, args: object) => ({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    llmQueue = [
      tc('read_sheet', { sheet_name: 'Price list', query: 'kaju 500g' }),
      tc('capture_lead', { name: 'Anita', phone: '9000000000', interest: 'Kaju Katli 500g x2' }),
      {
        choices: [{ message: { content: 'Kaju Katli 500g is ₹450 — noted your order!' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      },
    ];
    const app = await getApp();
    await app.inject({
      method: 'POST',
      url: `/webhooks/telegram/${channel.id}`,
      headers: { 'x-telegram-bot-api-secret-token': 'sec' },
      payload: {
        update_id: 77,
        message: {
          message_id: 77,
          date: 1,
          text: 'price of kaju katli 500g? I want 2',
          chat: { id: 9, type: 'private' },
          from: { id: 9, first_name: 'Anita' },
        },
      },
    });
    // tool result sent back to the model contains the matching row only
    const second = sent.filter((r) => r.url.includes('openai'))[1]!;
    expect(JSON.stringify(second.body)).toContain('Kaju Katli 500g');
    expect(JSON.stringify(second.body)).not.toContain('Rasgulla');
    // lead appended to the Leads sheet
    const append = sent.find((r) => r.url.includes(':append'));
    expect(append?.url).toContain('l'.repeat(30));
    expect(JSON.stringify(append?.body)).toContain('Anita');
    expect(await prisma.lead.findFirst({ where: { userId: s.userId } })).toMatchObject({
      syncedToSheet: true,
    });
    const out = await prisma.message.findFirst({ where: { userId: s.userId, direction: 'OUT' } });
    expect(out?.content).toContain('₹450');
  });
});

describe('landing page contact form', () => {
  it('stores messages and validates the phone number', async () => {
    const app = await getApp();
    const ok = await app.inject({
      method: 'POST',
      url: '/api/public/contact',
      remoteAddress: randomIp(),
      payload: { name: 'Ravi', phone: '+91 98765 43210', message: 'Need a WhatsApp bot for my clinic' },
    });
    expect(ok.statusCode).toBe(201);
    expect(await prisma.contactMessage.count({ where: { name: 'Ravi' } })).toBeGreaterThan(0);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/public/contact',
      remoteAddress: randomIp(),
      payload: { name: 'R', phone: 'abc', message: 'x' },
    });
    expect(bad.statusCode).toBe(400);
  });
});
