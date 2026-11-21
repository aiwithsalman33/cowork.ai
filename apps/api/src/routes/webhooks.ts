import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { safeEqual } from '../lib/crypto.js';
import { parse } from '../lib/validate.js';
import { normalizeUpdate, type TelegramUpdate } from '../channels/telegram.js';
import { parseWebhook, verifySignature } from '../channels/whatsapp-cloud.js';
import { cloudConfig } from '../channels/index.js';
import { ingestInbound } from '../services/pipeline.js';
import { logEvent } from '../services/audit.js';

const params = z.object({ channelId: z.string().min(1).max(40) });

/** Per-channel rate limit: generous for real traffic, but stops floods against one URL. */
const webhookLimit = {
  rateLimit: {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => `wh:${(req.params as { channelId?: string }).channelId ?? req.ip}`,
  },
};

export async function webhookRoutes(app: FastifyInstance) {
  // ---------------- Telegram ----------------
  app.post('/telegram/:channelId', { config: webhookLimit }, async (req, reply) => {
    const { channelId } = parse(params, req.params);
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (
      !channel ||
      channel.type !== 'TELEGRAM' ||
      typeof header !== 'string' ||
      !safeEqual(header, channel.webhookSecret)
    ) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const msg = normalizeUpdate(req.body as TelegramUpdate);
    if (msg) await ingestInbound(channel, msg);
    return { ok: true };
  });

  // ---------------- WhatsApp Cloud API ----------------
  app.get('/whatsapp/:channelId', { config: webhookLimit }, async (req, reply) => {
    const { channelId } = parse(params, req.params);
    const q = req.query as Record<string, string | undefined>;
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (
      !channel ||
      channel.type !== 'WHATSAPP_CLOUD' ||
      q['hub.mode'] !== 'subscribe' ||
      !q['hub.verify_token'] ||
      !safeEqual(q['hub.verify_token'], channel.webhookSecret)
    ) {
      return reply.code(403).send('Forbidden');
    }
    if (channel.status !== 'CONNECTED') {
      await prisma.channel.update({
        where: { id: channel.id },
        data: { status: 'CONNECTED', connectedAt: new Date(), lastError: null },
      });
      await logEvent(
        channel.userId,
        'INFO',
        'channel.connected',
        `WhatsApp Business API webhook verified for ${channel.externalId}`,
      );
    }
    return reply.type('text/plain').send(q['hub.challenge'] ?? '');
  });

  app.post('/whatsapp/:channelId', { config: webhookLimit }, async (req, reply) => {
    const { channelId } = parse(params, req.params);
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.type !== 'WHATSAPP_CLOUD') return reply.code(404).send({ error: 'not found' });
    const cfg = cloudConfig(channel);
    const sig = req.headers['x-hub-signature-256'];
    if (!verifySignature(cfg.appSecret, req.rawBody, typeof sig === 'string' ? sig : undefined)) {
      return reply.code(401).send({ error: 'invalid signature' });
    }
    for (const msg of parseWebhook(req.body, cfg.phoneNumberId)) await ingestInbound(channel, msg);
    return { ok: true };
  });
}
