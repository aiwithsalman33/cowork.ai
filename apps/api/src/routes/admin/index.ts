import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  adminUserQuerySchema,
  adminUserUpdateSchema,
  featureFlagSchema,
  paginationSchema,
  planUpdateSchema,
  PLAN_IDS,
  PLANS,
  planToJSON,
  type PlanId,
  skillUpsertSchema,
} from '@cowork/shared';
import { prisma } from '../../db/client.js';
import { requireAdmin, user } from '../../plugins/auth.js';
import { parse } from '../../lib/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { issueSession } from '../../auth/session.js';
import { audit } from '../../services/audit.js';
import { isPlanActive, messagesThisMonth } from '../../services/plan.js';
import { allPlansJSON, plan, refreshPlans, trialMs } from '../../services/plans.js';
import { invalidateFlags } from '../../services/flags.js';
import { toMeDTO } from '../../services/me.js';
import { logoutSession } from '../../channels/baileys.js';
import { servicesFromScopes } from '../../integrations/google.js';
import { accountApprovedEmail, mailConfigured, sendMail } from '../../lib/mailer.js';
import { env } from '../../config.js';
import { logEvent } from '../../services/audit.js';

const idParam = z.object({ id: z.string().min(1) });

function daysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  // ---------------- Overview ----------------
  app.get('/overview', async () => {
    const since30 = daysAgo(29);
    const since7 = daysAgo(6);
    const [
      users,
      byPlan,
      newThisWeek,
      connectedChannelUsers,
      msgsPerDay,
      signupsPerDay,
      msgs7,
      errors7,
      tokens30,
      paidUsers,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.user.groupBy({ by: ['plan'], where: { role: 'USER' }, _count: true }),
      prisma.user.count({ where: { role: 'USER', createdAt: { gte: since7 } } }),
      prisma.channel.findMany({
        where: { status: 'CONNECTED' },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.$queryRaw<{ day: Date; inbound: bigint; outbound: bigint; tokens: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               COUNT(*) FILTER (WHERE direction = 'IN') AS inbound,
               COUNT(*) FILTER (WHERE direction = 'OUT' AND role = 'ASSISTANT') AS outbound,
               COALESCE(SUM("tokensIn" + "tokensOut"), 0) AS tokens
        FROM "Message" WHERE "createdAt" >= ${since30}
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
        FROM "User" WHERE "createdAt" >= ${since30} AND role = 'USER'
        GROUP BY 1 ORDER BY 1`,
      prisma.message.count({ where: { createdAt: { gte: since7 }, direction: 'IN' } }),
      prisma.message.count({ where: { createdAt: { gte: since7 }, direction: 'IN', status: 'FAILED' } }),
      prisma.message.aggregate({
        where: { createdAt: { gte: since30 } },
        _sum: { tokensIn: true, tokensOut: true },
      }),
      prisma.user.findMany({
        where: { role: 'USER', plan: { in: ['STARTER', 'GROWTH'] } },
        select: {
          plan: true,
          status: true,
          trialEndsAt: true,
          subscriptionStatus: true,
          currentPeriodEnd: true,
        },
      }),
    ]);

    const activeIds = new Set(connectedChannelUsers.map((c) => c.userId));
    const activeAgentUsers = activeIds.size
      ? await prisma.user.findMany({
          where: { id: { in: [...activeIds] } },
          select: {
            plan: true,
            status: true,
            trialEndsAt: true,
            subscriptionStatus: true,
            currentPeriodEnd: true,
          },
        })
      : [];
    const mrr = paidUsers.filter((u) => isPlanActive(u)).reduce((s, u) => s + plan(u.plan).priceInr, 0);

    // fill missing days with zeros for charts
    const days: string[] = [];
    for (let i = 29; i >= 0; i--) days.push(daysAgo(i).toISOString().slice(0, 10));
    const msgMap = new Map(msgsPerDay.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));
    const signupMap = new Map(
      signupsPerDay.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.count)]),
    );

    return {
      kpis: {
        users,
        pendingApprovals: await prisma.user.count({
          where: { role: 'USER', approvedAt: null, emailVerifiedAt: { not: null } },
        }),
        newThisWeek,
        mrr,
        activeAgents: activeAgentUsers.filter((u) => isPlanActive(u)).length,
        messages7d: msgs7,
        errorRate: msgs7 ? Math.round((errors7 / msgs7) * 1000) / 10 : 0,
        tokens30d: (tokens30._sum.tokensIn ?? 0) + (tokens30._sum.tokensOut ?? 0),
      },
      plans: byPlan.map((p) => ({ plan: p.plan, count: p._count })),
      series: days.map((d) => ({
        day: d,
        inbound: Number(msgMap.get(d)?.inbound ?? 0),
        outbound: Number(msgMap.get(d)?.outbound ?? 0),
        tokens: Number(msgMap.get(d)?.tokens ?? 0),
        signups: signupMap.get(d) ?? 0,
      })),
      mailConfigured: mailConfigured(),
    };
  });

  // ---------------- Users ----------------
  app.get('/users', async (req) => {
    const q = parse(adminUserQuerySchema, req.query);
    const where: Prisma.UserWhereInput = {
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { name: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q.plan ? { plan: q.plan } : {}),
      ...(q.status === 'PENDING'
        ? { approvedAt: null, role: 'USER' as const }
        : q.status
          ? { status: q.status }
          : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          _count: { select: { channels: true, messages: true } },
          agent: { select: { businessName: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return {
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        businessName: u.agent?.businessName ?? '',
        role: u.role,
        status: u.status,
        emailVerified: !!u.emailVerifiedAt,
        approved: u.role === 'ADMIN' || !!u.approvedAt,
        plan: u.plan,
        planActive: isPlanActive(u),
        trialEndsAt: u.trialEndsAt,
        subscriptionStatus: u.subscriptionStatus,
        channels: u._count.channels,
        messages: u._count.messages,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.get('/users/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const u = await prisma.user.findUnique({
      where: { id },
      include: {
        agent: true,
        channels: true,
        apiKeys: { select: { provider: true, model: true, last4: true, updatedAt: true } },
        googleConnection: { select: { email: true, status: true, scopes: true, connectedAt: true } },
        agentSheets: { select: { name: true, purpose: true } },
      },
    });
    if (!u) throw notFound('User not found');
    const [monthMessages, tokens, totalMessages, contacts, errors, logs, skills] = await Promise.all([
      messagesThisMonth(id),
      prisma.message.aggregate({ where: { userId: id }, _sum: { tokensIn: true, tokensOut: true } }),
      prisma.message.count({ where: { userId: id } }),
      prisma.contact.count({ where: { userId: id } }),
      prisma.eventLog.findMany({
        where: { userId: id, level: 'ERROR' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.eventLog.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.userSkill.count({ where: { userId: id, enabled: true } }),
    ]);
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        plan: u.plan,
        planActive: isPlanActive(u),
        trialEndsAt: u.trialEndsAt,
        subscriptionStatus: u.subscriptionStatus,
        razorpaySubscriptionId: u.razorpaySubscriptionId,
        currentPeriodEnd: u.currentPeriodEnd,
        bossNumbers: u.bossNumbers,
        emailVerified: !!u.emailVerifiedAt,
        approved: u.role === 'ADMIN' || !!u.approvedAt,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      },
      agent: u.agent
        ? {
            name: u.agent.name,
            businessName: u.agent.businessName,
            provider: u.agent.provider,
            model: u.agent.model,
            isActive: u.agent.isActive,
          }
        : null,
      channels: u.channels.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        status: c.status,
        externalId: c.externalId,
        lastError: c.lastError,
        createdAt: c.createdAt,
      })),
      apiKeys: u.apiKeys,
      google: u.googleConnection
        ? {
            email: u.googleConnection.email,
            status: u.googleConnection.status,
            services: servicesFromScopes(u.googleConnection.scopes),
          }
        : null,
      sheets: u.agentSheets,
      usage: {
        monthMessages,
        totalMessages,
        contacts,
        skills,
        tokens: (tokens._sum.tokensIn ?? 0) + (tokens._sum.tokensOut ?? 0),
      },
      errors,
      logs,
    };
  });

  app.patch('/users/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(adminUserUpdateSchema, req.body);
    const admin = user(req);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('User not found');
    if (id === admin.id && (input.status === 'SUSPENDED' || input.role === 'USER'))
      throw badRequest('You cannot suspend or demote yourself');

    const data: Prisma.UserUpdateInput = {};
    if (input.status) data.status = input.status;
    if (input.role) data.role = input.role;
    if (input.plan) {
      data.plan = input.plan;
      if (input.plan === 'TRIAL') data.trialEndsAt = new Date(Date.now() + trialMs());
      // manual plan grant by admin: 30 days of access unless a live subscription manages it
      else if (!target.razorpaySubscriptionId || target.subscriptionStatus !== 'active')
        data.currentPeriodEnd = new Date(Date.now() + plan(input.plan).durationDays * 86400_000);
    }
    if (input.verifyEmail && !target.emailVerifiedAt) data.emailVerifiedAt = new Date();
    const approving = input.approve && !target.approvedAt;
    if (approving) {
      data.approvedAt = new Date();
      data.emailVerifiedAt = target.emailVerifiedAt ?? new Date();
      // the free trial starts when access is granted
      if (target.plan === 'TRIAL' && !input.extendTrialHours)
        data.trialEndsAt = new Date(Date.now() + trialMs());
    }
    if (input.extendTrialHours) {
      const base = target.trialEndsAt && target.trialEndsAt > new Date() ? target.trialEndsAt : new Date();
      data.trialEndsAt = new Date(base.getTime() + input.extendTrialHours * 3600_000);
      if (!input.plan) data.plan = 'TRIAL';
    }
    const updated = await prisma.user.update({ where: { id }, data });
    if (input.status === 'SUSPENDED') {
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await audit(
      admin.id,
      approving ? 'user.approve' : 'user.update',
      { type: 'user', id },
      { ...input, email: target.email },
      req.ip,
    );
    if (approving) {
      await logEvent(id, 'INFO', 'account.approved', 'Your account was approved — free trial started');
      await sendMail(accountApprovedEmail(target.email, target.name, `${env.WEB_ORIGIN}/login`)).catch(
        (err) => req.log.warn({ err: (err as Error).message }, 'approval email failed'),
      );
    }
    return {
      ok: true,
      user: { id: updated.id, plan: updated.plan, status: updated.status, trialEndsAt: updated.trialEndsAt },
    };
  });

  /** "Login as": issues a session for the target user that remembers the admin. */
  app.post(
    '/users/:id/impersonate',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = parse(idParam, req.params);
      const admin = user(req);
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) throw notFound('User not found');
      if (target.role === 'ADMIN') throw badRequest('Cannot impersonate another admin');
      await issueSession(req, reply, target, { impersonatorId: admin.id });
      await audit(admin.id, 'user.impersonate', { type: 'user', id }, { email: target.email }, req.ip);
      return { user: await toMeDTO(target, admin.id) };
    },
  );

  app.delete('/users/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const admin = user(req);
    if (id === admin.id) throw badRequest('You cannot delete yourself');
    const target = await prisma.user.findUnique({
      where: { id },
      include: { channels: { where: { type: 'WHATSAPP_QR' } } },
    });
    if (!target) throw notFound('User not found');
    for (const c of target.channels) await logoutSession(c.id, id).catch(() => null);
    await prisma.user.delete({ where: { id } });
    await audit(admin.id, 'user.delete', { type: 'user', id }, { email: target.email }, req.ip);
    return { ok: true };
  });

  // ---------------- Global skill library ----------------
  app.get('/skills', async () => {
    const skills = await prisma.skill.findMany({
      where: { authorId: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { userSkills: { where: { enabled: true } } } } },
    });
    return { skills: skills.map(({ _count, ...s }) => ({ ...s, activeUsers: _count.userSkills })) };
  });

  app.post('/skills', async (req, reply) => {
    const input = parse(skillUpsertSchema, req.body);
    if (await prisma.skill.findUnique({ where: { slug: input.slug } }))
      throw conflict('A skill with this slug exists');
    const skill = await prisma.skill.create({ data: { ...input, isBuiltin: true } });
    await audit(
      user(req).id,
      'skill.create',
      { type: 'skill', id: skill.id },
      { slug: skill.slug, isPublic: skill.isPublic },
      req.ip,
    );
    return reply.code(201).send({ skill });
  });

  app.put('/skills/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(skillUpsertSchema, req.body);
    const existing = await prisma.skill.findFirst({ where: { id, authorId: null } });
    if (!existing) throw notFound('Skill not found');
    if (input.slug !== existing.slug && (await prisma.skill.findUnique({ where: { slug: input.slug } })))
      throw conflict('Slug in use');
    const skill = await prisma.skill.update({ where: { id }, data: input });
    await audit(
      user(req).id,
      existing.isPublic !== skill.isPublic
        ? skill.isPublic
          ? 'skill.publish'
          : 'skill.unpublish'
        : 'skill.update',
      { type: 'skill', id },
      { slug: skill.slug },
      req.ip,
    );
    return { skill };
  });

  app.delete('/skills/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const existing = await prisma.skill.findFirst({ where: { id, authorId: null } });
    if (!existing) throw notFound('Skill not found');
    await prisma.skill.delete({ where: { id } });
    await audit(user(req).id, 'skill.delete', { type: 'skill', id }, { slug: existing.slug }, req.ip);
    return { ok: true };
  });

  // ---------------- Plans ----------------
  const planParam = z.object({ id: z.enum(PLAN_IDS) });

  app.get('/plans', async () => {
    const counts = await prisma.user.groupBy({ by: ['plan'], where: { role: 'USER' }, _count: true });
    const custom = await prisma.planSetting.findMany({ select: { plan: true, updatedAt: true } });
    return {
      plans: allPlansJSON().map((p) => ({
        ...p,
        users: counts.find((c) => c.plan === p.id)?._count ?? 0,
        customizedAt: custom.find((c) => c.plan === p.id)?.updatedAt ?? null,
      })),
    };
  });

  app.put('/plans/:id', async (req) => {
    const { id } = parse(planParam, req.params);
    const input = parse(planUpdateSchema, req.body);
    if (id === 'TRIAL' && input.priceInr !== 0) throw badRequest('The free trial must cost ₹0');
    if (id !== 'TRIAL' && input.priceInr === 0) throw badRequest('Paid plans need a price above ₹0');
    const data = { ...input, id } as unknown as Prisma.InputJsonValue;
    await prisma.planSetting.upsert({ where: { plan: id }, create: { plan: id, data }, update: { data } });
    if (input.popular)
      // only one plan is "Most popular"
      for (const other of PLAN_IDS.filter((p) => p !== id && plan(p).popular)) {
        const d = { ...planToJSON(plan(other)), popular: false } as unknown as Prisma.InputJsonValue;
        await prisma.planSetting.upsert({
          where: { plan: other },
          create: { plan: other, data: d },
          update: { data: d },
        });
      }
    await refreshPlans();
    await audit(user(req).id, 'plan.update', { type: 'plan', id }, input, req.ip);
    return { plan: planToJSON(plan(id as PlanId)) };
  });

  /** Back to the built-in defaults. */
  app.delete('/plans/:id', async (req) => {
    const { id } = parse(planParam, req.params);
    await prisma.planSetting.deleteMany({ where: { plan: id } });
    await refreshPlans();
    await audit(user(req).id, 'plan.reset', { type: 'plan', id }, undefined, req.ip);
    return { plan: planToJSON(plan(id)), defaults: planToJSON(PLANS[id]) };
  });

  // ---------------- Feature flags ----------------
  app.get('/flags', async () => ({ flags: await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }) }));

  app.put('/flags/:key', async (req) => {
    const input = parse(featureFlagSchema, {
      ...(req.body as object),
      key: (req.params as { key: string }).key,
    });
    const flag = await prisma.featureFlag.upsert({ where: { key: input.key }, create: input, update: input });
    invalidateFlags();
    await audit(
      user(req).id,
      'flag.update',
      { type: 'flag', id: flag.key },
      { enabled: flag.enabled, plans: flag.plans },
      req.ip,
    );
    return { flag };
  });

  app.delete('/flags/:key', async (req) => {
    const { key } = parse(z.object({ key: z.string().min(1) }), req.params);
    await prisma.featureFlag.deleteMany({ where: { key } });
    invalidateFlags();
    await audit(user(req).id, 'flag.delete', { type: 'flag', id: key }, undefined, req.ip);
    return { ok: true };
  });

  // ---------------- Audit log ----------------
  app.get('/audit', async (req) => {
    const { page, pageSize } = parse(paginationSchema, req.query);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { email: true } } },
      }),
      prisma.auditLog.count(),
    ]);
    return { items, total, page, pageSize };
  });

  // ---------------- Integration requests ----------------
  app.get('/integration-requests', async () => {
    const items = await prisma.integrationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { email: true, name: true } } },
    });
    return { items };
  });

  app.patch('/integration-requests/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const { status } = parse(z.object({ status: z.enum(['OPEN', 'PLANNED', 'DONE', 'DECLINED']) }), req.body);
    await prisma.integrationRequest.update({ where: { id }, data: { status } });
    await audit(
      user(req).id,
      'integration_request.update',
      { type: 'integration_request', id },
      { status },
      req.ip,
    );
    return { ok: true };
  });

  // ---------------- Contact form (landing page) ----------------
  app.get('/contact-messages', async (req) => {
    const { page, pageSize } = parse(paginationSchema, req.query);
    const [items, total] = await Promise.all([
      prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contactMessage.count(),
    ]);
    return { items, total, page, pageSize };
  });
}
