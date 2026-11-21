import { PrismaClient } from '@prisma/client';
import { isProd } from '../config.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Unscoped client. Only use it for auth, admin, webhooks (before the tenant is known),
 * and background jobs. Request handlers for tenants should use `req.db` (see tenant.ts).
 */
export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: isProd ? ['error'] : ['warn', 'error'] });

if (!isProd) globalForPrisma.prisma = prisma;
