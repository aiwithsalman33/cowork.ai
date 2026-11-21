/**
 * Razorpay subscriptions (INR). Verified against razorpay@2.9.8 types:
 *  - subscriptions.create({ plan_id, total_count, customer_notify, notes }) → { id, status, short_url, current_end }
 *  - subscriptions.cancel(id, cancelAtCycleEnd)
 *  - webhooks: X-Razorpay-Signature = HMAC-SHA256(webhookSecret, rawBody); X-Razorpay-Event-Id for idempotency
 * Plans are created once in the Razorpay Dashboard; their ids come from env.
 */
import Razorpay from 'razorpay';
import type { Plan, Prisma } from '@prisma/client';
import { env } from '../config.js';
import { prisma } from '../db/client.js';
import { hmacSha256Hex, safeEqual } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { logEvent } from '../services/audit.js';

let client: Razorpay | null = null;

export function razorpayConfigured() {
  return !!(
    env.RAZORPAY_KEY_ID &&
    env.RAZORPAY_KEY_SECRET &&
    env.RAZORPAY_PLAN_STARTER &&
    env.RAZORPAY_PLAN_GROWTH
  );
}

function rzp(): Razorpay {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new Error('Razorpay is not configured');
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

const PLAN_IDS: Record<'STARTER' | 'GROWTH', string | undefined> = {
  STARTER: env.RAZORPAY_PLAN_STARTER,
  GROWTH: env.RAZORPAY_PLAN_GROWTH,
};

export async function createCheckout(userId: string, plan: 'STARTER' | 'GROWTH') {
  const planId = PLAN_IDS[plan];
  if (!planId) throw new Error(`No Razorpay plan id configured for ${plan}`);
  const sub = await rzp().subscriptions.create({
    plan_id: planId,
    total_count: 120, // monthly for up to 10 years; cancel any time
    customer_notify: 1,
    notes: { userId, plan },
  });
  await prisma.user.update({ where: { id: userId }, data: { pendingPlan: plan } });
  return { subscriptionId: sub.id, shortUrl: sub.short_url };
}

export async function cancelSubscription(subscriptionId: string) {
  await rzp().subscriptions.cancel(subscriptionId, true); // at end of the paid cycle
}

export function verifyWebhook(rawBody: Buffer | undefined, signature: string | undefined): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !rawBody || !signature) return false;
  return safeEqual(signature, hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody));
}

interface SubEntity {
  id: string;
  status: string;
  current_end?: number | null;
  notes?: Record<string, string> | unknown[];
}

interface RazorpayEvent {
  event: string;
  payload?: { subscription?: { entity?: SubEntity } };
}

const ACTIVATING = new Set(['subscription.activated', 'subscription.charged', 'subscription.resumed']);

/** Applies a verified webhook event. Idempotent per Razorpay event id. */
export async function handleWebhook(
  eventId: string,
  body: RazorpayEvent,
): Promise<'processed' | 'duplicate' | 'ignored'> {
  const sub = body.payload?.subscription?.entity;
  const notes = (sub && !Array.isArray(sub.notes) ? sub.notes : {}) as Record<string, string>;

  let user = notes.userId ? await prisma.user.findUnique({ where: { id: notes.userId } }) : null;
  if (!user && sub) user = await prisma.user.findUnique({ where: { razorpaySubscriptionId: sub.id } });

  try {
    await prisma.billingEvent.create({
      data: {
        eventId,
        type: body.event,
        userId: user?.id ?? null,
        payload: body as unknown as Prisma.InputJsonValue,
      },
    });
  } catch {
    return 'duplicate';
  }
  if (!sub || !user) return 'ignored';

  const plan = (
    notes.plan === 'GROWTH' || notes.plan === 'STARTER' ? notes.plan : (user.pendingPlan ?? user.plan)
  ) as Plan;
  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000) : null;

  if (ACTIVATING.has(body.event) || body.event === 'subscription.authenticated') {
    const previous =
      user.razorpaySubscriptionId && user.razorpaySubscriptionId !== sub.id
        ? user.razorpaySubscriptionId
        : null;
    const activating = ACTIVATING.has(body.event);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        razorpaySubscriptionId: sub.id,
        subscriptionStatus: activating ? 'active' : 'authenticated',
        ...(activating ? { plan, pendingPlan: null } : {}),
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      },
    });
    if (previous && activating) {
      // switched plans: stop billing the old subscription
      await cancelSubscription(previous).catch((err) =>
        logger.warn({ err: (err as Error).message, previous }, 'failed to cancel previous subscription'),
      );
    }
    if (body.event === 'subscription.activated') {
      await logEvent(user.id, 'INFO', 'billing.activated', `Subscription active — ${plan} plan. Thank you!`);
    }
    return 'processed';
  }

  if (sub.id !== user.razorpaySubscriptionId) return 'ignored'; // events for an old/abandoned subscription

  switch (body.event) {
    case 'subscription.pending':
      await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: 'pending' } });
      await logEvent(
        user.id,
        'WARN',
        'billing.payment_failed',
        'A subscription payment failed. Razorpay will retry — please check your payment method.',
      );
      break;
    case 'subscription.halted':
      // retries exhausted: access ends now
      await prisma.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: 'halted', currentPeriodEnd: new Date() },
      });
      await logEvent(
        user.id,
        'ERROR',
        'billing.halted',
        'Subscription halted after failed payments. Your agent has stopped replying.',
      );
      break;
    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.expired':
      // keep access until the end of the period already paid for
      await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: sub.status } });
      await logEvent(
        user.id,
        'INFO',
        'billing.cancelled',
        `Subscription ${sub.status}. Access continues until the end of the paid period.`,
      );
      break;
    default:
      return 'ignored';
  }
  return 'processed';
}
