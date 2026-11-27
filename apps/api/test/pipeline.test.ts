import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANS } from '@cowork/shared';
import { buildComponents, checkValues, templateFields } from '../src/channels/template-fields.js';
import { textOf } from '../src/channels/baileys.js';
import { normalizeUpdate } from '../src/channels/telegram.js';
import { encrypt, encryptJson, hmacSha256Hex } from '../src/lib/crypto.js';
import { call, getApp, prisma, signup, type Session } from './helpers.js';

type Route = (url: string, body: unknown) => unknown;
let llmQueue: unknown[] = [];
const sent: { url: string; body: Record<string, unknown> }[] = [];

function openaiText(content: string) {
  return { choices: [{ message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 30 } };
}
function openaiTool(name: string, args: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  };
}

const routes: [RegExp, Route][] = [
  [/api\.openai\.com\/v1\/chat\/completions/, () => llmQueue.shift() ?? openaiText('Hello from the agent!')],
  [/api\.telegram\.org\/bot[^/]+\/sendMessage/, () => ({ ok: true, result: { message_id: 999 } })],
  [/api\.telegram\.org\/bot[^/]+\/sendChatAction/, () => ({ ok: true, result: true })],
  [/graph\.facebook\.com\/.+\/messages/, () => ({ messages: [{ id: 'wamid.OUT' }] })],
];

