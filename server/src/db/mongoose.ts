import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

mongoose.set('strictQuery', true);
// Index creation is an explicit step (see sync-indexes.ts), not something every
// model races to do the first time it is used.
mongoose.set('autoIndex', false);

let connecting: Promise<typeof mongoose> | null = null;
let transactions: Promise<boolean> | null = null;

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!connecting) {
    connecting = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 20,
        minPoolSize: 2,
        retryWrites: true,
      })
      .then((m) => {
        logger.info({ db: m.connection.name }, 'MongoDB connected');
        return m;
      })
      .catch((error) => {
        connecting = null;
        throw error;
      });
  }
  return connecting;
}

export async function disconnectDatabase(): Promise<void> {
  connecting = null;
  transactions = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/** True while the driver holds a live connection; used by the health check. */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Does this deployment support multi-document transactions?
 *
 * MongoDB only offers them on a replica set or sharded cluster. Running
 * standalone is a valid (if weaker) setup, so callers fall back to sequential
 * writes rather than failing outright. The topology does not change while the
 * process runs, so the answer is asked for once, not on every game finish.
 */
export function supportsTransactions(): Promise<boolean> {
  transactions ??= (async () => {
    try {
      const info = await mongoose.connection.db?.admin().command({ hello: 1 });
      return Boolean(info?.setName || info?.msg === 'isdbgrid');
    } catch {
      return false;
    }
  })();
  return transactions;
}

export { mongoose };
