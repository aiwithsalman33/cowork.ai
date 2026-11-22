/**
 * WhatsApp Business API message templates: sync from Meta, create (submitted to Meta for review),
 * and choose which approved templates the AI bot may send. Growth plan only.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma, WhatsAppTemplate } from '@prisma/client';
import { z } from 'zod';
import { PLANS } from '@cowork/shared';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest, notFound, paymentRequired } from '../lib/errors.js';
import { encryptJson } from '../lib/crypto.js';
import { logEvent } from '../services/audit.js';
import { cloudConfig } from '../channels/index.js';
import * as cloud from '../channels/whatsapp-cloud.js';

const idParam = z.object({ id: z.string().min(1) });
const tplParam = z.object({ id: z.string().min(1), tplId: z.string().min(1) });

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only'),
  language: z.string().trim().min(2).max(10).default('en'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).default('UTILITY'),
  header: z.string().trim().max(60).optional(),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().max(60).optional(),
  /** sample values for {{1}}, {{2}}, … (Meta requires them for review) */
  examples: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  aiHint: z.string().trim().max(300).default(''),
});

const updateSchema = z.object({
  useInAi: z.boolean().optional(),
  aiHint: z.string().trim().max(300).optional(),
});

export function toTemplateDTO(t: WhatsAppTemplate) {
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    header: t.header,
    body: t.body,
    footer: t.footer,
    variables: t.variables,
    useInAi: t.useInAi,
    aiHint: t.aiHint,
    syncedAt: t.syncedAt.toISOString(),
  };
}

function textOf(components: cloud.MetaTemplateComponent[], type: cloud.MetaTemplateComponent['type']) {
  const c = components.find((x) => x.type === type);
  return c && (type !== 'HEADER' || c.format === 'TEXT') ? (c.text ?? null) : null;
}

export async function templateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  async function cloudChannel(req: FastifyRequest, id: string) {
    const u = user(req);
    if (!PLANS[u.plan].limits.templates) {
      throw paymentRequired('WhatsApp templates are part of the Growth plan. Upgrade to Growth to use them.');
    }
    const channel = await req.db.channel.findFirst({ where: { id, type: 'WHATSAPP_CLOUD' } });
    if (!channel) throw notFound('WhatsApp Business API channel not found');
    return { u, channel };
  }

  app.get('/channels/:id/templates', async (req) => {
    const { id } = parse(idParam, req.params);
    const { channel } = await cloudChannel(req, id);
    const templates = await req.db.whatsAppTemplate.findMany({
      where: { channelId: channel.id },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return {
      templates: templates.map(toTemplateDTO),
      hasBusinessAccountId: !!cloudConfig(channel).businessAccountId,
    };
  });

  /** Pulls every template from Meta; optional businessAccountId is saved to the channel first. */
  app.post(
    '/channels/:id/templates/sync',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const { businessAccountId } = parse(
        z.object({ businessAccountId: z.string().trim().regex(/^\d+$/).optional() }),
        req.body ?? {},
      );
      const { u, channel } = await cloudChannel(req, id);
      let cfg = cloudConfig(channel);
      if (businessAccountId && businessAccountId !== cfg.businessAccountId) {
        cfg = { ...cfg, businessAccountId };
        await req.db.channel.update({ where: { id }, data: { encryptedConfig: encryptJson(cfg) } });
      }
      let remote: cloud.MetaTemplate[];
      try {
        remote = await cloud.listTemplates(cfg);
      } catch (err) {
        throw badRequest(`Meta: ${(err as Error).message}`);
      }
      const now = new Date();
      for (const t of remote) {
        const body = textOf(t.components, 'BODY') ?? '';
        const data = {
          metaId: t.id,
          category: t.category,
          status: t.status,
          header: textOf(t.components, 'HEADER'),
          body,
          footer: textOf(t.components, 'FOOTER'),
          variables: cloud.countVariables(body),
          components: t.components as unknown as Prisma.InputJsonValue,
          syncedAt: now,
        };
        await req.db.whatsAppTemplate.upsert({
          where: { channelId_name_language: { channelId: id, name: t.name, language: t.language } },
          create: { ...data, userId: u.id, channelId: id, name: t.name, language: t.language } as never,
          update: data,
        });
      }
      // templates deleted in Meta disappear here too
      await req.db.whatsAppTemplate.deleteMany({ where: { channelId: id, syncedAt: { lt: now } } });
      await logEvent(
        u.id,
        'INFO',
        'templates.synced',
        `Synced ${remote.length} WhatsApp templates from Meta`,
      );
      const templates = await req.db.whatsAppTemplate.findMany({
        where: { channelId: id },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      });
      return { templates: templates.map(toTemplateDTO), synced: remote.length };
    },
  );

  /** Creates a template in Meta (it starts as PENDING until Meta approves it). */
  app.post(
    '/channels/:id/templates',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = parse(idParam, req.params);
      const input = parse(createSchema, req.body);
      const { u, channel } = await cloudChannel(req, id);
      const variables = cloud.countVariables(input.body);
      if (variables > input.examples.length) {
        throw badRequest(
          `Give an example value for each of the ${variables} placeholders ({{1}}, {{2}}, …).`,
        );
      }
      let res: Awaited<ReturnType<typeof cloud.createTemplate>>;
      try {
        res = await cloud.createTemplate(cloudConfig(channel), {
          ...input,
          examples: input.examples.slice(0, variables),
        });
      } catch (err) {
        throw badRequest(`Meta: ${(err as Error).message}`);
      }
      const t = await req.db.whatsAppTemplate.upsert({
        where: { channelId_name_language: { channelId: id, name: input.name, language: input.language } },
        create: {
          userId: u.id,
          channelId: id,
          metaId: res.id,
          name: input.name,
          language: input.language,
          category: res.category ?? input.category,
          status: res.status ?? 'PENDING',
          header: input.header || null,
          body: input.body,
          footer: input.footer || null,
          variables,
          aiHint: input.aiHint,
        } as never,
        update: { metaId: res.id, status: res.status ?? 'PENDING', body: input.body, variables },
      });
      await logEvent(u.id, 'INFO', 'templates.created', `Template "${input.name}" sent to Meta for review`);
      return reply.code(201).send({ template: toTemplateDTO(t) });
    },
  );

  app.patch('/channels/:id/templates/:tplId', async (req) => {
    const { id, tplId } = parse(tplParam, req.params);
    const input = parse(updateSchema, req.body);
    await cloudChannel(req, id);
    const t = await req.db.whatsAppTemplate.findFirst({ where: { id: tplId, channelId: id } });
    if (!t) throw notFound('Template not found');
    const updated = await req.db.whatsAppTemplate.update({ where: { id: tplId }, data: input });
    return { template: toTemplateDTO(updated) };
  });
}