beforeEach(() => {
  llmQueue = [];
  sent.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sent.push({ url, body });
    const route = routes.find(([re]) => re.test(url));
    if (!route) return new Response(JSON.stringify({ error: `unmocked ${url}` }), { status: 500 });
    return new Response(JSON.stringify(route[1](url, body)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});
afterEach(() => vi.restoreAllMocks());

async function setupTenant(opts: { withKey?: boolean } = {}) {
  const s = await signup();
  if (opts.withKey !== false) {
    await prisma.apiKey.create({
      data: {
        userId: s.userId,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        encryptedKey: encrypt('sk-test-123456789'),
        last4: '6789',
      },
    });
    await prisma.agent.update({
      where: { userId: s.userId },
      data: { provider: 'openai', model: 'gpt-4.1-mini' },
    });
  }
  const channel = await prisma.channel.create({
    data: {
      userId: s.userId,
      type: 'TELEGRAM',
      name: '@test_bot',
      status: 'CONNECTED',
      webhookSecret: 'tg-secret-abc',
      encryptedConfig: encryptJson({ botToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi' }),
    },
  });
  return { s, channel };
}

let updateId = 1000;
function tgUpdate(text: string, extra: Record<string, unknown> = {}) {
  updateId += 1;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      text,
      chat: { id: 555001, type: 'private' },
      from: { id: 555001, first_name: 'Ravi', last_name: 'Kumar' },
      ...extra,
    },
  };
}

async function postTelegram(channelId: string, payload: unknown, secret = 'tg-secret-abc') {
  const app = await getApp();
  return app.inject({
    method: 'POST',
    url: `/webhooks/telegram/${channelId}`,
    headers: { 'x-telegram-bot-api-secret-token': secret },
    payload: payload as object,
  });
}

describe('telegram webhook → agent reply', () => {
  it('rejects a wrong secret token', async () => {
    const { channel } = await setupTenant();
    const res = await postTelegram(channel.id, tgUpdate('hi'), 'wrong');
    expect(res.statusCode).toBe(401);
    expect(await prisma.message.count({ where: { userId: channel.userId } })).toBe(0);
  });

  it('stores the message, replies with the AI, records tokens and sends via Telegram', async () => {
    const { channel } = await setupTenant();
    const res = await postTelegram(channel.id, tgUpdate('What are your timings?'));
    expect(res.statusCode).toBe(200);

    const msgs = await prisma.message.findMany({
      where: { userId: channel.userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({
      direction: 'IN',
      role: 'USER',
      status: 'REPLIED',
      content: 'What are your timings?',
    });
    expect(msgs[1]).toMatchObject({
      direction: 'OUT',
      role: 'ASSISTANT',
      status: 'SENT',
      content: 'Hello from the agent!',
      tokensIn: 120,
      tokensOut: 30,
    });
    const tgSend = sent.find((r) => r.url.includes('/sendMessage'));
    expect(tgSend?.body).toMatchObject({ chat_id: '555001', text: 'Hello from the agent!' });
    expect(sent.some((r) => r.url.includes('/sendChatAction'))).toBe(true);

    const llm = sent.find((r) => r.url.includes('openai'));
    const system = (llm?.body.messages as { role: string; content: string }[])[0]!;
    expect(system.role).toBe('system');
    expect(system.content).toContain('FAQ Bot');
  });

  it('is idempotent: a re-delivered update is not processed twice', async () => {
    const { channel } = await setupTenant();
    const u = tgUpdate('hello');
    await postTelegram(channel.id, u);
    await postTelegram(channel.id, u);
    expect(await prisma.message.count({ where: { userId: channel.userId, direction: 'IN' } })).toBe(1);
    expect(sent.filter((r) => r.url.includes('/sendMessage'))).toHaveLength(1);
  });

  it('executes tool calls (book_appointment) and replies with the final answer', async () => {
    const { channel } = await setupTenant();
    const start = new Date(Date.now() + 2 * 86400_000).toISOString();
    llmQueue = [
      openaiTool('book_appointment', {
        customer_name: 'Ravi Kumar',
        service: 'Cleaning',
        start_time: start,
        customer_phone: '9876543210',
      }),
      openaiText('Booked ✅ See you then!'),
    ];
    await postTelegram(channel.id, tgUpdate('Book a cleaning for day after tomorrow'));
    const appt = await prisma.appointment.findFirst({ where: { userId: channel.userId } });
    expect(appt).toMatchObject({ customerName: 'Ravi Kumar', title: 'Cleaning', status: 'CONFIRMED' });
    const out = await prisma.message.findFirst({ where: { userId: channel.userId, direction: 'OUT' } });
    expect(out?.content).toBe('Booked ✅ See you then!');
    expect(out?.toolCalls).toEqual([{ name: 'book_appointment', ok: true }]);
    // second LLM call must contain the tool result
    const second = sent.filter((r) => r.url.includes('openai'))[1]!;
    expect(JSON.stringify(second.body.messages)).toContain('"role":"tool"');
  });

  it('does not reply when the trial has expired', async () => {
    const { s, channel } = await setupTenant();
    await prisma.user.update({ where: { id: s.userId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    await postTelegram(channel.id, tgUpdate('hello?'));
    const inbound = await prisma.message.findFirst({ where: { userId: s.userId, direction: 'IN' } });
    expect(inbound).toMatchObject({ status: 'SKIPPED', error: 'plan_inactive' });
    expect(sent.some((r) => r.url.includes('openai'))).toBe(false);
    expect(sent.some((r) => r.url.includes('/sendMessage'))).toBe(false);
  });

  it('stops replying at the monthly message limit', async () => {
    const { s, channel } = await setupTenant();
    const filler = await prisma.contact.create({
      data: { userId: s.userId, channelType: 'TELEGRAM', externalId: 'filler' },
    });
    const convo = await prisma.conversation.create({
      data: { userId: s.userId, channelId: channel.id, contactId: filler.id },
    });
    await prisma.message.createMany({
      data: Array.from({ length: PLANS.TRIAL.limits.messagesPerMonth }, () => ({
        userId: s.userId,
        conversationId: convo.id,
        direction: 'OUT' as const,
        role: 'ASSISTANT' as const,
        content: 'x',
        status: 'SENT' as const,
      })),
    });
    await postTelegram(channel.id, tgUpdate('one more'));
    const inbound = await prisma.message.findFirst({ where: { userId: s.userId, direction: 'IN' } });
    expect(inbound).toMatchObject({ status: 'SKIPPED', error: 'message_limit' });
  });

  it('skips with a log entry when no AI key is configured', async () => {
    const { s, channel } = await setupTenant({ withKey: false });
    await postTelegram(channel.id, tgUpdate('hi'));
    const inbound = await prisma.message.findFirst({ where: { userId: s.userId, direction: 'IN' } });
    expect(inbound?.error).toBe('no_api_key');
    expect(await prisma.eventLog.count({ where: { userId: s.userId, type: 'reply.no_api_key' } })).toBe(1);
  });
});

describe('Boss Mode (C1)', () => {
  const contactCard = (userId?: number) =>
    tgUpdate('', {
      text: undefined,
      contact: { phone_number: '+91 98765 43210', ...(userId === undefined ? {} : { user_id: userId }) },
    });

  it('a shared contact card only counts as the sender’s phone when it is their own', () => {
    expect(normalizeUpdate(contactCard() as never)).toBeNull();
    expect(normalizeUpdate(contactCard(999) as never)).toBeNull();
    expect(normalizeUpdate(contactCard(555001) as never)?.phone).toBe('919876543210');
  });

  it('a stranger sharing the owner’s number on Telegram gets a normal AI reply, not Boss Mode', async () => {
    const { s, channel } = await setupTenant();
    await prisma.user.update({ where: { id: s.userId }, data: { bossNumbers: ['919876543210'] } });
    await postTelegram(channel.id, contactCard());
    await postTelegram(channel.id, contactCard(555001)); // even their own card: phones never grant Boss Mode on Telegram
    await postTelegram(channel.id, tgUpdate('info: we are closed forever'));
    const agent = await prisma.agent.findUniqueOrThrow({ where: { userId: s.userId } });
    expect(agent.businessDetails).not.toContain('closed forever');
    expect(await prisma.message.count({ where: { userId: s.userId, role: 'SYSTEM' } })).toBe(0);
    expect(await prisma.message.count({ where: { userId: s.userId, role: 'ASSISTANT' } })).toBeGreaterThan(0);
  });

  it('links Telegram with a one-time code, then Boss Mode works', async () => {
    const { s, channel } = await setupTenant();
    const { code } = (await call(s, 'POST', '/api/agent/boss-link-code')).json();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await postTelegram(channel.id, tgUpdate(`/boss ${code.toLowerCase()}`));
    let u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(u.bossTelegramIds).toEqual(['555001']);
    expect(u.bossLinkCodeHash).toBeNull();
    expect(await prisma.eventLog.count({ where: { userId: s.userId, type: 'boss.linked' } })).toBe(1);

    await postTelegram(channel.id, tgUpdate('info: Closed this Monday for Diwali'));
    const agent = await prisma.agent.findUniqueOrThrow({ where: { userId: s.userId } });
    expect(agent.businessDetails).toContain('Closed this Monday for Diwali');

    // the code works once
    await postTelegram(
      channel.id,
      tgUpdate(`/boss ${code}`, { chat: { id: 777, type: 'private' }, from: { id: 777 } }),
    );
    u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(u.bossTelegramIds).toEqual(['555001']);

    // unlink from the web app
    expect((await call(s, 'DELETE', '/api/agent/boss-telegram/555001')).json().bossTelegramIds).toEqual([]);
  });

  it('rejects wrong and expired codes, and stops after 5 wrong tries per hour', async () => {
    const { s, channel } = await setupTenant();
    const { code } = (await call(s, 'POST', '/api/agent/boss-link-code')).json();
    await prisma.user.update({
      where: { id: s.userId },
      data: { bossLinkCodeExpiresAt: new Date(Date.now() - 1000) },
    });
    await postTelegram(channel.id, tgUpdate(`/boss ${code}`));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.userId } })).bossTelegramIds).toEqual([]);

    const fresh = (await call(s, 'POST', '/api/agent/boss-link-code')).json().code;
    for (let i = 0; i < 5; i++) await postTelegram(channel.id, tgUpdate('/boss WRONG1'));
    await postTelegram(channel.id, tgUpdate(`/boss ${fresh}`)); // right code, but locked out now
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.userId } })).bossTelegramIds).toEqual([]);
    const last = await prisma.message.findFirst({
      where: { userId: s.userId, role: 'SYSTEM' },
      orderBy: { createdAt: 'desc' },
    });
    expect(last?.content).toMatch(/Too many attempts/);
  });
});

