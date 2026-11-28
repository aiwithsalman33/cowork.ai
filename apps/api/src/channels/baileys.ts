/**
 * WhatsApp Web sessions via Baileys (UNOFFICIAL — numbers can be banned; the UI warns users).
 *
 * - One socket per WHATSAPP_QR channel; auth state persisted ENCRYPTED (wa-auth-state.ts, audit M9) under
 *   WA_SESSIONS_DIR/<userId>/<channelId> (a docker volume), so sessions are bundled per tenant.
 * - Auto-reconnect with exponential backoff unless WhatsApp reports loggedOut.
 * - Sessions that were connected are restored on boot (bootSessions).
 * - Must run in a single API replica: two processes using the same auth dir will fight.
 */
import { mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  Browsers,
  DisconnectReason,
  extractMessageContent,
  fetchLatestBaileysVersion,
  isHostedLidUser,
  isJidBroadcast,
  isJidGroup,
  isJidStatusBroadcast,
  isLidUser,
  makeCacheableSignalKeyStore,
  makeWASocket,
  type proto,
  type WAMessage,
  type WASocket,
} from 'baileys';
import { env } from '../config.js';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { logEvent } from '../services/audit.js';
import { checkSessionsDirPermissions, dropBackup, useEncryptedAuthState } from './wa-auth-state.js';
import type { NormalizedInbound } from './telegram.js';

type InboundHandler = (channelId: string, msg: NormalizedInbound) => Promise<void>;

interface Session {
  channelId: string;
  userId: string;
  sock: WASocket | null;
  qr: string | null;
  qrDataUrl: string | null;
  attempts: number;
  stopping: boolean;
  timer: NodeJS.Timeout | null;
}

const sessions = new Map<string, Session>();
let onInbound: InboundHandler = async () => {};
let cachedVersion: [number, number, number] | null = null;
const baileysLogger = logger.child({ module: 'baileys' }, { level: 'warn' });

export function setInboundHandler(h: InboundHandler) {
  onInbound = h;
}

export function sessionDir(userId: string, channelId: string) {
  return path.resolve(env.WA_SESSIONS_DIR, userId, channelId);
}

async function setStatus(
  channelId: string,
  data: {
    status: 'CONNECTING' | 'QR' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
    externalId?: string | null;
    lastError?: string | null;
  },
) {
  await prisma.channel
    .update({
      where: { id: channelId },
      data: { ...data, ...(data.status === 'CONNECTED' ? { connectedAt: new Date(), lastError: null } : {}) },
    })
    .catch(() => null); // channel may have been deleted
}

/**
 * Recently sent messages, kept so WhatsApp can ask us to re-encrypt one. Without this the customer
 * can be left with "Waiting for this message".
 */
const sentMessages = new Map<string, proto.IMessage>();
function rememberSent(id: string | null | undefined, message: proto.IMessage | null | undefined) {
  if (!id || !message) return;
  sentMessages.set(id, message);
  if (sentMessages.size > 500) sentMessages.delete(sentMessages.keys().next().value!);
}

const MEDIA_LABEL: [keyof proto.IMessage, string][] = [
  ['imageMessage', '[image message]'],
  ['videoMessage', '[video message]'],
  ['audioMessage', '[voice message]'],
  ['documentMessage', '[document message]'],
  ['stickerMessage', '[sticker message]'],
  ['locationMessage', '[location message]'],
  ['contactMessage', '[contact message]'],
];

/** Text of a message. Unwraps disappearing / view-once containers; media without a caption gets a label. */
export function textOf(m: Pick<WAMessage, 'message'>): string | null {
  const msg = extractMessageContent(m.message);
  if (!msg) return null;
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title ??
    msg.templateButtonReplyMessage?.selectedDisplayText ??
    msg.documentMessage?.caption ??
    MEDIA_LABEL.find(([k]) => msg[k])?.[1] ??
    null
  );
}

