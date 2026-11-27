import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MessageDTO } from '@cowork/shared';
import {
  appointmentUpdateSchema,
  contactUpdateSchema,
  normalizePhone,
  paginationSchema,
  scheduleSchema,
} from '@cowork/shared';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest, notFound, paymentRequired } from '../lib/errors.js';
import { toConversationDTO } from '../services/dto.js';
import { openCloudConversation, sendOwnerReply, sendOwnerTemplate } from '../services/pipeline.js';
import { plan } from '../services/plans.js';

const idParam = z.object({ id: z.string().min(1) });

/** Conversations, appointments, leads, learning (memory), logs and schedules for the tenant. */
export async function inboxRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // ---------------- Conversations ----------------
  app.get('/conversations', async (req) => {
    const q = parse(
      z.object({
        channel: z.enum(['ALL', 'TELEGRAM', 'WHATSAPP']).default('ALL'),
        search: z.string().trim().max(100).optional(),
        cursor: z.string().optional(),
      }),
      req.query,
    );
    const rows = await req.db.conversation.findMany({
      where: {
        ...(q.channel === 'TELEGRAM' ? { channel: { type: 'TELEGRAM' } } : {}),
        ...(q.channel === 'WHATSAPP' ? { channel: { type: { in: ['WHATSAPP_QR', 'WHATSAPP_CLOUD'] } } } : {}),
        ...(q.search
          ? {
              OR: [
                { contact: { name: { contains: q.search, mode: 'insensitive' } } },
                { contact: { phone: { contains: q.search } } },
                { lastMessage: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { contact: true, channel: true },
      orderBy: { lastMessageAt: 'desc' },
      take: 40,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });
    return {
      conversations: rows.map(toConversationDTO),
      nextCursor: rows.length === 40 ? rows[rows.length - 1]!.id : null,
    };
  });

  app.get('/conversations/:id/messages', async (req) => {
    const { id } = parse(idParam, req.params);
    const convo = await req.db.conversation.findFirst({
      where: { id },
      include: { contact: true, channel: true },
    });
    if (!convo) throw notFound('Conversation not found');
    const messages = await req.db.message.findMany({
      where: { conversationId: id, NOT: { content: { startsWith: '[memory]' } } },
      orderBy: { createdAt: 'desc' }, // the newest 300, shown oldest first
      take: 300,
    });
    messages.reverse();
    const dto: MessageDTO[] = messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      role: m.role,
      content: m.content,
      status: m.status,
      error: m.direction === 'OUT' ? m.error : null,
      createdAt: m.createdAt.toISOString(),
      toolCalls: (m.toolCalls as { name: string; ok: boolean }[] | null) ?? null,
    }));
    return {
      conversation: toConversationDTO(convo),
      summary: convo.summary,
      contact: { profile: convo.contact.profile, summary: convo.contact.summary },
      messages: dto,
    };
  });

  app.post(
    '/conversations/:id/reply',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }), req.body);
      const convo = await req.db.conversation.findFirst({ where: { id } });
      if (!convo) throw notFound('Conversation not found');
      try {
        await sendOwnerReply(id, user(req).id, text);
      } catch (err) {
        throw badRequest(`Could not send: ${(err as Error).message}`);
      }
      return { ok: true };
    },
  );

  app.post(
    '/conversations/:id/template',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const input = parse(
        z.object({
          templateId: z.string().min(1),
          params: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
        }),
        req.body,
      );
      const u = user(req);
      if (!plan(u.plan).limits.templates)
        throw paymentRequired('WhatsApp templates are part of the Growth plan. Upgrade to use them.');
      const convo = await req.db.conversation.findFirst({ where: { id } });
      if (!convo) throw notFound('Conversation not found');
      try {
        await sendOwnerTemplate(id, u.id, input.templateId, input.params);
      } catch (err) {
        throw badRequest(`Could not send: ${(err as Error).message}`);
      }
      return { ok: true };
    },
  );

  /** Message a number that has not chatted yet: WhatsApp requires a template first. */
  app.post(
    '/conversations/start',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const input = parse(
        z.object({
          channelId: z.string().min(1),
          phone: z.string().trim().min(8).max(25),
          templateId: z.string().min(1),
          params: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
        }),
        req.body,
      );
      const u = user(req);
      if (!plan(u.plan).limits.templates)
        throw paymentRequired('WhatsApp templates are part of the Growth plan. Upgrade to use them.');
      const channel = await req.db.channel.findFirst({
        where: { id: input.channelId, type: 'WHATSAPP_CLOUD' },
      });
      if (!channel) throw notFound('WhatsApp Business API channel not found');
      let phone = normalizePhone(input.phone).replace(/^0+/, '');
      if (phone.length === 10) phone = `91${phone}`; // Indian number without country code
      if (phone.length < 8 || phone.length > 15)
        throw badRequest('Enter the number with country code, e.g. 919876543210');
      const convo = await openCloudConversation(channel, phone);
      try {
        await sendOwnerTemplate(convo.id, u.id, input.templateId, input.params);
      } catch (err) {
        throw badRequest(`Could not send: ${(err as Error).message}`);
      }
      return { conversationId: convo.id };
    },
  );

  /** Block or unblock a customer from AI replies (audit H2). */
  app.patch('/contacts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const { blocked } = parse(contactUpdateSchema, req.body);
    const res = await req.db.contact.updateMany({
      where: { id },
      data: { blockedAt: blocked ? new Date() : null },
    });
    if (!res.count) throw notFound('Contact not found');
    return { ok: true, blocked };
  });

  // ---------------- Appointments & leads ----------------
  app.get('/appointments', async (req) => {
    const q = parse(z.object({ scope: z.enum(['upcoming', 'past', 'all']).default('upcoming') }), req.query);
    const now = new Date();
    const appointments = await req.db.appointment.findMany({
      where:
        q.scope === 'upcoming'
          ? { startsAt: { gte: now } }
          : q.scope === 'past'
            ? { startsAt: { lt: now } }
            : {},
      orderBy: { startsAt: q.scope === 'past' ? 'desc' : 'asc' },
      take: 200,
    });
    return { appointments };
  });

  app.patch('/appointments/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const { status } = parse(appointmentUpdateSchema, req.body);
    const res = await req.db.appointment.updateMany({ where: { id }, data: { status } });
    if (!res.count) throw notFound('Appointment not found');
    return { ok: true };
  });

  app.get('/leads', async (req) => {
    const leads = await req.db.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return { leads };
  });

  // ---------------- Learning (customer memory) ----------------
  app.get('/learning', async (req) => {
    const { page, pageSize } = parse(paginationSchema, req.query);
    const where = { OR: [{ summary: { not: '' } }, { NOT: { profile: { equals: {} } } }] };
    const [items, total, contacts] = await Promise.all([
      req.db.contact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          conversations: {
            select: { id: true, summary: true, lastMessageAt: true },
            orderBy: { lastMessageAt: 'desc' },
            take: 1,
          },
        },
      }),
      req.db.contact.count({ where }),
      req.db.contact.count(),
    ]);
    return {
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        channelType: c.channelType,
        profile: c.profile,
        summary: c.summary,
        messageCount: c.messageCount,
        lastSeenAt: c.lastSeenAt,
        conversation: c.conversations[0] ?? null,
      })),
      total,
      totalContacts: contacts,
      page,
      pageSize,
    };
  });

  app.delete('/learning/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const res = await req.db.contact.updateMany({ where: { id }, data: { profile: {}, summary: '' } });
    if (!res.count) throw notFound('Contact not found');
    return { ok: true };
  });

  // ---------------- Logs ----------------
  app.get('/logs', async (req) => {
    const q = parse(
      z.object({
        level: z.enum(['ALL', 'INFO', 'WARN', 'ERROR']).default('ALL'),
        page: z.coerce.number().int().min(1).default(1),
      }),
      req.query,
    );
    const where = q.level === 'ALL' ? {} : { level: q.level };
    const [items, total] = await Promise.all([
      req.db.eventLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 50, take: 50 }),
      req.db.eventLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: 50 };
  });

  // ---------------- Schedules ----------------
  app.get('/schedules', async (req) => {
    const schedules = await req.db.schedule.findMany({
      orderBy: { nextRunAt: 'asc' },
      include: { channel: { select: { name: true, type: true } } },
    });
    return { schedules };
  });

  app.post('/schedules', async (req, reply) => {
    const input = parse(scheduleSchema, req.body);
    const channel = await req.db.channel.findFirst({ where: { id: input.channelId } });
    if (!channel) throw badRequest('Choose one of your channels');
    if (input.runAt.getTime() < Date.now() - 60_000) throw badRequest('Pick a time in the future');
    const count = await req.db.schedule.count();
    if (count >= 50) throw badRequest('You can have up to 50 schedules');
    const schedule = await req.db.schedule.create({
      data: {
        name: input.name,
        channelId: input.channelId,
        recipient: input.recipient,
        message: input.message,
        frequency: input.frequency,
        nextRunAt: input.runAt,
        enabled: input.enabled,
      } as never,
    });
    return reply.code(201).send({ schedule });
  });

  app.patch('/schedules/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    const res = await req.db.schedule.updateMany({ where: { id }, data: { enabled } });
    if (!res.count) throw notFound('Schedule not found');
    return { ok: true };
  });

  app.delete('/schedules/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const res = await req.db.schedule.deleteMany({ where: { id } });
    if (!res.count) throw notFound('Schedule not found');
    return { ok: true };
  });
}
