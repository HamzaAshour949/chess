import type { Express } from 'express';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase, mongoose } from '../../src/db/mongoose.js';
import { Admin, User } from '../../src/models/index.js';
import { signToken } from '../../src/lib/jwt.js';

let app: Express | null = null;

export async function testApp(): Promise<Express> {
  await connectDatabase();
  app ??= createApp();
  return app;
}

export async function request() {
  return supertest(await testApp());
}

/** Drop every document, so each test file starts from a known state. */
export async function resetDatabase(): Promise<void> {
  await connectDatabase();
  const collections = await mongoose.connection.db?.collections();
  await Promise.all((collections ?? []).map((collection) => collection.deleteMany({})));
}

export async function closeDatabase(): Promise<void> {
  await disconnectDatabase();
}

const PASSWORD_HASH_ROUNDS = 10;

export async function makeAdmin(overrides: Partial<{ username: string; email: string; password: string }> = {}) {
  const password = overrides.password ?? 'admin-password-123';
  const admin = await Admin.create({
    username: overrides.username ?? 'admin',
    email: overrides.email ?? 'admin@chesshub.test',
    passwordHash: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
  });
  return { admin, password, token: signToken(String(admin._id), 'admin') };
}

export async function makeUser(
  overrides: Partial<{
    username: string;
    email: string;
    password: string;
    isVerified: boolean;
    isBanned: boolean;
    onlineRating: number;
    gamesPlayed: number;
    chatMuted: boolean;
  }> = {},
) {
  const password = overrides.password ?? 'player-password-123';
  const suffix = Math.random().toString(36).slice(2, 8);
  const user = await User.create({
    username: overrides.username ?? `player_${suffix}`,
    email: overrides.email ?? `player_${suffix}@chesshub.test`,
    passwordHash: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
    isVerified: overrides.isVerified ?? true,
    isBanned: overrides.isBanned ?? false,
    onlineRating: overrides.onlineRating ?? 1200,
    gamesPlayed: overrides.gamesPlayed ?? 0,
    chatMuted: overrides.chatMuted ?? false,
  });
  return { user, password, token: signToken(String(user._id), 'user') };
}

/** `Authorization` header value for a token. */
export function auth(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
