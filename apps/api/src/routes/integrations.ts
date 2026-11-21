import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { TOOLKITS, integrationRequestSchema, integrationSettingsSchema, type IntegrationDTO, type Toolkit } from '@partner/shared';
import { env } from '../config.js';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  composioEnabled,
  disconnect,
  findActiveAccount,
  getConnectionStatus,
  isToolkitConfigured,
  startConnection,
} from '../integrations/composio.js';
import { logEvent } from '../services/audit.js';
import { tenantDb } from '../db/tenant.js';
import { isFlagEnabled } from '../services/flags.js';

const toolkitParam = z.object({ toolkit: z.enum(TOOLKITS) });

export async function integrationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  /** Moves PENDING rows to CONNECTED once Composio reports the account ACTIVE. */
  async function sync(userId: string, row: { id: string; toolkit: string; status: string; connectedAccountId: string | null }) {
    if (row.status !== 'PENDING' || !composioEnabled()) return row.status;
    let accountId = row.connectedAccountId;
    let status = accountId ? await getConnectionStatus(accountId) : null;
    if (status !== 'ACTIVE') {
      const found = await findActiveAccount(userId, row.toolkit as Toolkit).catch(() => null);
      if (found) {
        accountId = found;
        status = 'ACTIVE';
      }
    }
    if (status === 'ACTIVE') {
      await tenantDb(userId).integration.update({
        where: { id: row.id },
        data: { status: 'CONNECTED', connectedAccountId: accountId, connectedAt: new Date() },
      });
      await logEvent(userId, 'INFO', 'integration.connected', `${row.toolkit} connected`);
      return 'CONNECTED';
    }
    if (status === 'FAILED' || status === 'EXPIRED') {
      await tenantDb(userId).integration.update({ where: { id: row.id }, data: { status: 'ERROR' } });
      return 'ERROR';
    }
    return 'PENDING';
  }

  app.get('/integrations', async (req): Promise<{ integrations: IntegrationDTO[]; enabled: boolean }> => {
    const u = user(req);
    const rows = await req.db.integration.findMany();
    const out: IntegrationDTO[] = [];
    for (const toolkit of TOOLKITS) {
      const row = rows.find((r) => r.toolkit === toolkit);
      const status = row ? await sync(u.id, row) : 'DISCONNECTED';
      out.push({
        toolkit,
        status: status as IntegrationDTO['status'],
        connectedAt: row?.connectedAt?.toISOString() ?? null,
        configured: isToolkitConfigured(toolkit),
        settings: (row?.settings ?? {}) as IntegrationDTO['settings'],
      });
    }
    return { integrations: out, enabled: composioEnabled() && (await isFlagEnabled('composio_integrations', u.id)) };
  });

  app.post('/integrations/:toolkit/connect', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { toolkit } = parse(toolkitParam, req.params);
    const u = user(req);
    if (!isToolkitConfigured(toolkit)) throw badRequest('This integration is not configured on the server yet.');
    const callbackUrl = `${env.WEB_ORIGIN}/integrations?toolkit=${toolkit}`;
    let conn: Awaited<ReturnType<typeof startConnection>>;
    try {
      conn = await startConnection(u.id, toolkit, callbackUrl);
    } catch (err) {
      req.log.error({ err: (err as Error).message }, 'composio connect failed');
      throw badRequest('Could not start the connection with Composio. Try again in a minute.');
    }
    if (!conn.redirectUrl) throw badRequest('Composio did not return a redirect URL');
    const existing = await req.db.integration.findFirst({ where: { toolkit } });
    if (existing) {
      await req.db.integration.update({ where: { id: existing.id }, data: { status: 'PENDING', connectedAccountId: conn.connectedAccountId } });
    } else {
      await req.db.integration.create({ data: { toolkit, status: 'PENDING', connectedAccountId: conn.connectedAccountId } as never });
    }
    return { redirectUrl: conn.redirectUrl };
  });

  app.post('/integrations/:toolkit/sync', async (req) => {
    const { toolkit } = parse(toolkitParam, req.params);
    const row = await req.db.integration.findFirst({ where: { toolkit } });
    if (!row) throw notFound('Not connected');
    return { status: await sync(user(req).id, row) };
  });

  app.put('/integrations/:toolkit/settings', async (req) => {
    const { toolkit } = parse(toolkitParam, req.params);
    const settings = parse(integrationSettingsSchema, req.body);
    const row = await req.db.integration.findFirst({ where: { toolkit } });
    if (!row) throw notFound('Connect this integration first');
    // Accept a full Google Sheets URL and keep only the spreadsheet id.
    const sheetId = settings.sheetId?.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? settings.sheetId;
    await req.db.integration.update({
      where: { id: row.id },
      data: { settings: { ...(row.settings as object), ...settings, ...(sheetId ? { sheetId } : {}) } as Prisma.InputJsonValue },
    });
    return { ok: true };
  });

  app.delete('/integrations/:toolkit', async (req) => {
    const { toolkit } = parse(toolkitParam, req.params);
    const row = await req.db.integration.findFirst({ where: { toolkit } });
    if (!row) return { ok: true };
    if (row.connectedAccountId && composioEnabled()) {
      await disconnect(row.connectedAccountId).catch((err) => req.log.warn({ err: (err as Error).message }, 'composio delete failed'));
    }
    await req.db.integration.delete({ where: { id: row.id } });
    await logEvent(user(req).id, 'INFO', 'integration.disconnected', `${toolkit} disconnected`);
    return { ok: true };
  });

  app.post('/integration-requests', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const input = parse(integrationRequestSchema, req.body);
    await req.db.integrationRequest.create({ data: input as never });
    return reply.code(201).send({ ok: true });
  });
}