async function handleMessages(s: Session, messages: WAMessage[]) {
  for (const m of messages) {
    const jid = m.key.remoteJid;
    if (!jid || m.key.fromMe) continue;
    if (isJidGroup(jid) || isJidBroadcast(jid) || isJidStatusBroadcast(jid)) continue;
    const text = textOf(m);
    if (!text || !m.key.id) {
      if (m.messageStubType && !m.message)
        logger.warn({ channelId: s.channelId }, 'WhatsApp message could not be decrypted yet');
      continue;
    }
    // With LID addressing the phone-number JID arrives in remoteJidAlt (Baileys 7).
    const pnJid = isLidUser(jid) || isHostedLidUser(jid) ? (m.key.remoteJidAlt ?? null) : jid;
    const phone = pnJid ? pnJid.split('@')[0]!.split(':')[0]!.replace(/\D/g, '') : null;
    try {
      await onInbound(s.channelId, {
        externalChatId: jid,
        externalMessageId: m.key.id,
        dedupeId: m.key.id,
        text: text.slice(0, 4000),
        name: m.pushName ?? null,
        phone,
      });
    } catch (err) {
      logger.error({ err, channelId: s.channelId }, 'failed to ingest WhatsApp message');
    }
  }
}

async function connect(s: Session) {
  if (s.stopping) return;
  const dir = sessionDir(s.userId, s.channelId);
  const { state, saveCreds } = await useEncryptedAuthState(dir);
  if (!cachedVersion) {
    try {
      cachedVersion = (await fetchLatestBaileysVersion()).version;
    } catch {
      cachedVersion = null; // fall back to Baileys' bundled default
    }
  }
  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger as never),
    },
    getMessage: async (key) => (key.id ? sentMessages.get(key.id) : undefined),
    logger: baileysLogger as never,
    browser: Browsers.ubuntu('cowork-ai'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    ...(cachedVersion ? { version: cachedVersion } : {}),
  });
  s.sock = sock;

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (s.sock === sock && type === 'notify') void handleMessages(s, messages);
  });
  sock.ev.on('connection.update', async (u) => {
    if (s.sock !== sock) return; // event from a socket that was already replaced
    if (u.qr) {
      s.qr = u.qr;
      s.qrDataUrl = await QRCode.toDataURL(u.qr, { margin: 1, width: 320 });
      await setStatus(s.channelId, { status: 'QR' });
    }
    if (u.connection === 'open') {
      // the encrypted session works: the one-time plaintext backup is no longer needed
      void dropBackup(dir).catch(() => undefined);
      s.attempts = 0;
      s.qr = null;
      s.qrDataUrl = null;
      const phone = sock.user?.id?.split(':')[0]?.split('@')[0] ?? null;
      await setStatus(s.channelId, { status: 'CONNECTED', externalId: phone ? `+${phone}` : null });
      await logEvent(
        s.userId,
        'INFO',
        'channel.connected',
        `WhatsApp (QR) connected${phone ? ` as +${phone}` : ''}`,
      );
    }
    if (u.connection === 'close') {
      s.sock = null;
      const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      if (s.stopping) return;
      if (code === DisconnectReason.loggedOut) {
        await rm(dir, { recursive: true, force: true });
        sessions.delete(s.channelId);
        await setStatus(s.channelId, {
          status: 'DISCONNECTED',
          lastError: 'Logged out from the phone. Scan the QR code again.',
        });
        await logEvent(
          s.userId,
          'WARN',
          'channel.logged_out',
          'WhatsApp (QR) session was logged out from the phone',
        );
        return;
      }
      if (code === DisconnectReason.connectionReplaced || code === DisconnectReason.forbidden) {
        await setStatus(s.channelId, {
          status: 'ERROR',
          lastError:
            code === DisconnectReason.forbidden
              ? 'WhatsApp refused this number (it may be restricted). Check WhatsApp on the phone.'
              : 'This WhatsApp session was opened somewhere else. Click Reconnect to use it here.',
        });
        await logEvent(s.userId, 'ERROR', 'channel.error', `WhatsApp (QR) stopped (code ${code})`);
        return;
      }
      s.attempts += 1;
      if (s.attempts === 9) {
        await setStatus(s.channelId, {
          status: 'ERROR',
          lastError: 'WhatsApp connection lost. Retrying every 5 minutes — or click Reconnect.',
        });
        await logEvent(
          s.userId,
          'ERROR',
          'channel.reconnect_failed',
          `WhatsApp (QR) reconnect failed (code ${code ?? 'unknown'})`,
        );
      }
      const delay =
        code === DisconnectReason.restartRequired
          ? 500
          : s.attempts > 8
            ? 5 * 60_000
            : Math.min(30_000, 1000 * 2 ** s.attempts);
      if (s.attempts <= 8) await setStatus(s.channelId, { status: 'CONNECTING' });
      if (s.stopping || s.sock) return; // stopped or reconnected by hand meanwhile
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        s.timer = null;
        connect(s).catch((err) => logger.error({ err }, 'baileys reconnect failed'));
      }, delay);
    }
  });
}