describe('WhatsApp Cloud API webhook', () => {
  async function cloudChannel() {
    const { s } = await setupTenant();
    const channel = await prisma.channel.create({
      data: {
        userId: s.userId,
        type: 'WHATSAPP_CLOUD',
        name: 'Biz',
        status: 'CONNECTING',
        webhookSecret: 'verify-me-123',
        encryptedConfig: encryptJson({
          phoneNumberId: '1111111',
          accessToken: 'EAAG'.padEnd(30, 'x'),
          appSecret: 'app-secret-0123456789',
        }),
      },
    });
    return { s, channel };
  }
  const payload = (id: string) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '1111111' },
              contacts: [{ wa_id: '919000000001', profile: { name: 'Meera' } }],
              messages: [{ from: '919000000001', id, type: 'text', text: { body: 'Hi there' } }],
            },
          },
        ],
      },
    ],
  });

  it('answers the verification handshake only with the right token', async () => {
    const app = await getApp();
    const { channel } = await cloudChannel();
    const bad = await app.inject({
      method: 'GET',
      url: `/webhooks/whatsapp/${channel.id}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`,
    });
    expect(bad.statusCode).toBe(403);
    const ok = await app.inject({
      method: 'GET',
      url: `/webhooks/whatsapp/${channel.id}?hub.mode=subscribe&hub.verify_token=verify-me-123&hub.challenge=42`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('42');
    expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).status).toBe('CONNECTED');
  });

  it('rejects bad signatures and processes signed messages', async () => {
    const app = await getApp();
    const { s, channel } = await cloudChannel();
    const body = JSON.stringify(payload('wamid.IN1'));
    const bad = await app.inject({
      method: 'POST',
      url: `/webhooks/whatsapp/${channel.id}`,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      payload: body,
    });
    expect(bad.statusCode).toBe(401);

    const good = await app.inject({
      method: 'POST',
      url: `/webhooks/whatsapp/${channel.id}`,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${hmacSha256Hex('app-secret-0123456789', body)}`,
      },
      payload: body,
    });
    expect(good.statusCode).toBe(200);
    const contact = await prisma.contact.findFirst({
      where: { userId: s.userId, channelType: 'WHATSAPP_CLOUD' },
    });
    expect(contact).toMatchObject({ name: 'Meera', phone: '919000000001' });
    const send = sent.find((r) => r.url.includes('graph.facebook.com') && r.body.type === 'text');
    expect(send?.body).toMatchObject({ messaging_product: 'whatsapp', to: '919000000001' });

    // the owner can send an approved template from the same conversation
    const convo = await prisma.conversation.findFirstOrThrow({ where: { channelId: channel.id } });
    const tpl = await prisma.whatsAppTemplate.create({
      data: {
        userId: s.userId,
        channelId: channel.id,
        name: 'order_update',
        language: 'en',
        category: 'UTILITY',
        status: 'APPROVED',
        body: 'Hi {{1}}, order {{2}} shipped',
        variables: 2,
      },
    });
    const url = `/api/conversations/${convo.id}/template`;
    const sendTpl = (params: string[]) => call(s, 'POST', url, { templateId: tpl.id, params });
    await prisma.user.update({ where: { id: s.userId }, data: { plan: 'STARTER' } });
    expect((await sendTpl(['Meera', '#1'])).statusCode).toBe(402);
    await prisma.user.update({ where: { id: s.userId }, data: { plan: 'GROWTH' } });
    expect((await sendTpl(['Meera'])).statusCode).toBe(400);
    expect((await sendTpl(['Meera', '#1'])).statusCode).toBe(200);
    const unsent = await call(s, 'POST', '/api/conversations/start', {
      channelId: channel.id,
      phone: '98765 43210',
      templateId: tpl.id,
      params: ['Ravi', '#2'],
    });
    expect(unsent.statusCode).toBe(200);
    expect(sent.at(-1)?.body.to).toBe('919876543210');
    expect(sent.find((r) => r.body.type === 'template')?.body.template).toMatchObject({
      name: 'order_update',
    });
    const thread = await call(s, 'GET', `/api/conversations/${convo.id}/messages`);
    expect(thread.json().messages.at(-1)).toMatchObject({
      role: 'OWNER',
      status: 'SENT',
      content: 'Hi Meera, order #1 shipped',
    });

    // Meta accepts first and reports the failure later
    const report = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1111111' },
                statuses: [
                  { id: 'wamid.FAIL', status: 'failed', errors: [{ code: 131042, title: 'Payment issue' }] },
                ],
              },
            },
          ],
        },
      ],
    });
    const last = thread.json().messages.at(-1);
    await prisma.message.update({ where: { id: last.id }, data: { externalId: 'wamid.FAIL' } });
    await app.inject({
      method: 'POST',
      url: `/webhooks/whatsapp/${channel.id}`,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${hmacSha256Hex('app-secret-0123456789', report)}`,
      },
      payload: report,
    });
    expect(await prisma.message.findUnique({ where: { id: last.id } })).toMatchObject({
      status: 'FAILED',
      error: 'Payment issue (131042)',
    });
  });
});

