import type { EmailTokenType } from '@prisma/client';
import { prisma } from '../db/client.js';
import { randomToken, sha256 } from '../lib/crypto.js';

const TTL_MS: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 24 * 3600_000,
  RESET_PASSWORD: 3600_000,
};

/** Creates a single-use token (stored hashed) and invalidates older unused tokens of the same type. */
export async function createEmailToken(userId: string, type: EmailTokenType): Promise<string> {
  const raw = randomToken(32);
  await prisma.$transaction([
    prisma.emailToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.emailToken.create({
      data: { userId, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + TTL_MS[type]) },
    }),
  ]);
  return raw;
}

/** Atomically marks a valid token as used. Returns the userId, or null if invalid/expired/used. */
export async function consumeEmailToken(raw: string, type: EmailTokenType): Promise<string | null> {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const claimed = await prisma.emailToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? row.userId : null;
}
