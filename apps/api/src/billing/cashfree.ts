/**
 * Cashfree Payment Gateway: one-time payment per plan period (no auto-renewal).
 * Checked against docs.cashfree.com (2026-11):
 *  - POST {base}/pg/orders, GET {base}/pg/orders/{order_id}; headers x-client-id, x-client-secret, x-api-version
 *  - order_status: ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED  (PAID = success)
 *  - webhook headers x-webhook-signature / x-webhook-timestamp;
 *    signature = Base64(HMAC-SHA256(timestamp + rawBody, client secret))
 * A paid order is applied exactly once (Payment.status flips to PAID inside a guarded update).
 */
import { createHmac, randomBytes } from 'node:crypto';
import type { Plan } from '@prisma/client';
import { env } from '../config.js';
import { prisma } from '../db/client.js';
import { safeEqual } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { logEvent } from '../services/audit.js';
import { plan as planDef } from '../services/plans.js';

export class CashfreeError extends Error {}

export function cashfreeConfigured() {
  return !!(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY);
}

const base = () =>
  env.CASHFREE_ENV === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

async function cf<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  if (!cashfreeConfigured()) throw new CashfreeError('Cashfree is not configured');
  const res = await fetch(`${base()}${path}`, {
    method: init.method,
    headers: {
      'x-client-id': env.CASHFREE_APP_ID!,
      'x-client-secret': env.CASHFREE_SECRET_KEY!,
      'x-api-version': env.CASHFREE_API_VERSION,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new CashfreeError(data.message ?? `Cashfree error (${res.status})`);
  return data;
}

interface CfOrder {
  order_id: string;
  order_status: string;
  order_amount: number;
  payment_session_id?: string;
}

/** Creates a Cashfree order for one plan period and returns what the browser needs for checkout. */
export async function createOrder(opts: {
  userId: string;
  name: string;
  email: string;
  phone: string;
  plan: Exclude<Plan, 'TRIAL'>;
}) {
  const p = planDef(opts.plan);
  if (p.priceInr < 1) throw new CashfreeError('This plan has no price');
  const orderId = `cw_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  await prisma.payment.create({
    data: {
      userId: opts.userId,
      orderId,
      plan: opts.plan,
      amountInr: p.priceInr,
      durationDays: p.durationDays,
      status: 'CREATED',
    },
  });
  const order = await cf<CfOrder>('/orders', {
    method: 'POST',
    body: {
      order_id: orderId,
      order_amount: p.priceInr,
      order_currency: 'INR',
      customer_details: {
        customer_id: opts.userId.replace(/[^A-Za-z0-9]/g, '').slice(0, 50),
        customer_name: opts.name.slice(0, 100),
        customer_email: opts.email,
        customer_phone: opts.phone,
      },
      order_meta: {
        return_url: `${env.WEB_ORIGIN}/billing?order_id=${orderId}`,
        notify_url: `${env.PUBLIC_API_URL.replace(/^http:\/\/(?!localhost|127\.)/, 'https://')}/webhooks/cashfree`,
      },
      order_note: `${p.name} plan — ${p.durationDays} days`,
      order_tags: { userId: opts.userId, plan: opts.plan },
    },
  });
  if (!order.payment_session_id) throw new CashfreeError('Cashfree did not return a payment session');
  return { orderId, paymentSessionId: order.payment_session_id };
}

/**
 * Marks the payment PAID (once) and gives the user the plan. Paying again for the plan they
 * already have adds the days on top; a different plan starts today.
 */
export async function applyPaidOrder(orderId: string, amount: number, cfPaymentId: string | null) {
  const payment = await prisma.payment.findUnique({ where: { orderId } });
  if (!payment) return 'unknown_order';
  if (payment.status === 'PAID') return 'duplicate';
  if (Math.round(amount * 100) !== payment.amountInr * 100) {
    logger.error({ orderId, amount, expected: payment.amountInr }, 'cashfree amount mismatch');
    await prisma.payment.update({ where: { orderId }, data: { status: 'FAILED', error: 'Amount mismatch' } });
    return 'amount_mismatch';
  }
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { orderId, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: new Date(), cfPaymentId },
    });
    if (claimed.count === 0) return 'duplicate' as const;
    const u = await tx.user.findUniqueOrThrow({ where: { id: payment.userId } });
    const now = new Date();
    const from =
      u.plan === payment.plan && u.currentPeriodEnd && u.currentPeriodEnd > now ? u.currentPeriodEnd : now;
    const until = new Date(from.getTime() + payment.durationDays * 86_400_000);
    await tx.user.update({
      where: { id: u.id },
      data: { plan: payment.plan, currentPeriodEnd: until, subscriptionStatus: 'paid', pendingPlan: null },
    });
    return until;
  });
  if (result === 'duplicate') return 'duplicate';
  const name = planDef(payment.plan).name;
  await logEvent(
    payment.userId,
    'INFO',
    'billing.paid',
    `Payment of ₹${payment.amountInr} received — ${name} plan active until ${result.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
  );
  return 'processed';
}

/** Asks Cashfree for the order status (used when the customer comes back from checkout). */
export async function syncOrder(orderId: string) {
  const payment = await prisma.payment.findUnique({ where: { orderId } });
  if (!payment) return null;
  if (payment.status === 'PAID') return payment;
  const order = await cf<CfOrder>(`/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
  if (order.order_status === 'PAID') await applyPaidOrder(orderId, order.order_amount, null);
  else if (order.order_status === 'EXPIRED' || order.order_status === 'TERMINATED')
    await prisma.payment.updateMany({
      where: { orderId, status: 'CREATED' },
      data: { status: 'FAILED', error: `Order ${order.order_status.toLowerCase()}` },
    });
  return prisma.payment.findUnique({ where: { orderId } });
}

/** Webhook signature: the docs show timestamp+body (code samples) and timestamp.body (pseudocode). */
export function verifyWebhook(rawBody: Buffer | undefined, signature?: string, timestamp?: string) {
  if (!env.CASHFREE_SECRET_KEY || !rawBody || !signature || !timestamp) return false;
  // replay protection: reject notifications older/newer than 5 minutes (seconds or ms) (L2)
  const t = Number(timestamp);
  const ms = t > 1e12 ? t : t * 1000;
  if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > 300_000) return false;
  const body = rawBody.toString('utf8');
  return [`${timestamp}${body}`, `${timestamp}.${body}`].some((payload) =>
    safeEqual(signature, createHmac('sha256', env.CASHFREE_SECRET_KEY!).update(payload).digest('base64')),
  );
}

interface CfWebhook {
  type?: string;
  data?: {
    order?: { order_id?: string; order_amount?: number };
    payment?: {
      cf_payment_id?: string | number;
      payment_status?: string;
      payment_amount?: number;
      payment_message?: string;
    };
  };
}

export async function handleWebhook(body: CfWebhook) {
  const orderId = body.data?.order?.order_id;
  if (!orderId) return 'ignored';
  if (body.type === 'PAYMENT_SUCCESS_WEBHOOK' && body.data?.payment?.payment_status === 'SUCCESS') {
    const id = body.data.payment.cf_payment_id;
    return applyPaidOrder(
      orderId,
      Number(body.data.payment.payment_amount ?? body.data.order?.order_amount ?? 0),
      id === undefined ? null : String(id),
    );
  }
  if (body.type === 'PAYMENT_FAILED_WEBHOOK' || body.type === 'PAYMENT_USER_DROPPED_WEBHOOK') {
    await prisma.payment.updateMany({
      where: { orderId, status: 'CREATED' },
      data: {
        status: 'FAILED',
        error: body.data?.payment?.payment_message?.slice(0, 300) ?? 'Payment not completed',
      },
    });
    return 'failed';
  }
  return 'ignored';
}
