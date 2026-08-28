import { env } from '../config/env.js';

/**
 * Elo rating maths for the platform's online games.
 *
 * K-factor schedule (FIDE-inspired):
 *   - provisional (fewer than PROVISIONAL_GAMES games): 40
 *   - established, rating < 2400:                       20
 *   - established, rating >= 2400:                      10
 */
export function kFactor(rating: number, gamesPlayed: number): number {
  if (gamesPlayed < env.PROVISIONAL_GAMES) return 40;
  if (rating >= 2400) return 10;
  return 20;
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export interface RatingChange {
  whiteAfter: number;
  blackAfter: number;
  whiteDelta: number;
  blackDelta: number;
}

/**
 * New ratings after a game.
 *
 * `gamesPlayed` counts are the values *before* this game, so the K-factor
 * reflects the players' status going in.
 *
 * @param result "1-0" (white wins), "0-1" (black wins) or "1/2-1/2" (draw)
 */
export function calculateRatings(
  whiteRating: number,
  blackRating: number,
  whiteGamesPlayed: number,
  blackGamesPlayed: number,
  result: string,
): RatingChange {
  const whiteScore = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
  const blackScore = 1 - whiteScore;

  const whiteExpected = expectedScore(whiteRating, blackRating);
  const blackExpected = 1 - whiteExpected;

  const whiteAfter = Math.round(
    whiteRating + kFactor(whiteRating, whiteGamesPlayed) * (whiteScore - whiteExpected),
  );
  const blackAfter = Math.round(
    blackRating + kFactor(blackRating, blackGamesPlayed) * (blackScore - blackExpected),
  );

  return {
    whiteAfter,
    blackAfter,
    whiteDelta: whiteAfter - whiteRating,
    blackDelta: blackAfter - blackRating,
  };
}
