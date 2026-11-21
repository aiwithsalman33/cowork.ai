import type { FastifyInstance } from 'fastify';
import { checkoutSchema, PLANS } from '@partner/shared';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { isPlanActive, limitsFor, messagesThisMonth } from '../services/plan.js';
import { audit } from '../services/audit.js';
import { sha256 } from '../lib/crypto.js';
import { cancelSubscription, createCheckout, handleWebhook, razorpayConfigured, verifyWebhook } from '../billing/razorpay.js';

export async function billingRoutes(app: FastifyInstance) {
  app.get('/billing', { preHandler: authenticate }, async (req) => {
    const u = user(req);
    const [messages, channels, skills, events] = await Promise.all([
      messagesThisMonth(u.id),
      req.db.channel.count(),
      req.db.userSkill.count({ where: { enabled: true } }),
      req.db.eventLog.findMany({ where: { type: { startsWith: 'billing.' } }, orderBy: { createdAt: 'desc' }, take: 10 }),
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
        messages: { used: messages, limit: limits.messagesPerMonth },
        channels: { used: channels, limit: limits.channels },
        skills: { used: skills, limit: Number.isFinite(limits.skills) ? limits.skills : null },
      },
      plans: Object.values(PLANS).map((p) => ({ ...p, limits: { ...p.limits, skills: Number.isFinite(p.limits.skills) ? p.limits.skills : null } })),
      razorpayConfigured: razorpayConfigured(),
      history: events,
    };
  });

  app.post('/billing/checkout', { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { plan } = parse(checkoutSchema, req.body);
    const u = user(req);
    if (req.auth?.impersonatorId) throw badRequest('Admins cannot start checkout while impersonating');
    if (!razorpayConfigured()) throw badRequest('Payments are not configured yet. Please contact support.');
    if (u.plan === plan && isPlanActive(u) && u.subscriptionStatus === 'active') throw badRequest(`You are already on ${PLANS[plan].name}`);
    try {
      const { shortUrl } = await createCheckout(u.id, plan);
      await audit(u.id, 'billing.checkout_started', { type: 'plan', id: plan });
      return { url: shortUrl };
    } catch (err) {
      req.log.error({ err: (err as Error).message }, 'razorpay checkout failed');
      throw badRequest('Could not start checkout with Razorpay. Please try again.');
    }
  });

  app.post('/billing/cancel', { preHandler: authenticate }, async (req) => {
    const u = user(req);
    if (!u.razorpaySubscriptionId) throw badRequest('No active subscription');
    try {
      await cancelSubscription(u.razorpaySubscriptionId);
    } catch (err) {
      req.log.error({ err: (err as Error).message }, 'razorpay cancel failed');
      throw badRequest('Could not cancel with Razorpay. Please try again.');
    }
    await audit(u.id, 'billing.cancel_requested', { type: 'subscription', id: u.razorpaySubscriptionId });
    return { ok: true };
  });
}

/** Mounted under /webhooks — not authenticated, verified by signature. */
export async function razorpayWebhookRoutes(app: FastifyInstance) {
  app.post('/razorpay', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const sig = req.headers['x-razorpay-signature'];
    if (!verifyWebhook(req.rawBody, typeof sig === 'string' ? sig : undefined)) {
      return reply.code(400).send({ error: 'invalid signature' });
    }
    const eventId = (req.headers['x-razorpay-event-id'] as string | undefined) ?? `body:${sha256(req.rawBody!.toString('utf8'))}`;
    const result = await handleWebhook(eventId, req.body as Parameters<typeof handleWebhook>[1]);
    return { ok: true, result };
  });
}
