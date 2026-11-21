import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { telegramChannelSchema, whatsappCloudChannelSchema, whatsappQrChannelSchema } from '@partner/shared';
import { env } from '../config.js';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { encryptJson, randomToken } from '../lib/crypto.js';
import { assertCanAddChannel } from '../services/plan.js';
import { isFlagEnabled } from '../services/flags.js';
import { logEvent } from '../services/audit.js';
import { toChannelDTO, webhookUrlFor } from '../services/dto.js';
import * as telegram from '../channels/telegram.js';
import * as cloud from '../channels/whatsapp-cloud.js';
import * as baileys from '../channels/baileys.js';
import { telegramToken } from '../channels/index.js';

const idParam = z.object({ id: z.string().min(1) });

export async function channelRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/channels', async (req) => {
    const channels = await req.db.channel.findMany({ orderBy: { createdAt: 'asc' } });
    return { channels: channels.map(toChannelDTO), baileysEnabled: env.BAILEYS_ENABLED };
  });

  app.post(
    '/channels/telegram',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { botToken } = parse(telegramChannelSchema, req.body);
      const u = user(req);
      await assertCanAddChannel(u, 'TELEGRAM');
      let bot: Awaited<ReturnType<typeof telegram.getMe>>;
      try {
        bot = await telegram.getMe(botToken);
      } catch {
        throw badRequest('Telegram rejected this bot token. Copy it again from @BotFather.');
      }
      const secret = randomToken(32);
      const channel = await req.db.channel.create({
        data: {
          type: 'TELEGRAM',
          name: `@${bot.username}`,
          externalId: `@${bot.username}`,
          encryptedConfig: encryptJson({ botToken }),
          webhookSecret: secret,
          status: 'CONNECTING',
        } as never,
      });
      try {
        await telegram.setWebhook(botToken, webhookUrlFor(channel)!, secret);
        const updated = await req.db.channel.update({
          where: { id: channel.id },
          data: { status: 'CONNECTED', connectedAt: new Date(), lastError: null },
        });
        await logEvent(u.id, 'INFO', 'channel.connected', `Telegram bot @${bot.username} connected`);
        return reply.code(201).send({ channel: toChannelDTO(updated) });
      } catch (err) {
        const msg = `Telegram webhook failed: ${(err as Error).message}. Telegram requires PUBLIC_API_URL to be a public HTTPS URL.`;
        const updated = await req.db.channel.update({
          where: { id: channel.id },
          data: { status: 'ERROR', lastError: msg },
        });
        await logEvent(u.id, 'ERROR', 'channel.error', msg);
        return reply.code(201).send({ channel: toChannelDTO(updated) });
      }
    },
  );

  app.post(
    '/channels/whatsapp-qr',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { name } = parse(whatsappQrChannelSchema, req.body);
      const u = user(req);
      if (!env.BAILEYS_ENABLED || !(await isFlagEnabled('whatsapp_qr', u.id))) {
        throw forbidden('QR connection is disabled on this server. Use the WhatsApp Business API instead.');
      }
      await assertCanAddChannel(u, 'WHATSAPP_QR');
      const channel = await req.db.channel.create({
        data: {
          type: 'WHATSAPP_QR',
          name: name || 'WhatsApp',
          webhookSecret: randomToken(16),
          status: 'CONNECTING',
        } as never,
      });
      await baileys.startSession(channel.id, u.id);
      return reply.code(201).send({ channel: toChannelDTO(channel) });
    },
  );

  /** Polled by the UI while waiting for the QR scan. */
  app.get('/channels/:id/qr', async (req) => {
    const { id } = parse(idParam, req.params);
    const channel = await req.db.channel.findFirst({ where: { id, type: 'WHATSAPP_QR' } });
    if (!channel) throw notFound('Channel not found');
    const state = baileys.getSessionState(id);
    return {
      status: channel.status,
      qr: channel.status === 'QR' ? state.qr : null,
      phone: channel.externalId,
      lastError: channel.lastError,
    };
  });

  app.post(
    '/channels/whatsapp-cloud',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = parse(whatsappCloudChannelSchema, req.body);
      const u = user(req);
      await assertCanAddChannel(u, 'WHATSAPP_CLOUD');
      let info: Awaited<ReturnType<typeof cloud.verifyCredentials>>;
      try {
        info = await cloud.verifyCredentials(input);
      } catch (err) {
        throw badRequest(`Meta rejected these credentials: ${(err as Error).message}`);
      }
      const display = info.display_phone_number ?? input.displayPhone ?? input.phoneNumberId;
      const channel = await req.db.channel.create({
        data: {
          type: 'WHATSAPP_CLOUD',
          name: info.verified_name ?? 'WhatsApp Business',
          externalId: display,
          encryptedConfig: encryptJson({ ...input, displayPhone: display }),
          webhookSecret: randomToken(24), // used as the webhook verify token
          status: 'CONNECTING',
        } as never,
      });
      await logEvent(
        u.id,
        'INFO',
        'channel.created',
        `WhatsApp Business API number ${display} added — finish webhook setup in Meta`,
      );
      return reply.code(201).send({ channel: toChannelDTO(channel) });
    },
  );

  app.post('/channels/:id/reconnect', async (req) => {
    const { id } = parse(idParam, req.params);
    const u = user(req);
    const channel = await req.db.channel.findFirst({ where: { id } });
    if (!channel) throw notFound('Channel not found');
    if (channel.type === 'WHATSAPP_QR') {
      await baileys.startSession(channel.id, u.id);
    } else if (channel.type === 'TELEGRAM') {
      try {
        await telegram.setWebhook(telegramToken(channel), webhookUrlFor(channel)!, channel.webhookSecret);
        await req.db.channel.update({
          where: { id },
          data: { status: 'CONNECTED', lastError: null, connectedAt: new Date() },
        });
      } catch (err) {
        await req.db.channel.update({
          where: { id },
          data: { status: 'ERROR', lastError: (err as Error).message },
        });
      }
    }
    const updated = await req.db.channel.findFirstOrThrow({ where: { id } });
    return { channel: toChannelDTO(updated) };
  });

  app.delete('/channels/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const u = user(req);
    const channel = await req.db.channel.findFirst({ where: { id } });
    if (!channel) throw notFound('Channel not found');
    if (channel.type === 'TELEGRAM') await telegram.deleteWebhook(telegramToken(channel)).catch(() => null);
    if (channel.type === 'WHATSAPP_QR') await baileys.logoutSession(channel.id, u.id);
    await req.db.channel.delete({ where: { id } });
    await logEvent(u.id, 'INFO', 'channel.removed', `${channel.name} disconnected`);
    return { ok: true };
  });
}
