import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { prisma } from '../db/client.js';
import { tenantDb, type TenantDb } from '../db/tenant.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { COOKIE_ACCESS, COOKIE_CSRF } from '../auth/session.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { safeEqual } from '../lib/crypto.js';

export interface AuthContext {
  userId: string;
  role: 'USER' | 'ADMIN';
  impersonatorId: string | null;
  via: 'cookie' | 'bearer';
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
    currentUser: User | null;
    /** tenant-scoped prisma client for the authenticated user */
    db: TenantDb;
    rawBody?: Buffer;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Double-submit CSRF check for cookie-authenticated, state-changing requests. */
export function checkCsrf(req: FastifyRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  const cookie = req.cookies[COOKIE_CSRF];
  const header = req.headers['x-csrf-token'];
  if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
    throw forbidden('Invalid CSRF token');
  }
}

async function resolve(req: FastifyRequest): Promise<AuthContext | null> {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const claims = await verifyAccessToken(header.slice(7));
    return claims ? { userId: claims.sub, role: claims.role, impersonatorId: claims.imp ?? null, via: 'bearer' } : null;
  }
  const cookie = req.cookies[COOKIE_ACCESS];
  if (cookie) {
    const claims = await verifyAccessToken(cookie);
    return claims ? { userId: claims.sub, role: claims.role, impersonatorId: claims.imp ?? null, via: 'cookie' } : null;
  }
  return null;
}

/** preHandler: require an authenticated, non-suspended user and attach a tenant-scoped db. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  const auth = await resolve(req);
  if (!auth) throw unauthorized();
  if (auth.via === 'cookie') checkCsrf(req);
  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) throw unauthorized();
  if (user.status === 'SUSPENDED' && !auth.impersonatorId) throw forbidden('Your account is suspended. Contact support.');
  req.auth = auth;
  req.currentUser = user;
  req.db = tenantDb(user.id);
}

/** preHandler: admins only (and never while impersonating). */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await authenticate(req, reply);
  if (req.auth?.impersonatorId) throw forbidden('Exit impersonation to use the admin panel');
  if (req.currentUser?.role !== 'ADMIN') throw forbidden('Admins only');
}

export function user(req: FastifyRequest): User {
  if (!req.currentUser) throw unauthorized();
  return req.currentUser;
}
