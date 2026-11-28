import type { FastifyInstance } from 'fastify';
import {
  apiKeySchema,
  bossNumbersSchema,
  knowledgeSchema,
  personalitySchema,
  PROVIDERS,
  PROVIDER_IDS,
  type ApiKeyDTO,
  type ProviderId,
} from '@cowork/shared';
import { z } from 'zod';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { decrypt, encrypt, last4 } from '../lib/crypto.js';
import { prisma } from '../db/client.js';
import { LLMError } from '../llm/index.js';
import { generate } from '../llm/gateway.js';
import { buildAgentPrompt } from '../agent/runtime.js';
import { logEvent } from '../services/audit.js';
import { createLinkCode } from '../services/boss-link.js';

export async function agentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/agent', async (req) => {
    const agent = await req.db.agent.findFirst();
    if (!agent) throw notFound('Agent not found');
    return { agent, bossNumbers: user(req).bossNumbers, bossTelegramIds: user(req).bossTelegramIds };
  });

  app.put('/agent/personality', async (req) => {
    const input = parse(personalitySchema, req.body);
    const agent = await req.db.agent.update({
      where: { userId: user(req).id },
      data: { ...input, customized: true },
    });
    return { agent };
  });

  app.put('/agent/knowledge', async (req) => {
    const input = parse(knowledgeSchema, req.body);
    const agent = await req.db.agent.update({ where: { userId: user(req).id }, data: input });
    return { agent, savedAt: new Date().toISOString() };
  });

  app.put('/agent/boss-numbers', async (req) => {
    const { bossNumbers } = parse(bossNumbersSchema, req.body);
    const normalized = [...new Set(bossNumbers.map((n) => n.replace(/\D/g, '')))];
    await prisma.user.update({ where: { id: user(req).id }, data: { bossNumbers: normalized } });
    return { bossNumbers: normalized };
  });

  /** One-time code the owner sends to their Telegram bot as "/boss CODE" (audit C1). */
  app.post(
    '/agent/boss-link-code',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => createLinkCode(user(req).id),
  );

  app.delete('/agent/boss-telegram/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().regex(/^-?\d{1,20}$/) }), req.params);
    const u = user(req);
    const bossTelegramIds = u.bossTelegramIds.filter((x) => x !== id);
    await prisma.user.update({ where: { id: u.id }, data: { bossTelegramIds } });
    await logEvent(u.id, 'INFO', 'boss.unlinked', `Telegram account ${id} removed from Boss Mode`);
    return { bossTelegramIds };
  });

  /** Shows the exact system prompt the agent will use (transparency for the owner). */
  app.get('/agent/prompt-preview', async (req) => {
    const prompt = await buildAgentPrompt(user(req).id, { channel: 'WhatsApp' });
    return { prompt: prompt.system, tools: prompt.tools.map((t) => t.name) };
  });

  // ---------------- API keys ----------------
  app.get(
    '/keys',
    async (
      req,
    ): Promise<{ keys: ApiKeyDTO[]; active: { provider: string | null; model: string | null } }> => {
      const [keys, agent] = await Promise.all([req.db.apiKey.findMany(), req.db.agent.findFirst()]);
      return {
        keys: keys.map((k) => ({
          provider: k.provider as ProviderId,
          model: k.model,
          last4: k.last4,
          isActive: agent?.provider === k.provider,
          updatedAt: k.updatedAt.toISOString(),
        })),
        active: { provider: agent?.provider ?? null, model: agent?.model ?? null },
      };
    },
  );

  app.put('/keys', async (req) => {
    const input = parse(apiKeySchema, req.body);
    const u = user(req);
    const existing = await req.db.apiKey.findFirst({ where: { provider: input.provider } });
    if (!input.apiKey && !existing) throw badRequest('Enter your API key');
    const p = PROVIDERS[input.provider];
    if (input.apiKey && p.keyPrefix && !input.apiKey.startsWith(p.keyPrefix)) {
      // only a hint — some providers issue keys with other prefixes
      req.log.info({ provider: input.provider }, 'api key prefix does not match the usual format');
    }
    if (existing) {
      await req.db.apiKey.update({
        where: { id: existing.id },
        data: {
          model: input.model,
          ...(input.apiKey ? { encryptedKey: encrypt(input.apiKey), last4: last4(input.apiKey) } : {}),
        },
      });
    } else {
      await req.db.apiKey.create({
        data: {
          provider: input.provider,
          model: input.model,
          encryptedKey: encrypt(input.apiKey!),
          last4: last4(input.apiKey!),
        } as never,
      });
    }
    if (input.makeActive) {
      await req.db.agent.update({
        where: { userId: u.id },
        data: { provider: input.provider, model: input.model },
      });
    }
    await logEvent(u.id, 'INFO', 'api_key.saved', `${p.name} key saved (model ${input.model})`);
    return { ok: true };
  });

  app.delete('/keys/:provider', async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(PROVIDER_IDS) }), req.params);
    const u = user(req);
    await req.db.apiKey.deleteMany({ where: { provider } });
    const agent = await req.db.agent.findFirst();
    if (agent?.provider === provider) {
      await req.db.agent.update({ where: { userId: u.id }, data: { provider: null, model: null } });
    }
    return { ok: true };
  });

  /** Sends a tiny request with the stored key to confirm it works. */
  app.post('/keys/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(PROVIDER_IDS) }), req.body);
    const key = await req.db.apiKey.findFirst({ where: { provider } });
    if (!key) throw notFound('No key saved for this provider');
    const started = Date.now();
    try {
      const res = await generate(
        { userId: user(req).id, feature: 'key_test', promptVersion: 'key_test@1' },
        {
          provider,
          model: key.model,
          apiKey: decrypt(key.encryptedKey),
          messages: [
            { role: 'system', content: 'Reply with exactly: OK' },
            { role: 'user', content: 'ping' },
          ],
          maxTokens: 20,
        },
      );
      return { ok: true, latencyMs: Date.now() - started, reply: (res.content ?? '').slice(0, 60) };
    } catch (err) {
      return { ok: false, error: err instanceof LLMError ? err.message : 'Could not reach the provider' };
    }
  });
}
