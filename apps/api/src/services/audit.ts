import type { Prisma, LogLevel } from '@prisma/client';
import { prisma } from '../db/client.js';
import { logger, scrubSecrets } from '../lib/logger.js';

export async function audit(
  actorId: string | null,
  action: string,
  target?: { type: string; id: string } | null,
  meta?: Record<string, unknown>,
  ip?: string,
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: ip ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action }, 'failed to write audit log');
  }
}

/** Tenant-visible log line (Logs page) — also feeds admin error-rate metrics. */
export async function logEvent(
  userId: string | null,
  level: LogLevel,
  type: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  try {
    await prisma.eventLog.create({
      data: {
        userId,
        level,
        type,
        message: scrubSecrets(message).slice(0, 2000),
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    logger.error({ err, type }, 'failed to write event log');
  }
}
