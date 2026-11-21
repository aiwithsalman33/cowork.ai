import type { FastifyInstance } from 'fastify';
import { dashboardRoutes } from './dashboard.js';

/** Registers all tenant, admin and webhook routes. */
export async function registerRoutes(app: FastifyInstance) {
  await app.register(dashboardRoutes, { prefix: '/api' });
}
