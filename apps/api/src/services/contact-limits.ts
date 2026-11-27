/**
 * Per-customer reply limits (audit H2): one anonymous customer cannot burn the tenant's AI budget.
 */
import type { Contact, Plan } from '@prisma/client';
import { prisma } from '../db/client.js';
import { logEvent } from './audit.js';
import { plan } from './plans.js';

export type ContactGate = { ok: true } | { ok: false; reason: 'contact_blocked' | 'contact_limit' };

export async function contactGate(userId: string, planId: Plan, contact: Contact): Promise<ContactGate> {
  if (contact.blockedAt) return { ok: false, reason: 'contact_blocked' };
  const { contactRepliesPerHour, contactRepliesPerDay } = plan(planId).limits;
  const replies = (since: number) =>
    prisma.message.count({
      where: {
        userId,
        direction: 'OUT',
        role: 'ASSISTANT',
        conversation: { contactId: contact.id },
        createdAt: { gte: new Date(Date.now() - since) },
      },
    });
  const [hour, day] = await Promise.all([replies(3_600_000), replies(86_400_000)]);
  if (hour < contactRepliesPerHour && day < contactRepliesPerDay) return { ok: true };

  // one warning per customer per day in the owner's log
  const warned = await prisma.eventLog.count({
    where: {
      userId,
      type: 'reply.contact_limit',
      createdAt: { gte: new Date(Date.now() - 86_400_000) },
      meta: { path: ['contactId'], equals: contact.id },
    },
  });
  if (!warned)
    await logEvent(
      userId,
      'WARN',
      'reply.contact_limit',
      `${contact.name ?? contact.externalId} reached the reply limit (${contactRepliesPerHour}/hour, ${contactRepliesPerDay}/day). Replies paused for them.`,
      { contactId: contact.id },
    );
  return { ok: false, reason: 'contact_limit' };
}
