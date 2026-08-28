import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './db/mongoose.js';
import { closeRealtime, createRealtime } from './realtime/io.js';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = createServer(app);
  // Socket.IO shares the HTTP server, so there is one port and one origin.
  const io = createRealtime(server);

  server.listen(env.PORT, () => {
    logger.info(`Chess Hub listening on http://localhost:${env.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    void closeRealtime(io).finally(() => {
      server.close(() => {
        void disconnectDatabase().finally(() => process.exit(0));
      });
    });

    // Do not let a stuck connection hold the process open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
