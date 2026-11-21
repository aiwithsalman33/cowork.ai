import type { FastifyBaseLogger } from 'fastify';

/** Starts queue workers, schedulers and WhatsApp sessions. Filled in by the channels phase. */
export async function startBackground(_log: FastifyBaseLogger) {}

export async function stopBackground() {}