export async function startSession(channelId: string, userId: string) {
  const existing = sessions.get(channelId);
  if (existing?.sock) return existing;
  const s: Session = existing ?? {
    channelId,
    userId,
    sock: null,
    qr: null,
    qrDataUrl: null,
    attempts: 0,
    stopping: false,
    timer: null,
  };
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  s.stopping = false;
  s.attempts = 0;
  sessions.set(channelId, s);
  await setStatus(channelId, { status: 'CONNECTING' });
  await connect(s);
  return s;
}

export function getSessionState(channelId: string) {
  const s = sessions.get(channelId);
  return { running: !!s?.sock, qr: s?.qrDataUrl ?? null };
}

function requireSock(channelId: string): WASocket {
  const sock = sessions.get(channelId)?.sock;
  if (!sock?.user)
    throw new Error('WhatsApp is not connected. Open Integrations → Channels and reconnect it');
  return sock;
}

export async function sendText(channelId: string, jid: string, text: string): Promise<string> {
  const res = await requireSock(channelId).sendMessage(jid, { text });
  rememberSent(res?.key.id, res?.message);
  return res?.key.id ?? '';
}

export async function sendTyping(channelId: string, jid: string) {
  const sock = requireSock(channelId);
  await sock.presenceSubscribe(jid).catch(() => null);
  await sock.sendPresenceUpdate('composing', jid);
}

/** Close the socket but keep credentials (used on shutdown). */
async function stopSession(channelId: string) {
  const s = sessions.get(channelId);
  if (!s) return;
  s.stopping = true;
  if (s.timer) clearTimeout(s.timer);
  s.sock?.end(undefined);
  s.sock = null;
  sessions.delete(channelId);
}

/** Log out from WhatsApp and wipe credentials. */
export async function logoutSession(channelId: string, userId: string) {
  const s = sessions.get(channelId);
  if (s) {
    s.stopping = true;
    if (s.timer) clearTimeout(s.timer);
    await s.sock?.logout().catch(() => null);
    s.sock?.end(undefined);
    sessions.delete(channelId);
  }
  await rm(sessionDir(userId, channelId), { recursive: true, force: true });
}

/** Restore sessions that were connected before the last shutdown. */
export async function bootSessions() {
  if (!env.BAILEYS_ENABLED) return;
  await mkdir(path.resolve(env.WA_SESSIONS_DIR), { recursive: true, mode: 0o700 }).catch(() => undefined);
  await checkSessionsDirPermissions(path.resolve(env.WA_SESSIONS_DIR));
  const channels = await prisma.channel.findMany({
    where: { type: 'WHATSAPP_QR', status: { in: ['CONNECTED', 'CONNECTING'] } },
  });
  for (const c of channels) {
    try {
      await access(path.join(sessionDir(c.userId, c.id), 'creds.json'));
    } catch {
      await setStatus(c.id, {
        status: 'DISCONNECTED',
        lastError: 'Session not found on disk. Scan the QR code again.',
      });
      continue;
    }
    startSession(c.id, c.userId).catch((err) =>
      logger.error({ err, channelId: c.id }, 'failed to restore WhatsApp session'),
    );
  }
  logger.info({ count: channels.length }, 'restoring WhatsApp QR sessions');
}

export async function stopAllSessions() {
  await Promise.all([...sessions.keys()].map(stopSession));
}
