import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { prisma } from '../db/client.js';
import { cookieSecure, env } from '../config.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { unauthorized } from '../lib/errors.js';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, signAccessToken } from './tokens.js';

export const COOKIE_ACCESS = 'pa_at';
export const COOKIE_REFRESH = 'pa_rt';
export const COOKIE_CSRF = 'pa_csrf';

const base = {
  secure: cookieSecure,
  sameSite: 'lax' as const,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

function setCookies(reply: FastifyReply, access: string, refresh: string) {
  reply.setCookie(COOKIE_ACCESS, access, { ...base, httpOnly: true, path: '/', maxAge: ACCESS_TTL_SECONDS });
  reply.setCookie(COOKIE_REFRESH, refresh, {
    ...base,
    httpOnly: true,
    path: '/api/auth',
    maxAge: REFRESH_TTL_SECONDS,
  });
  reply.setCookie(COOKIE_CSRF, randomToken(24), { ...base, httpOnly: false, path: '/', maxAge: REFRESH_TTL_SECONDS });
}

export function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(COOKIE_ACCESS, { ...base, path: '/' });
  reply.clearCookie(COOKIE_REFRESH, { ...base, path: '/api/auth' });
  reply.clearCookie(COOKIE_CSRF, { ...base, path: '/' });
}

interface IssueOptions {
  impersonatorId?: string | null;
  family?: string;
}

/** Creates a refresh token row and sets session cookies. Returns the tokens (used by tests / API clients). */
export async function issueSession(
  req: FastifyRequest,
  reply: FastifyReply,
  user: Pick<User, 'id' | 'role'>,
  opts: IssueOptions = {},
) {
  const refresh = randomToken(48);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      family: opts.family ?? randomToken(12),
      tokenHash: sha256(refresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      impersonatorId: opts.impersonatorId ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
      ip: req.ip,
    },
  });
  const access = await signAccessToken({
    sub: user.id,
    role: opts.impersonatorId ? 'USER' : user.role,
    ...(opts.impersonatorId ? { imp: opts.impersonatorId } : {}),
  });
  setCookies(reply, access, refresh);
  return { accessToken: access, refreshToken: refresh };
}

/**
 * Rotates a refresh token. A token that was already used (revoked) indicates theft:
 * the whole token family is revoked and the caller must log in again.
 */
export async function rotateSession(req: FastifyRequest, reply: FastifyReply, presented: string | undefined) {
  if (!presented) throw unauthorized('No refresh token');
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(presented) }, include: { user: true } });
  if (!row) throw unauthorized('Invalid refresh token');
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { family: row.family, revokedAt: null }, data: { revokedAt: new Date() } });
    clearSessionCookies(reply);
    throw unauthorized('Refresh token reuse detected — please sign in again');
  }
  if (row.expiresAt < new Date() || row.user.status === 'SUSPENDED') {
    clearSessionCookies(reply);
    throw unauthorized('Session expired');
  }
  // Atomic claim: only one concurrent refresh can win.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) throw unauthorized('Refresh token already used');
  const tokens = await issueSession(req, reply, row.user, { family: row.family, impersonatorId: row.impersonatorId });
  return { user: row.user, impersonatorId: row.impersonatorId, ...tokens };
}

export async function revokeSession(presented: string | undefined) {
  if (!presented) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(presented), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
