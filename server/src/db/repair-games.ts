import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from './mongoose.js';
import { Game } from '../models/index.js';
import { buildPgn, replayGame } from '../lib/chess.js';
import { logger } from '../lib/logger.js';

/**
 * Recompute every game's derived fields from its move list.
 *
 * `moves` is the source of truth; `fen`, `pgn` and `moveCount` are caches. This
 * rebuilds them, which repairs any game whose cache was written by older code
 * or drifted. Safe to run at any time — it is a pure recomputation and touches
 * nothing else.
 */
export async function repairGames(): Promise<{ checked: number; repaired: number; broken: string[] }> {
  const games = await Game.find({}, 'moves fen pgn moveCount');
  const broken: string[] = [];
  let repaired = 0;

  for (const game of games) {
    let board;
    try {
      board = replayGame(game.moves);
    } catch {
      // An unplayable history is a real problem, not something to paper over.
      broken.push(String(game._id));
      continue;
    }

    const fen = board.fen();
    const pgn = buildPgn(board.history());
    const moveCount = board.history().length;

    if (game.fen !== fen || game.pgn !== pgn || game.moveCount !== moveCount) {
      await Game.updateOne({ _id: game._id }, { $set: { fen, pgn, moveCount } });
      repaired += 1;
    }
  }

  return { checked: games.length, repaired, broken };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await connectDatabase();
  const result = await repairGames();
  logger.info(result, 'Game cache repair complete');
  if (result.broken.length > 0) {
    logger.error({ ids: result.broken }, 'Games with an unplayable move list');
  }
  await disconnectDatabase();
}
