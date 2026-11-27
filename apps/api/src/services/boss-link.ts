/**
 * Boss Mode identity (audit C1).
 * - WhatsApp: the owner's phone number (WhatsApp verifies the sender's number).
 * - Telegram: the owner's Telegram user id, linked with a one-time code from the web app.
 *   A phone number shared on Telegram is never trusted for Boss Mode.
 */
import { randomInt } from 'node:crypto';
import type { Channel, Contact, User } from '@prisma/client';
import { normalizePhone } from '@cowork/shared';
import { prisma } from '../db/client.js';
import { sha256 } from '../lib/crypto.js';
import { logEvent } from './audit.js';

export const LINK_CODE_TTL_MS = 10 * 60_000;
export const LINK_ATTEMPTS_PER_HOUR = 5;
// no 0/O/1/I so the code is easy to type
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LINK_COMMAND = /^\/boss(?:@\w+)?\s+([A-Za-z0-9]{4,12})\s*$/i;

/** New 6-character code; only its hash is stored. Returns the code once. */
export async function createLinkCode(userId: string) {
  const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await prisma.user.update({
    where: { id: userId },
    data: { bossLinkCodeHash: sha256(code), bossLinkCodeExpiresAt: expiresAt },
  });
  return { code, expiresAt };
}

export function isBoss(
  user: Pick<User, 'bossNumbers' | 'bossTelegramIds'>,
  channel: Channel,
  contact: Contact,
) {
  if (channel.type === 'TELEGRAM') return user.bossTelegramIds.includes(contact.externalId);
  const phone = contact.phone ? normalizePhone(contact.phone) : null;
  return !!phone && user.bossNumbers.includes(phone);
}

/** The code in a "/boss CODE" Telegram message, or null when the text is something else. */
export function linkCommand(channel: Channel, text: string): string | null {
  if (channel.type !== 'TELEGRAM') return null;
  return LINK_COMMAND.exec(text.trim())?.[1]?.toUpperCase() ?? null;
}

/** Links the Telegram chat to Boss Mode. Returns the reply to send. */
export async function linkTelegram(userId: string, chatId: string, code: string): Promise<string> {
  const failed = await prisma.eventLog.count({
    where: {
      userId,
      type: 'boss.link_failed',
      createdAt: { gte: new Date(Date.now() - 3_600_000) },
      meta: { path: ['chatId'], equals: chatId },
    },
  });
  if (failed >= LINK_ATTEMPTS_PER_HOUR) return 'Too many attempts. Please try again in an hour.';

  const now = new Date();
  // single use: the code is cleared in the same statement that checks it
  const linked = await prisma.user.updateMany({
    where: {
      id: userId,
      bossLinkCodeHash: sha256(code),
      bossLinkCodeExpiresAt: { gt: now },
    },
    data: { bossLinkCodeHash: null, bossLinkCodeExpiresAt: null },
  });
  if (linked.count === 0) {
    await logEvent(userId, 'WARN', 'boss.link_failed', 'Wrong or expired Boss Mode link code on Telegram', {
      chatId,
    });
    return 'That code is not valid or has expired. Create a new one in Agent Config → Personality.';
  }
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { bossTelegramIds: true } });
  if (!u.bossTelegramIds.includes(chatId))
    await prisma.user.update({
      where: { id: userId },
      data: { bossTelegramIds: { set: [...u.bossTelegramIds, chatId].slice(-5) } },
    });
  await logEvent(userId, 'INFO', 'boss.linked', `Telegram account ${chatId} linked to Boss Mode`);
  return '✅ Boss Mode linked. Send "help" to see what you can do.';
}
