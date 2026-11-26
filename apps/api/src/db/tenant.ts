import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as basePrisma } from './client.js';

/** Every model that belongs to exactly one tenant via a `userId` column. */
export const TENANT_MODELS = new Set<string>([
  'Agent',
  'ApiKey',
  'UserSkill',
  'Channel',
  'Contact',
  'Conversation',
  'Message',
  'Appointment',
  'Lead',
  'GoogleConnection',
  'AgentSheet',
  'IntegrationRequest',
  'Schedule',
  'EventLog',
  'WhatsAppTemplate',
  'Payment',
]);

const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

/**
 * Returns a Prisma client where every query on a tenant model is forced to `userId = <tenant>`:
 *  - reads/updates/deletes get `userId` ANDed into their `where`
 *  - creates/upserts get `userId` written into their data (overriding any value passed in)
 * Non-tenant models (User, Skill, AuditLog, ...) pass through untouched.
 */
export function tenantDb(userId: string, client: PrismaClient = basePrisma) {
  if (!userId) throw new Error('tenantDb requires a userId');
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const a = { ...(args as AnyArgs) };

          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), userId };
          }
          if (operation === 'create') {
            a.data = { ...(a.data as Record<string, unknown>), userId };
          }
          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((r) => ({ ...(r as Record<string, unknown>), userId }));
          }
          if (operation === 'upsert') {
            a.create = { ...(a.create ?? {}), userId };
          }
          if (
            (operation === 'update' || operation === 'updateMany') &&
            a.data &&
            typeof a.data === 'object'
          ) {
            // never allow moving a row to another tenant
            const d = { ...(a.data as Record<string, unknown>) };
            delete d.userId;
            a.data = d;
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
export { Prisma };