describe('template payloads', () => {
  it('fills media headers, named values and link buttons', () => {
    const t = {
      header: null,
      body: 'Hi {{customer_name}}, pay {{amount}}',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hi {{customer_name}}, pay {{amount}}' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Ok' },
            { type: 'URL', text: 'Pay', url: 'https://x.in/{{1}}' },
          ],
        },
      ],
    };
    const f = templateFields(t);
    expect(f.map((x) => x.kind)).toEqual(['image', 'text', 'text', 'text']);
    expect(checkValues(f, ['not-a-link', 'a', 'b', 'c'])).toMatch(/https/);
    expect(buildComponents(f, ['https://x.in/a.png', 'Meera', 'Rs 5', 'inv1'])).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://x.in/a.png' } }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Meera', parameter_name: 'customer_name' },
          { type: 'text', text: 'Rs 5', parameter_name: 'amount' },
        ],
      },
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'inv1' }] },
    ]);
  });
});

describe('WhatsApp QR messages', () => {
  it('reads text from normal, disappearing and media messages', () => {
    expect(textOf({ message: { conversation: 'hi' } })).toBe('hi');
    expect(
      textOf({ message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'price?' } } } } }),
    ).toBe('price?');
    expect(textOf({ message: { audioMessage: {} } })).toBe('[voice message]');
    expect(textOf({ message: { protocolMessage: {} } })).toBeNull();
  });
});

