import { fileURLToPath } from 'node:url';
import type { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { connectDatabase, disconnectDatabase } from './mongoose.js';
import { syncIndexes } from './sync-indexes.js';
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
import content from './seed-data/content.json' with { type: 'json' };

/**
 * Demo accounts.
 *
 * These are development credentials and are printed on every seed. Change them
 * before exposing the app to anyone: DEMO_PASSWORD is in the repository.
 */
const DEMO_PASSWORD = 'ChessHub!2026';
const ADMIN_PASSWORD = 'Admin!2026Chess';

const DEMO_USERS = [
  {
    username: 'magnus',
    email: 'magnus@chesshub.test',
    displayName: 'Magnus T.',
    country: 'Norway',
    onlineRating: 1640,
    gamesPlayed: 24,
    gamesWon: 14,
    gamesLost: 7,
    gamesDrawn: 3,
  },
  {
    username: 'hikaru',
    email: 'hikaru@chesshub.test',
    displayName: 'Hikaru N.',
    country: 'USA',
    onlineRating: 1585,
    gamesPlayed: 19,
    gamesWon: 9,
    gamesLost: 8,
    gamesDrawn: 2,
  },
];

interface SeedOptions {
  /** Wipe every collection first. Without it, seeding tops up what is missing. */
  fresh?: boolean;
}

export async function seed({ fresh = false }: SeedOptions = {}): Promise<void> {
  await syncIndexes();

  if (fresh) {
    await Promise.all([
      Admin.deleteMany({}),
      Player.deleteMany({}),
      News.deleteMany({}),
      SiteString.deleteMany({}),
      User.deleteMany({}),
      LinkRequest.deleteMany({}),
      Game.deleteMany({}),
      GameMessage.deleteMany({}),
      DirectMessage.deleteMany({}),
      BlockedUser.deleteMany({}),
    ]);
    logger.info('Cleared all collections');
  }

  // ---------------------------------------------------------------- admin
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, env.BCRYPT_ROUNDS);
  await Admin.updateOne(
    { username: 'admin' },
    { $set: { email: 'admin@chesshub.test', passwordHash: adminHash } },
    { upsert: true },
  );

  // -------------------------------------------------------------- players
  // Legacy numeric ids are kept only to re-link news to their subject.
  const playerIdByLegacy = new Map<number, Types.ObjectId>();

  for (const row of content.players) {
    const attrs = {
      nameEn: row.name_en,
      nameAr: row.name_ar,
      bioEn: row.bio_en,
      bioAr: row.bio_ar,
      country: row.country,
      rating: row.rating,
      title: row.title,
      imageUrl: row.image_url,
      dateOfBirth: row.date_of_birth ? new Date(`${row.date_of_birth}T00:00:00.000Z`) : null,
      isPlayerOfMonth: row.is_player_of_month,
      isTournamentWinner: row.is_tournament_winner,
    };

    const player = await Player.findOneAndUpdate(
      { nameEn: row.name_en },
      { $set: attrs },
      { upsert: true, returnDocument: 'after' },
    );
    playerIdByLegacy.set(row.legacy_id, player!._id);
  }

  // ----------------------------------------------------------------- news
  for (const row of content.news) {
    const title = row.title_en ?? row.title_ar ?? '';
    await News.findOneAndUpdate(
      { titleEn: row.title_en, titleAr: row.title_ar },
      {
        $set: {
          titleEn: row.title_en,
          titleAr: row.title_ar,
          contentEn: row.content_en,
          contentAr: row.content_ar,
          region: row.region as 'en' | 'ar' | 'both',
          imageUrl: row.image_url,
          published: row.published,
          isFeatured: row.is_featured,
          publishedAt: row.published ? new Date() : null,
          playerId: row.player_legacy_id ? playerIdByLegacy.get(row.player_legacy_id) : null,
        },
      },
      { upsert: true },
    );
    if (!title) logger.warn('Seeded an article with no title');
  }

  // --------------------------------------------------------- site strings
  await SiteString.bulkWrite(
    content.site_strings.map((row) => ({
      updateOne: {
        filter: { key: row.key, lang: row.lang },
        update: { $set: { value: row.value } },
        upsert: true,
      },
    })),
  );

  // --------------------------------------------------------- demo players
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_ROUNDS);
  const demoIds: Types.ObjectId[] = [];

  for (const demo of DEMO_USERS) {
    const user = await User.findOneAndUpdate(
      { username: demo.username },
      {
        $set: {
          ...demo,
          passwordHash: demoHash,
          // Pre-verified, so the demo accounts can sign in without an inbox.
          isVerified: true,
          isBanned: false,
          chatMuted: false,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    demoIds.push(user!._id);
  }

  // ------------------------------------------------------------ demo game
  // A short finished game, so the profile and "recent games" views are not
  // empty on a fresh install.
  const [whiteId, blackId] = demoIds;
  if (whiteId && blackId && (await Game.countDocuments()) === 0) {
    const moves = 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5 d2d4 e5d4 e1g1 d4c3';
    const { buildPgn, replayGame } = await import('../lib/chess.js');
    const board = replayGame(moves);

    await Game.create({
      whiteUserId: whiteId,
      blackUserId: blackId,
      creatorUserId: whiteId,
      creatorColor: 'white',
      status: 'white_wins',
      result: '1-0',
      termination: 'resignation',
      moves,
      fen: board.fen(),
      pgn: buildPgn(board.history()),
      moveCount: moves.split(' ').length,
      version: 1,
      timeControlSeconds: 600,
      incrementSeconds: 5,
      whiteTimeMs: 412_000,
      blackTimeMs: 355_000,
      rated: true,
      whiteRatingBefore: 1628,
      blackRatingBefore: 1597,
      whiteRatingAfter: 1640,
      blackRatingAfter: 1585,
      ratingsApplied: true,
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      lastMoveAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 600_000),
      endedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 620_000),
    });
  }

  const counts = {
    admins: await Admin.countDocuments(),
    players: await Player.countDocuments(),
    news: await News.countDocuments(),
    siteStrings: await SiteString.countDocuments(),
    users: await User.countDocuments(),
    games: await Game.countDocuments(),
  };

  logger.info(counts, 'Seed complete');

  /* eslint-disable no-console */
  console.log(`
  Chess Hub is seeded.

  Admin panel   http://localhost:${env.PORT}/admin/login
    username    admin
    password    ${ADMIN_PASSWORD}

  Players       http://localhost:${env.PORT}/login
    ${DEMO_USERS[0]?.username} / ${DEMO_PASSWORD}   (${DEMO_USERS[0]?.email})
    ${DEMO_USERS[1]?.username} / ${DEMO_PASSWORD}   (${DEMO_USERS[1]?.email})

  Both demo accounts are pre-verified. Change these passwords before
  exposing the app to anyone — they are in the repository.
`);
  /* eslint-enable no-console */
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fresh = process.argv.includes('--fresh');
  await connectDatabase();
  await seed({ fresh });
  await disconnectDatabase();
}
