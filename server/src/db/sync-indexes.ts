import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from './mongoose.js';
import {
  Admin,
  BlockedUser,
  DirectMessage,
  Game,
  GameMessage,
  LinkRequest,
  News,
  Player,
  SiteString,
  User,
} from '../models/index.js';
import { logger } from '../lib/logger.js';

const MODELS = [
  Admin,
  Player,
  News,
  SiteString,
  User,
  LinkRequest,
  Game,
  GameMessage,
  DirectMessage,
  BlockedUser,
];

/**
 * Create or update every declared index.
 *
 * Index building is an explicit step rather than something every process races
 * to do on boot (`autoIndex` is off), because on a large collection it is slow
 * and a surprise. Run it on deploy, from the seeder, and from the test harness.
 *
 * Several of the indexes are not optimisations but constraints — one open
 * challenge per player, one pending link request per user, one account per
 * player profile — so the application depends on this having run.
 */
export async function syncIndexes(): Promise<void> {
  for (const model of MODELS) {
    await model.syncIndexes();
  }
  logger.debug({ models: MODELS.map((model) => model.modelName) }, 'Indexes synced');
}

// Also runnable directly: npm run db:indexes
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await connectDatabase();
  await syncIndexes();
  logger.info('Indexes synced');
  await disconnectDatabase();
}
