import type { Frequency } from '@prisma/client';
import { prisma } from '../db/client.js';
import { sendText } from '../channels/index.js';
import { logger, scrubSecrets } from '../lib/logger.js';
import { isPlanActive } from './plan.js';
import { logEvent } from './audit.js';

export function nextRun(from: Date, frequency: Frequency): Date | null {
  if (frequency === 'ONCE') return null;
  const d = new Date(from);
  const step = frequency === 'DAILY' ? 1 : 7;
  do d.setDate(d.getDate() + step);
  while (d <= new Date());
  return d;
}

/** WhatsApp/Telegram recipient id: Telegram chat id as-is, WhatsApp numbers as digits (+ @s.whatsapp.net for QR). */
export function recipientFor(type: string, raw: string): string {
  if (type === 'TELEGRAM') return raw.trim();
  const digits = raw.replace(/\D/g, '');
  return type === 'WHATSAPP_QR' ? `${digits}@s.whatsapp.net` : digits;
}

/** Runs every minute from the queue tick. Claims each schedule atomically so a run never repeats. */
export async function runDueSchedules(now = new Date()) {
  const due = await prisma.schedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    include: { channel: true, user: true },
    take: 50,
  });
  for (const s of due) {
    const upcoming = nextRun(s.nextRunAt, s.frequency);
    const claimed = await prisma.schedule.updateMany({
      where: { id: s.id, nextRunAt: s.nextRunAt },
      data: { lastRunAt: now, ...(upcoming ? { nextRunAt: upcoming } : { enabled: false }) },
    });
    if (claimed.count === 0) continue;
    if (!isPlanActive(s.user)) {
      await prisma.schedule.update({ where: { id: s.id }, data: { lastError: 'Skipped: plan inactive' } });
      continue;
    }
    try {
      await sendText(s.channel, recipientFor(s.channel.type, s.recipient), s.message);
      await prisma.schedule.update({ where: { id: s.id }, data: { lastError: null } });
      await logEvent(
        s.userId,
        'INFO',
        'schedule.sent',
        `Scheduled message "${s.name}" sent to ${s.recipient}`,
      );
    } catch (err) {
      const msg = scrubSecrets((err as Error).message);
      await prisma.schedule.update({ where: { id: s.id }, data: { lastError: msg } });
      await logEvent(s.userId, 'ERROR', 'schedule.failed', `Scheduled message "${s.name}" failed: ${msg}`);
    }
  }
}

/** Logs a one-time "trial expired" event so owners see why replies stopped. */
export async function markExpiredTrials(now = new Date()) {
  const expired = await prisma.user.findMany({
    where: { plan: 'TRIAL', trialEndsAt: { lte: now, gte: new Date(now.getTime() - 10 * 60_000) } },
    select: { id: true },
  });
  for (const u of expired) {
    const already = await prisma.eventLog.findFirst({ where: { userId: u.id, type: 'trial.expired' } });
    if (!already) {
      await logEvent(
        u.id,
        'WARN',
        'trial.expired',
        'Your free trial ended. The agent has stopped replying — upgrade to resume.',
      );
      logger.info({ userId: u.id }, 'trial expired');
    }
  }
}
