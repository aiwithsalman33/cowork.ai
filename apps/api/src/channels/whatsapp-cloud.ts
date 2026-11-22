/**
 * WhatsApp Business Cloud API (Meta Graph API).
 * - Webhook verify: GET with hub.mode=subscribe, hub.verify_token, hub.challenge → echo challenge as text.
 * - Webhook POST: X-Hub-Signature-256: sha256=<HMAC-SHA256(appSecret, rawBody)>.
 * - Send: POST /{version}/{phone-number-id}/messages
 * Graph version is configurable via WA_GRAPH_VERSION.
 */
import { env } from '../config.js';
import { hmacSha256Hex, safeEqual } from '../lib/crypto.js';
import type { NormalizedInbound } from './telegram.js';

export interface CloudConfig {
  phoneNumberId: string;
  businessAccountId?: string;
  accessToken: string;
  appSecret: string;
  displayPhone?: string;
}

const graph = (path: string) => `https://graph.facebook.com/${env.WA_GRAPH_VERSION}/${path}`;

export class CloudApiError extends Error {}

async function graphFetch<T>(
  cfg: CloudConfig,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const res = await fetch(graph(path), {
    method: init.method,
    headers: { authorization: `Bearer ${cfg.accessToken}`, 'content-type': 'application/json' },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new CloudApiError(data.error?.message ?? `WhatsApp Cloud API error (${res.status})`);
  return data;
}

/** Confirms the credentials can read the phone number. */
export async function verifyCredentials(cfg: CloudConfig) {
  return graphFetch<{ display_phone_number?: string; verified_name?: string; id: string }>(
    cfg,
    `${cfg.phoneNumberId}?fields=display_phone_number,verified_name`,
    { method: 'GET' },
  );
}

export async function sendText(cfg: CloudConfig, to: string, body: string): Promise<string> {
  const chunks = body.match(/[\s\S]{1,4000}/g) ?? [body];
  let id = '';
  for (const chunk of chunks) {
    const r = await graphFetch<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      body: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: chunk },
      },
    });
    id = r.messages?.[0]?.id ?? id;
  }
  return id;
}

/**
 * Marks the inbound message read and shows a typing indicator.
 * NOTE: `typing_indicator` on the read receipt is a 2025 Cloud API addition; treated as best-effort.
 */
export async function markReadWithTyping(cfg: CloudConfig, messageId: string) {
  await graphFetch(cfg, `${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    },
  });
}

export function verifySignature(
  appSecret: string,
  rawBody: Buffer | undefined,
  header: string | undefined,
): boolean {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  return safeEqual(header.slice(7), hmacSha256Hex(appSecret, rawBody));
}

interface CloudWebhook {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          from: string;
          id: string;
          type: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
          image?: { caption?: string };
        }[];
      };
    }[];
  }[];
}

export function parseWebhook(body: unknown, expectedPhoneNumberId: string): NormalizedInbound[] {
  const out: NormalizedInbound[] = [];
  const payload = body as CloudWebhook;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages || v.metadata?.phone_number_id !== expectedPhoneNumberId) continue;
      for (const m of v.messages) {
        const text =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          m.image?.caption ??
          (m.type !== 'text' ? `[${m.type} message]` : null);
        if (!text) continue;
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        out.push({
          externalChatId: m.from,
          externalMessageId: m.id,
          dedupeId: m.id,
          text: text.slice(0, 4000),
          name,
          phone: m.from.replace(/\D/g, ''),
        });
      }
    }
  }
  return out;
}

// ---------------- Message templates ----------------

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  buttons?: { type: string; text: string }[];
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: MetaTemplateComponent[];
}

function requireWaba(cfg: CloudConfig): string {
  if (!cfg.businessAccountId) {
    throw new CloudApiError('Add your WhatsApp Business Account ID to use templates.');
  }
  return cfg.businessAccountId;
}

/** All templates of the WhatsApp Business Account (follows paging, max 1000). */
export async function listTemplates(cfg: CloudConfig): Promise<MetaTemplate[]> {
  const waba = requireWaba(cfg);
  const out: MetaTemplate[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await graphFetch<{
      data?: MetaTemplate[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(
      cfg,
      `${waba}/message_templates?fields=id,name,language,status,category,components&limit=100${after ? `&after=${after}` : ''}`,
      { method: 'GET' },
    );
    out.push(...(r.data ?? []));
    if (!r.paging?.next || !r.paging.cursors?.after) break;
    after = r.paging.cursors.after;
  }
  return out;
}

/** Submits a new template to Meta for review. Returns its id and review status. */
export async function createTemplate(
  cfg: CloudConfig,
  t: {
    name: string;
    language: string;
    category: string;
    header?: string;
    body: string;
    footer?: string;
    examples: string[];
  },
) {
  const waba = requireWaba(cfg);
  const components: Record<string, unknown>[] = [];
  if (t.header) components.push({ type: 'HEADER', format: 'TEXT', text: t.header });
  components.push({
    type: 'BODY',
    text: t.body,
    ...(t.examples.length ? { example: { body_text: [t.examples] } } : {}),
  });
  if (t.footer) components.push({ type: 'FOOTER', text: t.footer });
  return graphFetch<{ id: string; status?: string; category?: string }>(cfg, `${waba}/message_templates`, {
    method: 'POST',
    body: { name: t.name, language: t.language, category: t.category, components },
  });
}

/** Sends an approved template; `params` fill the body's {{1}}, {{2}}, … in order. */
export async function sendTemplate(
  cfg: CloudConfig,
  to: string,
  t: { name: string; language: string },
  params: string[],
): Promise<string> {
  const r = await graphFetch<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: t.name,
        language: { code: t.language },
        ...(params.length
          ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] }
          : {}),
      },
    },
  });
  return r.messages?.[0]?.id ?? '';
}

/** Counts distinct {{n}} placeholders. */
export function countVariables(text: string): number {
  return new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;
}

/** Renders a template body with its parameters (for the conversation transcript). */
export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => params[Number(n) - 1] ?? `{{${n}}}`);
}
