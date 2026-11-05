import { env, assertProductionConfig } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { ensureAdminUser } from './scripts/bootstrap.js';

async function main() {
  assertProductionConfig(logger);
  await connectDB();
  await ensureAdminUser();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`PropBot API listening on port ${env.port}`, { env: env.nodeEnv });
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error('Unhandled promise rejection', { error: err }));

main().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});
