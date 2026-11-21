import type { FastifyInstance } from 'fastify';
import { loginSchema, signupSchema, changePasswordSchema, TRIAL_HOURS } from '@partner/shared';
import { prisma } from '../db/client.js';
import { parse } from '../lib/validate.js';
import { conflict, forbidden, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword, fakeVerify } from '../auth/password.js';
import { clearSessionCookies, COOKIE_REFRESH, issueSession, revokeSession, rotateSession } from '../auth/session.js';
import { authenticate, checkCsrf, user } from '../plugins/auth.js';
import { toMeDTO } from '../services/me.js';
import { audit, logEvent } from '../services/audit.js';
import { DEFAULT_SKILL_SLUGS } from '../db/skills-catalog.js';

const authLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function authRoutes(app: FastifyInstance) {
  app.post('/signup', { config: authLimit }, async (req, reply) => {
    const input = parse(signupSchema, req.body);
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw conflict('An account with this email already exists');

    const passwordHash = await hashPassword(input.password);
    const defaultSkills = await prisma.skill.findMany({
      where: { slug: { in: DEFAULT_SKILL_SLUGS }, isPublic: true },
      select: { id: true },
    });
    const created = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        trialEndsAt: new Date(Date.now() + TRIAL_HOURS * 3600 * 1000),
        agent: { create: { businessName: input.businessName ?? '', name: 'Assistant' } },
        userSkills: { create: defaultSkills.map((s) => ({ skillId: s.id, enabled: true })) },
      },
    });
    await issueSession(req, reply, created);
    await logEvent(created.id, 'INFO', 'account.created', 'Account created — 24 hour free trial started');
    return reply.code(201).send({ user: await toMeDTO(created, null) });
  });

  app.post('/login', { config: authLimit }, async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const found = await prisma.user.findUnique({ where: { email: input.email } });
    if (!found) {
      await fakeVerify(input.password);
      throw unauthorized('Invalid email or password');
    }
    const ok = await verifyPassword(found.passwordHash, input.password);
    if (!ok) throw unauthorized('Invalid email or password');
    if (found.status === 'SUSPENDED') throw forbidden('Your account is suspended. Contact support.');
    const updated = await prisma.user.update({ where: { id: found.id }, data: { lastLoginAt: new Date() } });
    await issueSession(req, reply, updated);
    return { user: await toMeDTO(updated, null) };
  });

  app.post('/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    checkCsrf(req);
    const { user: u, impersonatorId } = await rotateSession(req, reply, req.cookies[COOKIE_REFRESH]);
    return { user: await toMeDTO(u, impersonatorId) };
  });

  app.post('/logout', async (req, reply) => {
    await revokeSession(req.cookies[COOKIE_REFRESH]);
    clearSessionCookies(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: authenticate }, async (req) => {
    return { user: await toMeDTO(user(req), req.auth?.impersonatorId ?? null) };
  });

  app.post('/password', { preHandler: authenticate, config: authLimit }, async (req) => {
    const input = parse(changePasswordSchema, req.body);
    const u = user(req);
    if (!(await verifyPassword(u.passwordHash, input.currentPassword))) throw unauthorized('Current password is incorrect');
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
    await prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  });

  /** Leave "login as" mode and return to the admin's own session. */
  app.post('/impersonation/exit', { preHandler: authenticate }, async (req, reply) => {
    const impersonatorId = req.auth?.impersonatorId;
    if (!impersonatorId) return { ok: true };
    await revokeSession(req.cookies[COOKIE_REFRESH]);
    const admin = await prisma.user.findUnique({ where: { id: impersonatorId } });
    if (!admin || admin.role !== 'ADMIN') {
      clearSessionCookies(reply);
      throw unauthorized();
    }
    await issueSession(req, reply, admin);
    await audit(admin.id, 'impersonation.exit', { type: 'user', id: user(req).id }, undefined, req.ip);
    return { user: await toMeDTO(admin, null) };
  });
}
