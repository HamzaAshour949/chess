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
 * Make the database's indexes match the schemas: create what is missing,
 * rebuild what changed, drop what no schema declares any more.
 *
 * Several of the indexes are not optimisations but constraints — one open
 * challenge per player, one pending link request per user, one account per
 * player profile, case-insensitive unique usernames — so the application
 * depends on this having run. The server does it on boot unless
 * DB_SYNC_INDEXES=0 (for deployments that run it as a release step instead),
 * and it is also available as `bun run db:indexes`.
 */
export async function syncIndexes(): Promise<void> {
  for (const model of MODELS) {
    await model.syncIndexes();
  }
  logger.debug({ models: MODELS.map((model) => model.modelName) }, 'Indexes synced');
}

if (import.meta.main) {
  await connectDatabase();
  await syncIndexes();
  logger.info('Indexes synced');
  await disconnectDatabase();
}
