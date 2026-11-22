import { PgBoss } from 'pg-boss';
import { env } from '../config.js';
import { logger } from '../lib/logger.js';

export const QUEUES = {
  inbound: 'inbound-message',
  summarize: 'summarize-conversation',
  tick: 'minute-tick',
} as const;

type Handlers = {
  inbound: (messageId: string, attempt: number) => Promise<void>;
  summarize: (conversationId: string) => Promise<void>;
  tick: () => Promise<void>;
};

let boss: PgBoss | null = null;
let handlers: Handlers | null = null;

/** pg doesn't understand Prisma's ?schema= parameter. */
function pgConnectionString(url: string) {
  const u = new URL(url);
  u.searchParams.delete('schema');
  return u.toString();
}

export function registerHandlers(h: Handlers) {
  handlers = h;
}

export async function startQueue(withWorkers: boolean) {
  if (!env.QUEUE_ENABLED) return;
  boss = new PgBoss({
    connectionString: pgConnectionString(env.DATABASE_URL),
    schema: 'pgboss',
    application_name: 'cowork-api',
  });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();
  await boss.createQueue(QUEUES.inbound, {
    retryLimit: 4,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 300,
    expireInSeconds: 300,
  });
  await boss.createQueue(QUEUES.summarize, { retryLimit: 2, retryDelay: 30, expireInSeconds: 300 });
  await boss.createQueue(QUEUES.tick, { retryLimit: 0, expireInSeconds: 120 });

  if (withWorkers && handlers) {
    const h = handlers;
    await boss.work<{ messageId: string }>(QUEUES.inbound, { localConcurrency: 8 }, async (jobs) => {
      for (const job of jobs) await h.inbound(job.data.messageId, job.retryCount);
    });
    await boss.work<{ conversationId: string }>(QUEUES.summarize, { localConcurrency: 2 }, async (jobs) => {
      for (const job of jobs) await h.summarize(job.data.conversationId);
    });
    await boss.work(QUEUES.tick, async () => {
      await h.tick();
    });
    await boss.schedule(QUEUES.tick, '* * * * *');
  }
  logger.info({ workers: withWorkers }, 'queue started');
}

export async function stopQueue() {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 20_000 } as never);
  boss = null;
}

/**
 * Enqueue processing of an inbound message. The singletonKey makes duplicate enqueues of the same
 * message a no-op. Without a queue (tests / QUEUE_ENABLED=false) it runs inline.
 */
export async function enqueueInbound(messageId: string) {
  if (boss) {
    await boss.send(QUEUES.inbound, { messageId }, { singletonKey: messageId });
    return;
  }
  // inline: no retries available, so treat this as the final attempt
  if (handlers)
    await handlers
      .inbound(messageId, Number.MAX_SAFE_INTEGER)
      .catch((err) => logger.warn({ err }, 'inline inbound failed'));
}

export async function enqueueSummarize(conversationId: string) {
  if (boss) {
    await boss.send(
      QUEUES.summarize,
      { conversationId },
      { singletonKey: conversationId, singletonSeconds: 120 },
    );
    return;
  }
  if (handlers)
    await handlers.summarize(conversationId).catch((err) => logger.warn({ err }, 'inline summarize failed'));
}