describe('plan limits', () => {
  it('the free trial allows Telegram only', async () => {
    const s = await signup();
    const res = await call(s, 'POST', '/api/channels/whatsapp-cloud', {
      phoneNumberId: '1234567',
      accessToken: 'EAAG'.padEnd(30, 'x'),
      appSecret: 'secret-secret-secret',
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error).toMatch(/Telegram only/);
  });

  it('blocks adding channels beyond the plan limit', async () => {
    const s = await signup();
    await prisma.user.update({ where: { id: s.userId }, data: { plan: 'STARTER' } });
    for (let i = 0; i < 3; i++) {
      await prisma.channel.create({
        data: { userId: s.userId, type: 'TELEGRAM', name: `b${i}`, webhookSecret: 'x' },
      });
    }
    const res = await call(s, 'POST', '/api/channels/telegram', {
      botToken: '123456789:AAH' + 'x'.repeat(32),
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().code).toBe('PLAN_LIMIT');
  });

  it('blocks enabling more skills than the plan allows (trial = 10)', async () => {
    const s = await signup();
    const skills = await prisma.skill.findMany({ where: { isPublic: true }, take: 12 });
    await prisma.userSkill.deleteMany({ where: { userId: s.userId } });
    for (const sk of skills.slice(0, 10))
      await prisma.userSkill.create({ data: { userId: s.userId, skillId: sk.id, enabled: true } });
    const res = await call(s, 'PUT', `/api/skills/${skills[10]!.id}`, { enabled: true });
    expect(res.statusCode).toBe(402);
    const ok = await call(s, 'PUT', `/api/skills/${skills[0]!.id}`, { enabled: false });
    expect(ok.statusCode).toBe(200);
  });
});

describe('tenant isolation over HTTP', () => {
  let a: Session;
  let bConvoId: string;
  let bChannelId: string;

  it('user A cannot read or modify user B data', async () => {
    a = await signup();
    const { s: b, channel } = await setupTenant();
    bChannelId = channel.id;
    await postTelegram(channel.id, tgUpdate('private message of B'));
    bConvoId = (await prisma.conversation.findFirstOrThrow({ where: { userId: b.userId } })).id;

    expect((await call(a, 'GET', `/api/conversations/${bConvoId}/messages`)).statusCode).toBe(404);
    expect((await call(a, 'POST', `/api/conversations/${bConvoId}/reply`, { text: 'hi' })).statusCode).toBe(
      404,
    );
    expect((await call(a, 'DELETE', `/api/channels/${bChannelId}`)).statusCode).toBe(404);
    const list = await call(a, 'GET', '/api/conversations');
    expect(list.json().conversations).toHaveLength(0);
    const keys = await call(b, 'GET', '/api/keys');
    expect(JSON.stringify(keys.json())).not.toContain('sk-test');
    expect(await prisma.channel.findUnique({ where: { id: bChannelId } })).not.toBeNull();
  });
});
