import type { User, ChannelType } from '@prisma/client';
import type { PlanLimits } from '@cowork/shared';
import { plan } from './plans.js';
import { prisma } from '../db/client.js';
import { paymentRequired } from '../lib/errors.js';

type PlanUser = Pick<User, 'plan' | 'status' | 'trialEndsAt' | 'subscriptionStatus' | 'currentPeriodEnd'> & {
  /** null = waiting for admin approval (undefined is treated as approved, for plain objects in tests) */
  approvedAt?: Date | null;
};

const ACTIVE_SUB = new Set(['active', 'authenticated', 'charged']);

/** Can this tenant's agent reply right now? */
export function isPlanActive(user: PlanUser, now = new Date()): boolean {
  if (user.status !== 'ACTIVE') return false;
  if (user.approvedAt === null) return false;
  if (user.plan === 'TRIAL') return !!user.trialEndsAt && user.trialEndsAt > now;
  if (user.currentPeriodEnd && user.currentPeriodEnd > now) return true;
  return !!user.subscriptionStatus && ACTIVE_SUB.has(user.subscriptionStatus);
}

export function limitsFor(user: Pick<User, 'plan'>): PlanLimits {
  return plan(user.plan).limits;
}

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function messagesThisMonth(userId: string): Promise<number> {
  return prisma.message.count({
    where: { userId, direction: 'OUT', role: 'ASSISTANT', createdAt: { gte: monthStart() } },
  });
}

export async function assertCanAddChannel(user: Pick<User, 'id' | 'plan'>, type: ChannelType) {
  const limits = limitsFor(user);
  if (!limits.channelTypes.includes(type)) {
    const label = {
      TELEGRAM: 'Telegram',
      WHATSAPP_QR: 'WhatsApp (QR)',
      WHATSAPP_CLOUD: 'WhatsApp Business API',
    }[type];
    throw paymentRequired(
      user.plan === 'TRIAL'
        ? `The free trial includes Telegram only. Purchase a plan to use ${label}.`
        : `${label} is not included in the ${plan(user.plan).name} plan. Upgrade your plan to use it.`,
    );
  }
  const channels = await prisma.channel.findMany({ where: { userId: user.id }, select: { type: true } });
  if (channels.length >= limits.channels) {
    throw paymentRequired(
      `Your ${plan(user.plan).name} plan allows ${limits.channels} channels. Upgrade to add more.`,
    );
  }
  if (type === 'WHATSAPP_QR') {
    const qr = channels.filter((c) => c.type === 'WHATSAPP_QR').length;
    if (qr >= limits.whatsappSessions) {
      throw paymentRequired(
        `Your ${plan(user.plan).name} plan allows ${limits.whatsappSessions} WhatsApp QR session(s). Upgrade to add more.`,
      );
    }
  }
}

export async function assertCanEnableSkill(user: Pick<User, 'id' | 'plan'>) {
  const limits = limitsFor(user);
  if (!Number.isFinite(limits.skills)) return;
  const enabled = await prisma.userSkill.count({ where: { userId: user.id, enabled: true } });
  if (enabled >= limits.skills) {
    throw paymentRequired(
      `Your ${plan(user.plan).name} plan allows ${limits.skills} active skills. Upgrade for more.`,
    );
  }
}

export type ReplyGate =
  { ok: true } | { ok: false; reason: 'plan_inactive' | 'message_limit' | 'agent_paused' };

/** Checked by the message worker before every AI reply. */
export async function canReply(
  user: PlanUser & { id: string; plan: User['plan'] },
  agentActive: boolean,
): Promise<ReplyGate> {
  if (!isPlanActive(user)) return { ok: false, reason: 'plan_inactive' };
  if (!agentActive) return { ok: false, reason: 'agent_paused' };
  const used = await messagesThisMonth(user.id);
  if (used >= limitsFor(user).messagesPerMonth) return { ok: false, reason: 'message_limit' };
  return { ok: true };
}
