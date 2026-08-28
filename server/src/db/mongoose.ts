import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

mongoose.set('strictQuery', true);
// Index creation is an explicit deploy step (npm run db:indexes), not something
// that races every process on boot.
mongoose.set('autoIndex', false);

let connecting: Promise<typeof mongoose> | null = null;

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
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/**
 * Does this deployment support multi-document transactions?
 *
 * MongoDB only offers them on a replica set or sharded cluster. Running
 * standalone is a valid (if weaker) setup, so callers fall back to sequential
 * writes rather than failing outright.
 */
export async function supportsTransactions(): Promise<boolean> {
  try {
    const info = await mongoose.connection.db?.admin().command({ hello: 1 });
    return Boolean(info?.setName || info?.msg === 'isdbgrid');
  } catch {
    return false;
  }
}

export { mongoose };
