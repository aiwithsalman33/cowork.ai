import type { FastifyInstance } from 'fastify';
import {
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@cowork/shared';
import { env } from '../config.js';
import { prisma } from '../db/client.js';
import { parse } from '../lib/validate.js';
import { badRequest, conflict, forbidden, HttpError, unauthorized } from '../lib/errors.js';
import {
  MailNotConfiguredError,
  newSignupAdminEmail,
  resetPasswordEmail,
  sendMail,
  verificationEmail,
} from '../lib/mailer.js';
import { trialMs } from '../services/plans.js';
import { logger } from '../lib/logger.js';
import { hashPassword, verifyPassword, fakeVerify } from '../auth/password.js';
import {
  clearSessionCookies,
  COOKIE_REFRESH,
  issueSession,
  revokeSession,
  rotateSession,
} from '../auth/session.js';
import { authenticate, checkCsrf, user } from '../plugins/auth.js';
import { toMeDTO } from '../services/me.js';
import { audit, logEvent } from '../services/audit.js';
import { consumeEmailToken, createEmailToken } from '../services/email-tokens.js';
import { DEFAULT_SKILL_SLUGS } from '../db/skills-catalog.js';

const authLimit = { rateLimit: { max: env.AUTH_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' } };
const mailLimit = { rateLimit: { max: 5, timeWindow: '10 minutes' } };

async function sendVerification(u: { id: string; email: string; name: string }) {
  const token = await createEmailToken(u.id, 'VERIFY_EMAIL');
  await sendMail(
    verificationEmail(u.email, u.name, `${env.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`),
  );
}

function mailError(err: unknown): never {
  if (err instanceof MailNotConfiguredError) {
    throw new HttpError(
      503,
      'Email service is not configured yet. Please contact support.',
      'MAIL_UNAVAILABLE',
    );
  }
  throw err;
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * Creates the account ready to use: no email verification, the 7-day free trial starts now.
   * The user then signs in with the email and password they chose.
   */
  app.post('/signup', { config: authLimit }, async (req, reply) => {
    const input = parse(signupSchema, req.body);
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw conflict('An account with this email already exists. Sign in instead.');
    const defaultSkills = await prisma.skill.findMany({
      where: { slug: { in: DEFAULT_SKILL_SLUGS }, isPublic: true },
      select: { id: true },
    });
    const now = new Date();
    const created = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: now,
        approvedAt: now,
        plan: 'TRIAL',
        trialEndsAt: new Date(now.getTime() + trialMs()),
        agent: { create: { businessName: input.businessName ?? '', name: 'Assistant' } },
        userSkills: { create: defaultSkills.map((s) => ({ skillId: s.id, enabled: true })) },
      },
    });
    await logEvent(created.id, 'INFO', 'account.created', 'Account created — 7-day free trial started');
    if (env.ADMIN_EMAIL) {
      // best effort: never block signup on the admin notification
      await sendMail(
        newSignupAdminEmail(
          env.ADMIN_EMAIL,
          { name: created.name, email: created.email, businessName: input.businessName },
          `${env.WEB_ORIGIN}/admin/users`,
        ),
      ).catch((err) => logger.warn({ err: (err as Error).message }, 'admin signup notification failed'));
    }
    return reply.code(201).send({ created: true, email: created.email });
  });

  /**
   * Confirms the email and signs the user in. The 7-day free trial starts right away; after it ends
   * the admin activates a paid plan (see admin PATCH /users/:id).
   */
  app.post('/verify-email', { config: authLimit }, async (req, reply) => {
    const { token } = parse(verifyEmailSchema, req.body);
    const userId = await consumeEmailToken(token, 'VERIFY_EMAIL');
    if (!userId) throw badRequest('This verification link is invalid or has expired. Request a new one.');
    const current = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { agent: true } });
    const verified = await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: current.emailVerifiedAt ?? new Date(),
        lastLoginAt: new Date(),
        // first verification: start the free trial immediately (no manual approval needed)
        ...(!current.approvedAt
          ? {
              approvedAt: new Date(),
              ...(current.plan === 'TRIAL' ? { trialEndsAt: new Date(Date.now() + trialMs()) } : {}),
            }
          : {}),
      },
    });
    if (verified.status === 'SUSPENDED') throw forbidden('Your account is suspended. Contact support.');
    await issueSession(req, reply, verified);
    if (!current.emailVerifiedAt) {
      await logEvent(verified.id, 'INFO', 'account.verified', 'Email verified — 7-day free trial started');
      if (env.ADMIN_EMAIL) {
        // best effort: never block the user's verification on the admin notification
        await sendMail(
          newSignupAdminEmail(
            env.ADMIN_EMAIL,
            { name: verified.name, email: verified.email, businessName: current.agent?.businessName },
            `${env.WEB_ORIGIN}/admin/users`,
          ),
        ).catch((err) => logger.warn({ err: (err as Error).message }, 'admin signup notification failed'));
      }
    }
    return { user: await toMeDTO(verified, null) };
  });

  /** Always answers OK so the endpoint can't be used to discover registered emails. */
  app.post('/resend-verification', { config: mailLimit }, async (req) => {
    const { email } = parse(emailOnlySchema, req.body);
    const u = await prisma.user.findUnique({ where: { email } });
    if (u && !u.emailVerifiedAt) {
      try {
        await sendVerification(u);
      } catch (err) {
        mailError(err);
      }
    }
    return { ok: true };
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

  app.post('/forgot-password', { config: mailLimit }, async (req) => {
    const { email } = parse(emailOnlySchema, req.body);
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      const token = await createEmailToken(u.id, 'RESET_PASSWORD');
      try {
        await sendMail(
          resetPasswordEmail(
            u.email,
            u.name,
            `${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`,
          ),
        );
      } catch (err) {
        mailError(err);
      }
    }
    return { ok: true };
  });

  app.post('/reset-password', { config: authLimit }, async (req) => {
    const { token, password } = parse(resetPasswordSchema, req.body);
    const userId = await consumeEmailToken(token, 'RESET_PASSWORD');
    if (!userId) throw badRequest('This reset link is invalid or has expired.');
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await prisma.user.update({
      where: { id: userId },
      // the reset link proves ownership of the inbox, so it also verifies the email
      data: {
        passwordHash: await hashPassword(password),
        ...(u.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
      },
    });
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
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
    if (!(await verifyPassword(u.passwordHash, input.currentPassword)))
      throw unauthorized('Current password is incorrect');
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: u.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
