import type { FastifyBaseLogger } from 'fastify';
import { env } from './config.js';
import { prisma } from './db/client.js';
import { registerHandlers, startQueue, stopQueue } from './queue/index.js';
import { ingestInbound, processInbound } from './services/pipeline.js';
import { summarizeConversation } from './services/memory.js';
import { markExpiredTrials, runDueSchedules } from './services/schedules.js';
import { bootSessions, setInboundHandler, stopAllSessions } from './channels/baileys.js';

let wired = false;

/** Connects queue jobs and WhatsApp socket events to the message pipeline (idempotent). */
export function wireHandlers() {
  if (wired) return;
  wired = true;
  registerHandlers({
    inbound: processInbound,
    summarize: summarizeConversation,
    tick: async () => {
      await runDueSchedules();
      await markExpiredTrials();
    },
  });
  setInboundHandler(async (channelId, msg) => {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (channel) await ingestInbound(channel, msg);
  });
}

export async function startBackground(log: FastifyBaseLogger) {
  wireHandlers();
  await startQueue(env.WORKERS_ENABLED);
  if (env.BAILEYS_ENABLED) await bootSessions();
  log.info('background services started');
}

export async function stopBackground() {
  await stopQueue();
  await stopAllSessions();
}
