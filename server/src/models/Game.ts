import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { START_FEN } from '../lib/chess.js';

export const GAME_STATUSES = [
  'open',
  'active',
  'white_wins',
  'black_wins',
  'draw',
  'aborted',
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const FINISHED_STATUSES = ['white_wins', 'black_wins', 'draw'] as const;

export const GAME_COLORS = ['white', 'black', 'random'] as const;
export type GameColor = (typeof GAME_COLORS)[number];

/**
 * A chess game between two users.
 *
 * `moves` (space-separated UCI) is the source of truth. `fen`, `pgn` and
 * `moveCount` are caches recomputed from it on every write, so a tampered or
 * stale FEN can never make an illegal position stand.
 *
 * `version` increments on *any* observable change — including draw offers and
 * chat toggles, which no move counter would catch. The Flask version derived
 * its version from move_count alone, so a client polling for changes never saw
 * an incoming draw offer until the next move was played.
 */
const gameSchema = new Schema(
  {
    whiteUserId: { type: Types.ObjectId, ref: 'User', default: null },
    blackUserId: { type: Types.ObjectId, ref: 'User', default: null },
    creatorUserId: { type: Types.ObjectId, ref: 'User', required: true },
    creatorColor: { type: String, enum: GAME_COLORS, default: 'random' },

    /**
     * A direct challenge (or rematch offer) is addressed to one player: only
     * they may accept it, and it never appears in the public lobby.
     */
    invitedUserId: { type: Types.ObjectId, ref: 'User', default: null },
    /** Mirrors `invitedUserId != null`; partial indexes need a plain equality. */
    direct: { type: Boolean, default: false },
    /** The finished game this one is a rematch of. */
    rematchOfGameId: { type: Types.ObjectId, ref: 'Game', default: null },

    status: { type: String, enum: GAME_STATUSES, default: 'open' },
    /** "1-0" | "0-1" | "1/2-1/2" */
    result: { type: String, default: null },
    /** checkmate | stalemate | resignation | timeout | agreement | abandoned | ... */
    termination: { type: String, default: null },

    moves: { type: String, default: '' },
    fen: { type: String, default: START_FEN },
    pgn: { type: String, default: '' },
    moveCount: { type: Number, default: 0 },
    version: { type: Number, default: 0 },

    // Clocks are milliseconds. Whole-second budgets accumulate rounding drift
    // across a long Fischer-increment game; milliseconds do not.
    timeControlSeconds: { type: Number, default: 0, min: 0 },
    incrementSeconds: { type: Number, default: 0, min: 0 },
    whiteTimeMs: { type: Number, default: null },
    blackTimeMs: { type: Number, default: null },
    /**
     * When the side to move runs out: its flag, or the first-move deadline.
     * Kept on the document so the sweeper can find expired games with one
     * indexed query instead of replaying every live clock.
     */
    deadlineAt: { type: Date, default: null },

    rated: { type: Boolean, default: true },
    minOppRating: { type: Number, default: null },
    maxOppRating: { type: Number, default: null },

    whiteRatingBefore: { type: Number, default: null },
    blackRatingBefore: { type: Number, default: null },
    whiteRatingAfter: { type: Number, default: null },
    blackRatingAfter: { type: Number, default: null },
    /** Guards the rating write so a retried finish can never double-apply Elo. */
    ratingsApplied: { type: Boolean, default: false },

    drawOfferBy: { type: Types.ObjectId, ref: 'User', default: null },

    chatDisabled: { type: Boolean, default: false },
    voidedAt: { type: Date, default: null },
    voidedByAdminId: { type: Types.ObjectId, ref: 'Admin', default: null },
    voidReason: { type: String, default: null },

    startedAt: { type: Date, default: null },
    lastMoveAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'games' },
);

// Lobby (open, newest first) and the spectator list (active, most recent move).
gameSchema.index({ status: 1, createdAt: -1 });
gameSchema.index({ status: 1, lastMoveAt: -1 });
// "My games" looks the player up on either side.
gameSchema.index({ whiteUserId: 1, createdAt: -1 });
gameSchema.index({ blackUserId: 1, createdAt: -1 });
gameSchema.index({ creatorUserId: 1, status: 1 });
gameSchema.index({ invitedUserId: 1, status: 1 });
// Recently finished games on the homepage.
gameSchema.index({ status: 1, endedAt: -1 });
// The clock sweeper: live games whose deadline has passed.
gameSchema.index({ status: 1, deadlineAt: 1 });
// One open lobby challenge per creator, enforced by the database.
gameSchema.index(
  { creatorUserId: 1 },
  {
    unique: true,
    name: 'one_open_seek_per_creator',
    partialFilterExpression: { status: 'open', direct: false },
  },
);
// And one pending direct challenge per pair of players.
gameSchema.index(
  { creatorUserId: 1, invitedUserId: 1 },
  {
    unique: true,
    name: 'one_open_invite_per_pair',
    partialFilterExpression: { status: 'open', direct: true },
  },
);

export type GameAttrs = InferSchemaType<typeof gameSchema>;
export type GameDoc = HydratedDocument<GameAttrs>;

export const Game = model('Game', gameSchema);
