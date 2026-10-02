import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prepareDummyHash } from './lib/password.js';
import { connectDatabase, disconnectDatabase } from './db/mongoose.js';
import { syncIndexes } from './db/sync-indexes.js';
import { closeRealtime, createRealtime } from './realtime/io.js';
import { startSweeper } from './services/game-service.js';

async function main(): Promise<void> {
  // bcrypt runs on a worker thread, so this overlaps with connecting.
  const dummyHashReady = prepareDummyHash();
  await connectDatabase();

  // Several indexes are constraints the code relies on (one open challenge
  // per player, case-insensitive unique usernames, ...), so they are brought
  // in line before the first request, not left to a step someone may forget.
  if (env.DB_SYNC_INDEXES) await syncIndexes();

  const app = createApp();
  const server = createServer(app);
  // Keep-alive a little longer than a typical load balancer's idle timeout,
  // so the balancer never reuses a connection this side just closed.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Socket.IO shares the HTTP server, so there is one port and one origin.
  const io = createRealtime(server);
  // Flags fall and stale challenges lapse even when nobody is watching.
  const stopSweeper = startSweeper();

  // Before the first sign-in can arrive; see prepareDummyHash().
  await dummyHashReady;
  server.listen(env.PORT, () => {
    logger.info(`Chess Hub listening on http://localhost:${env.PORT} (bun ${Bun.version})`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    stopSweeper();
    // Stop accepting, give in-flight requests a few seconds to finish, then
    // drop what is left (see closeRealtime for why that last step matters).
    void closeRealtime(io, server, 5_000)
      .then(() => disconnectDatabase())
      .then(() => process.exit(0))
      .catch((error) => {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      });

    // Do not let a stuck connection hold the process open forever.
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
