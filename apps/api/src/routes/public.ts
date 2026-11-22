import type { FastifyInstance } from 'fastify';
import { contactSchema } from '@cowork/shared';
import { prisma } from '../db/client.js';
import { parse } from '../lib/validate.js';

/** Unauthenticated endpoints used by the marketing site. */
export async function publicRoutes(app: FastifyInstance) {
  /** Landing-page contact form. Saved for the admin panel; the browser also opens WhatsApp. */
  app.post(
    '/contact',
    { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const input = parse(contactSchema, req.body);
      await prisma.contactMessage.create({
        data: {
          name: input.name,
          phone: input.phone,
          email: input.email || null,
          business: input.business || null,
          message: input.message,
          ip: req.ip,
        },
      });
      return reply.code(201).send({ ok: true });
    },
  );
}
