import type { FastifyInstance } from 'fastify';
import { dashboardRoutes } from './dashboard.js';
import { agentRoutes } from './agent.js';
import { skillRoutes } from './skills.js';
import { channelRoutes } from './channels.js';
import { inboxRoutes } from './inbox.js';
import { integrationRoutes } from './integrations.js';
import { webhookRoutes } from './webhooks.js';
import { billingRoutes, razorpayWebhookRoutes } from './billing.js';
import { adminRoutes } from './admin/index.js';

/** Registers all tenant, admin and webhook routes. */
export async function registerRoutes(app: FastifyInstance) {
  await app.register(dashboardRoutes, { prefix: '/api' });
  await app.register(agentRoutes, { prefix: '/api' });
  await app.register(skillRoutes, { prefix: '/api' });
  await app.register(channelRoutes, { prefix: '/api' });
  await app.register(inboxRoutes, { prefix: '/api' });
  await app.register(integrationRoutes, { prefix: '/api' });
  await app.register(billingRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(razorpayWebhookRoutes, { prefix: '/webhooks' });
}
