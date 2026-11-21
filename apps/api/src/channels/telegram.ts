/** Telegram Bot API (https://core.telegram.org/bots/api). */
const BASE = 'https://api.telegram.org';

export class TelegramError extends Error {}

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new TelegramError(data.description ?? `Telegram ${method} failed (${res.status})`);
  return data.result as T;
}

export function getMe(token: string) {
  return call<{ id: number; username: string; first_name: string }>(token, 'getMe');
}

export function setWebhook(token: string, url: string, secretToken: string) {
  return call<boolean>(token, 'setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
}

export function deleteWebhook(token: string) {
  return call<boolean>(token, 'deleteWebhook', { drop_pending_updates: false });
}

export async function sendMessage(token: string, chatId: string, text: string): Promise<string> {
  // Telegram limit is 4096 chars per message
  const chunks = text.match(/[\s\S]{1,4000}/g) ?? [text];
  let lastId = '';
  for (const chunk of chunks) {
    const r = await call<{ message_id: number }>(token, 'sendMessage', { chat_id: chatId, text: chunk });
    lastId = String(r.message_id);
  }
  return lastId;
}

export function sendTyping(token: string, chatId: string) {
  return call<boolean>(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string };
    from?: { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
    contact?: { phone_number: string; user_id?: number; first_name?: string };
  };
}

export interface NormalizedInbound {
  externalChatId: string;
  externalMessageId: string;
  dedupeId: string;
  text: string;
  name: string | null;
  phone: string | null;
}

export function normalizeUpdate(u: TelegramUpdate): NormalizedInbound | null {
  const m = u.message;
  if (!m || m.chat.type !== 'private' || m.from?.is_bot) return null;
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username || null;
  // A contact shared by the user themself gives us their phone (used for Boss Mode).
  const ownContact = m.contact && (!m.contact.user_id || m.contact.user_id === m.from?.id) ? m.contact.phone_number : null;
  const text = m.text ?? m.caption ?? (ownContact ? '[shared contact]' : null);
  if (!text) return null;
  return {
    externalChatId: String(m.chat.id),
    externalMessageId: String(m.message_id),
    dedupeId: String(u.update_id),
    text: text.slice(0, 4000),
    name,
    phone: ownContact ? ownContact.replace(/\D/g, '') : null,
  };
}
