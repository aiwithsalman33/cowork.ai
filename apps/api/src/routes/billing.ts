import type { FastifyInstance } from 'fastify';
import { checkoutSchema } from '@cowork/shared';
import { allPlansJSON } from '../services/plans.js';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest, HttpError, notFound } from '../lib/errors.js';
import type { Payment } from '@prisma/client';
import { z } from 'zod';
import {
  cashfreeConfigured,
  createOrder,
  handleWebhook as handleCashfree,
  syncOrder,
  verifyWebhook as verifyCashfree,
} from '../billing/cashfree.js';
import { isPlanActive, limitsFor, messagesThisMonth } from '../services/plan.js';
import { audit } from '../services/audit.js';
import { sha256 } from '../lib/crypto.js';
import { env } from '../config.js';
import { handleWebhook, verifyWebhook } from '../billing/razorpay.js';

export async function billingRoutes(app: FastifyInstance) {
  app.get('/billing', { preHandler: authenticate }, async (req) => {
    const u = user(req);
    const [messages, channels, skills, events, payments] = await Promise.all([
      messagesThisMonth(u.id),
      req.db.channel.count(),
      req.db.userSkill.count({ where: { enabled: true } }),
      req.db.eventLog.findMany({
        where: { type: { startsWith: 'billing.' } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      req.db.payment.findMany({
        where: { status: { not: 'CREATED' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const limits = limitsFor(u);
    return {
      plan: u.plan,
      planActive: isPlanActive(u),
      trialEndsAt: u.trialEndsAt,
      subscriptionStatus: u.subscriptionStatus,
      currentPeriodEnd: u.currentPeriodEnd,
      pendingPlan: u.pendingPlan,
      usage: {
        messages: {
          used: messages,
          limit: Number.isFinite(limits.messagesPerMonth) ? limits.messagesPerMonth : null,
        },
        channels: { used: channels, limit: Number.isFinite(limits.channels) ? limits.channels : null },
        skills: { used: skills, limit: Number.isFinite(limits.skills) ? limits.skills : null },
      },
      plans: allPlansJSON(),
      billingEnabled: env.BILLING_ENABLED && cashfreeConfigured(),
      history: events,
      payments: payments.map(paymentDTO),
    };
  });

  app.post(
    '/billing/checkout',
    { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { plan, phone } = parse(checkoutSchema, req.body);
      const u = user(req);
      if (req.auth?.impersonatorId) throw badRequest('Admins cannot pay while viewing as a user');
      if (!env.BILLING_ENABLED || !cashfreeConfigured()) {
        throw badRequest('Online payments are not switched on yet. Please contact us to upgrade.');
      }
      try {
        const order = await createOrder({ userId: u.id, name: u.name, email: u.email, phone, plan });
        await audit(u.id, 'billing.checkout_started', { type: 'plan', id: plan }, { orderId: order.orderId });
        return { ...order, mode: env.CASHFREE_ENV };
      } catch (err) {
        req.log.error({ err: (err as Error).message }, 'cashfree order failed');
        throw new HttpError(502, 'Could not start the payment. Please try again.', 'PAYMENT_PROVIDER');
      }
    },
  );

  /** Called when the customer returns from Cashfree; also safe to poll. */
  app.get('/billing/orders/:orderId', { preHandler: authenticate }, async (req) => {
    const { orderId } = parse(z.object({ orderId: z.string().min(3).max(45) }), req.params);
    const own = await req.db.payment.findFirst({ where: { orderId } });
    if (!own) throw notFound('Payment not found');
    let payment = own;
    try {
      payment = (await syncOrder(orderId)) ?? own;
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, 'cashfree order check failed');
    }
    return { payment: paymentDTO(payment) };
  });
}

function paymentDTO(p: Payment) {
  return {
    orderId: p.orderId,
    plan: p.plan,
    amountInr: p.amountInr,
    durationDays: p.durationDays,
    status: p.status,
    error: p.error,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  };
}

/** Cashfree payment notifications — not authenticated, verified by signature. */
export async function cashfreeWebhookRoutes(app: FastifyInstance) {
  app.post(
    '/cashfree',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const sig = req.headers['x-webhook-signature'];
      const ts = req.headers['x-webhook-timestamp'];
      if (
        !verifyCashfree(
          req.rawBody,
          typeof sig === 'string' ? sig : undefined,
          typeof ts === 'string' ? ts : undefined,
        )
      )
        return reply.code(400).send({ error: 'invalid signature' });
      const result = await handleCashfree(req.body as Parameters<typeof handleCashfree>[0]);
      return { ok: true, result };
    },
  );
}

/** Mounted under /webhooks — not authenticated, verified by signature. */
export async function razorpayWebhookRoutes(app: FastifyInstance) {
  app.post(
    '/razorpay',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const sig = req.headers['x-razorpay-signature'];
      if (!verifyWebhook(req.rawBody, typeof sig === 'string' ? sig : undefined)) {
        return reply.code(400).send({ error: 'invalid signature' });
      }
      const eventId =
        (req.headers['x-razorpay-event-id'] as string | undefined) ??
        `body:${sha256(req.rawBody!.toString('utf8'))}`;
      const result = await handleWebhook(eventId, req.body as Parameters<typeof handleWebhook>[1]);
      return { ok: true, result };
    },
  );
}
