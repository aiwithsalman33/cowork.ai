import { env } from './config.js';
import { buildApp } from './app.js';
import { prisma } from './db/client.js';
import { logger } from './lib/logger.js';
import { seed } from './db/seed.js';
import { startBackground, stopBackground } from './background.js';

async function main() {
  await seed().catch((err) => logger.error({ err }, 'seed failed'));
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  await startBackground(app.log);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 25_000);
    force.unref();
    try {
      await app.close(); // stop accepting HTTP first
      await stopBackground(); // drain queue workers, close WhatsApp sockets (sessions stay on disk)
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
