import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config.js';
import { loggerOptions } from './lib/logger.js';
import { HttpError } from './lib/errors.js';
import { prisma } from './db/client.js';
import { authRoutes } from './routes/auth.js';
import { registerRoutes } from './routes/index.js';
import { wireHandlers } from './background.js';
import { maintenanceOn, READ_ONLY, writeAllowedDuringMaintenance } from './services/maintenance.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy:
      typeof env.TRUST_PROXY === 'number'
        ? (_addr: string, hop: number) => hop < (env.TRUST_PROXY as number)
        : env.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
    // accept a caller's x-request-id (e.g. from Caddy) when it looks sane, else make one (M6)
    requestIdHeader: false,
    genReqId: (req) => {
      const given = req.headers['x-request-id'];
      return typeof given === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(given) ? given : crypto.randomUUID();
    },
  });
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    // tenant data must never sit in shared or browser caches (L7); public plan prices may
    const path = req.url.split('?')[0]!;
    if (path.startsWith('/api/'))
      reply.header(
        'cache-control',
        req.method === 'GET' && path === '/api/public/plans' ? 'public, max-age=60' : 'private, no-store',
      );
  });
  // read-only maintenance (M5): tenant writes pause; reads, sign-in, admin, webhooks keep working
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || writeAllowedDuringMaintenance(req.url)) return;
    if (await maintenanceOn(READ_ONLY))
      throw new HttpError(
        503,
        'We are doing maintenance. Please try again in a few minutes.',
        'MAINTENANCE',
        undefined,
        { 'retry-after': '300' },
      );
  });

  // Keep the raw body for webhook signature verification (Meta, Razorpay).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    req.rawBody = body;
    if (body.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch {
      const err = new HttpError(400, 'Invalid JSON body', 'BAD_JSON');
      done(err as unknown as FastifyError, undefined);
    }
  });

  app.decorateRequest('auth', null);
  app.decorateRequest('currentUser', null);
  app.decorateRequest('db', null as never);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'authorization'],
  });
  await app.register(cookie);
  // Global safety net per client IP; auth/webhook routes set stricter limits of their own.
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      if (err.headers) reply.headers(err.headers);
      return reply.code(err.statusCode).send({ error: err.message, code: err.code, details: err.details });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 429)
      return reply.code(429).send({ error: 'Too many requests, slow down.', code: 'RATE_LIMITED' });
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    return reply.code(status).send({
      error: status >= 500 ? 'Something went wrong' : err.message,
      code: (err as FastifyError).code ?? 'ERROR',
    });
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' }));

  const quiet = { logLevel: 'silent' as const, config: { rateLimit: false as const } };
  app.get('/health', quiet, async () => ({ ok: true, release: env.APP_RELEASE }));
  app.get('/health/ready', quiet, async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: 'up' };
    } catch {
      return reply.code(503).send({ ok: false, db: 'down' });
    }
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await registerRoutes(app);
  wireHandlers();

  return app;
}
