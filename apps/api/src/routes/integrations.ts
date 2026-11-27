import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  agentDocSchema,
  agentSheetSchema,
  googleConnectSchema,
  googleCredentialsSchema,
  googleSettingsSchema,
  integrationRequestSchema,
  type AgentSheetDTO,
  type GoogleStatusDTO,
} from '@cowork/shared';
import { env } from '../config.js';
import { prisma } from '../db/client.js';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { decrypt, decryptJson, encryptJson } from '../lib/crypto.js';
import { logEvent } from '../services/audit.js';
import { isFlagEnabled } from '../services/flags.js';
import {
  buildAuthUrl,
  cacheAccessToken,
  clearTokenCache,
  encryptRefreshToken,
  exchangeCode,
  GoogleError,
  readDoc,
  readSheet,
  redirectUri,
  revokeToken,
  servicesFromScopes,
  sheetMeta,
  signState,
  spreadsheetIdFrom,
  verifyState,
  type GoogleCredentials,
} from '../integrations/google.js';

const idParam = z.object({ id: z.string().min(1) });

function sheetDTO(s: {
  id: string;
  spreadsheetId: string;
  tab: string | null;
  name: string;
  description: string;
  purpose: 'LEADS' | 'LOOKUP';
  title: string;
  createdAt: Date;
}): AgentSheetDTO {
  return {
    ...s,
    url: `https://docs.google.com/spreadsheets/d/${s.spreadsheetId}`,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function integrationRoutes(app: FastifyInstance) {
  /**
   * OAuth redirect target (browser navigation from Google). Not cookie-authenticated on purpose:
   * the access cookie may expire while the user is on Google's consent screen. The signed `state`
   * (10-minute JWT bound to the tenant) proves who started the flow.
   */
  app.get('/integrations/google/callback', async (req, reply) => {
    const q = parse(
      z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }),
      req.query,
    );
    const back = (status: string, reason?: string) =>
      reply.redirect(
        `${env.WEB_ORIGIN}/integrations?google=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`,
      );
    const userId = q.state ? await verifyState(q.state) : null;
    if (!userId) return back('error', 'The connection request expired. Please try again.');
    if (q.error || !q.code) {
      return back(
        'error',
        q.error === 'access_denied' ? 'Access was not granted.' : (q.error ?? 'No code returned'),
      );
    }

    const conn = await prisma.googleConnection.findUnique({ where: { userId } });
    const creds = decryptJson<GoogleCredentials>(conn?.encryptedCredentials);
    if (!conn || !creds) return back('error', 'Save your Google Cloud credentials first.');
    try {
      const t = await exchangeCode(creds, q.code);
      const refreshToken =
        t.refreshToken ?? (conn.encryptedRefreshToken ? decrypt(conn.encryptedRefreshToken) : null);
      if (!refreshToken) {
        return back(
          'error',
          'Google did not return a refresh token. Remove the app from your Google account permissions and connect again.',
        );
      }
      await prisma.googleConnection.update({
        where: { userId },
        data: {
          encryptedRefreshToken: encryptRefreshToken(refreshToken),
          scopes: t.scopes,
          email: t.email,
          status: 'CONNECTED',
          lastError: null,
          connectedAt: new Date(),
        },
      });
      cacheAccessToken(userId, t.accessToken, t.expiresIn);
      await logEvent(
        userId,
        'INFO',
        'google.connected',
        `Google account ${t.email ?? ''} connected (${servicesFromScopes(t.scopes).join(', ')})`,
      );
      return back('connected');
    } catch (err) {
      const msg = err instanceof GoogleError ? err.message : 'Could not complete the Google connection';
      await prisma.googleConnection.update({ where: { userId }, data: { status: 'ERROR', lastError: msg } });
      await logEvent(userId, 'ERROR', 'google.connect_failed', `Google connection failed: ${msg}`);
      return back('error', msg);
    }
  });

  await app.register(async (secured) => {
    secured.addHook('preHandler', authenticate);

    secured.get('/integrations/google', async (req): Promise<GoogleStatusDTO & { enabled: boolean }> => {
      const conn = await req.db.googleConnection.findFirst();
      const connected = conn?.status === 'CONNECTED';
      return {
        enabled: await isFlagEnabled('google_integrations', user(req).id),
        credentialsSaved: !!conn?.encryptedCredentials,
        clientIdHint: conn?.clientIdHint ?? null,
        connected,
        email: conn?.email ?? null,
        status: conn?.status ?? 'DISCONNECTED',
        services: connected ? servicesFromScopes(conn.scopes) : [],
        lastError: conn?.lastError ?? null,
        connectedAt: conn?.connectedAt?.toISOString() ?? null,
        redirectUri: redirectUri(),
        settings: (conn?.settings ?? {}) as GoogleStatusDTO['settings'],
      };
    });

    secured.put('/integrations/google/credentials', async (req) => {
      const input = parse(googleCredentialsSchema, req.body);
      const u = user(req);
      const existing = await req.db.googleConnection.findFirst();
      const data = {
        encryptedCredentials: encryptJson(input),
        clientIdHint: `${input.clientId.slice(0, 12)}…`,
      };
      if (existing) {
        const changedClient =
          decryptJson<GoogleCredentials>(existing.encryptedCredentials)?.clientId !== input.clientId;
        // A refresh token belongs to one OAuth client; switching clients requires reconnecting.
        await req.db.googleConnection.update({
          where: { id: existing.id },
          data: {
            ...data,
            ...(changedClient
              ? { encryptedRefreshToken: null, status: 'DISCONNECTED' as const, scopes: [], email: null }
              : {}),
          },
        });
        if (changedClient) clearTokenCache(u.id);
      } else {
        await req.db.googleConnection.create({ data: data as never });
      }
      await logEvent(u.id, 'INFO', 'google.credentials_saved', 'Google Cloud OAuth credentials saved');
      return { ok: true };
    });

    secured.post('/integrations/google/connect', async (req) => {
      const { services } = parse(googleConnectSchema, req.body);
      const u = user(req);
      if (!(await isFlagEnabled('google_integrations', u.id)))
        throw badRequest('Google integrations are disabled.');
      const conn = await req.db.googleConnection.findFirst();
      const creds = decryptJson<GoogleCredentials>(conn?.encryptedCredentials);
      if (!conn || !creds) throw badRequest('Save your Google Cloud Client ID and Secret first.');
      if (conn.status !== 'CONNECTED') {
        await req.db.googleConnection.update({ where: { id: conn.id }, data: { status: 'PENDING' } });
      }
      return { url: buildAuthUrl(creds, await signState(u.id), services) };
    });

    secured.put('/integrations/google/settings', async (req) => {
      const settings = parse(googleSettingsSchema, req.body);
      const conn = await req.db.googleConnection.findFirst();
      if (!conn) throw notFound('Connect Google first');
      await req.db.googleConnection.update({
        where: { id: conn.id },
        data: { settings: { ...(conn.settings as object), ...settings } as Prisma.InputJsonValue },
      });
      return { ok: true };
    });

    /** Disconnect: revoke the token at Google but keep the saved Cloud credentials. */
    secured.delete('/integrations/google', async (req) => {
      const u = user(req);
      const conn = await req.db.googleConnection.findFirst();
      if (!conn) return { ok: true };
      if (conn.encryptedRefreshToken) await revokeToken(decrypt(conn.encryptedRefreshToken));
      await req.db.googleConnection.update({
        where: { id: conn.id },
        data: {
          encryptedRefreshToken: null,
          status: 'DISCONNECTED',
          scopes: [],
          email: null,
          connectedAt: null,
        },
      });
      clearTokenCache(u.id);
      await logEvent(u.id, 'INFO', 'google.disconnected', 'Google account disconnected');
      return { ok: true };
    });

    secured.delete('/integrations/google/credentials', async (req) => {
      const u = user(req);
      const conn = await req.db.googleConnection.findFirst();
      if (conn?.encryptedRefreshToken) await revokeToken(decrypt(conn.encryptedRefreshToken));
      await req.db.googleConnection.deleteMany({});
      clearTokenCache(u.id);
      return { ok: true };
    });

    // ---------------- Agent Google Sheets ----------------
    secured.get('/sheets', async (req) => {
      const sheets = await req.db.agentSheet.findMany({ orderBy: { createdAt: 'asc' } });
      return { sheets: sheets.map(sheetDTO) };
    });

    secured.post('/sheets', async (req, reply) => {
      const input = parse(agentSheetSchema, req.body);
      const u = user(req);
      const conn = await req.db.googleConnection.findFirst();
      if (conn?.status !== 'CONNECTED' || !servicesFromScopes(conn.scopes).includes('googlesheets')) {
        throw badRequest('Connect Google with Sheets access first (Integrations page).');
      }
      const spreadsheetId = spreadsheetIdFrom(input.sheet);
      if (!spreadsheetId) throw badRequest('That does not look like a Google Sheets link.');
      if ((await req.db.agentSheet.count()) >= 20) throw badRequest('You can add up to 20 sheets.');
      if (await req.db.agentSheet.findFirst({ where: { name: input.name } })) {
        throw conflict('A sheet with this name already exists');
      }
      let meta: Awaited<ReturnType<typeof sheetMeta>>;
      try {
        meta = await sheetMeta(u.id, spreadsheetId);
      } catch (err) {
        throw badRequest(`Could not open this sheet: ${(err as Error).message}`);
      }
      if (input.tab && !meta.tabs.includes(input.tab)) {
        throw badRequest(`Tab "${input.tab}" not found. Tabs: ${meta.tabs.join(', ')}`);
      }
      const sheet = await req.db.agentSheet.create({
        data: {
          spreadsheetId,
          tab: input.tab || null,
          name: input.name,
          description: input.description,
          purpose: input.purpose,
          title: meta.title,
        } as never,
      });
      return reply.code(201).send({ sheet: sheetDTO(sheet), tabs: meta.tabs });
    });

    secured.get('/sheets/:id/preview', async (req) => {
      const { id } = parse(idParam, req.params);
      const sheet = await req.db.agentSheet.findFirst({ where: { id } });
      if (!sheet) throw notFound('Sheet not found');
      try {
        return { rows: await readSheet(user(req).id, sheet.spreadsheetId, sheet.tab, 8) };
      } catch (err) {
        throw badRequest(`Could not read the sheet: ${(err as Error).message}`);
      }
    });

    secured.delete('/sheets/:id', async (req) => {
      const { id } = parse(idParam, req.params);
      const res = await req.db.agentSheet.deleteMany({ where: { id } });
      if (!res.count) throw notFound('Sheet not found');
      return { ok: true };
    });

    // ---- Documents the agent may read (audit C2) ----
    secured.get('/docs', async (req) => {
      const docs = await req.db.agentDoc.findMany({ orderBy: { createdAt: 'asc' } });
      return { docs };
    });

    secured.post('/docs', async (req, reply) => {
      const { doc } = parse(agentDocSchema, req.body);
      const u = user(req);
      const conn = await req.db.googleConnection.findFirst();
      if (conn?.status !== 'CONNECTED' || !servicesFromScopes(conn.scopes).includes('googledocs'))
        throw badRequest('Connect Google with Docs access first (Integrations page).');
      const fileId =
        /\/document\/d\/([A-Za-z0-9_-]{20,})/.exec(doc)?.[1] ??
        (/^[A-Za-z0-9_-]{20,}$/.test(doc) ? doc : null);
      if (!fileId) throw badRequest('That does not look like a Google Docs link.');
      if ((await req.db.agentDoc.count()) >= 50) throw badRequest('You can add up to 50 documents.');
      if (await req.db.agentDoc.findFirst({ where: { fileId } }))
        throw conflict('This document is already added');
      let title: string;
      try {
        title = ((await readDoc(u.id, fileId)) as { title?: string }).title?.trim() || 'Untitled document';
      } catch (err) {
        req.log.warn({ err: (err as Error).message }, 'could not open google doc');
        throw badRequest(
          'Could not open this document with your Google account. Check the link and sharing.',
        );
      }
      const created = await req.db.agentDoc.create({
        data: {
          fileId,
          name: title.slice(0, 200),
          mimeType: 'application/vnd.google-apps.document',
        } as never,
      });
      return reply.code(201).send({ doc: created });
    });

    secured.delete('/docs/:id', async (req) => {
      const { id } = parse(idParam, req.params);
      const res = await req.db.agentDoc.deleteMany({ where: { id } });
      if (!res.count) throw notFound('Document not found');
      return { ok: true };
    });

    secured.post(
      '/integration-requests',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const input = parse(integrationRequestSchema, req.body);
        await req.db.integrationRequest.create({ data: input as never });
        return reply.code(201).send({ ok: true });
      },
    );
  });
}
