import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import { isProvisional, type GameDoc, type NewsDoc, type PlayerDoc, type UserDoc } from '../models/index.js';
import { turnFromFen } from './chess.js';

/**
 * API response shapes.
 *
 * The wire format is snake_case and every field is listed explicitly, so
 * adding a column to a model can never accidentally start publishing it.
 * Password and OTP hashes have no serializer at all.
 */

export type Lang = 'en' | 'ar';

export function normalizeLang(value: unknown): Lang {
  return value === 'ar' ? 'ar' : 'en';
}

function id(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** A ref that may or may not have been populated. */
type Ref<T> = Types.ObjectId | T | null | undefined;

function populated<T extends { _id: unknown }>(ref: Ref<T>): T | null {
  if (!ref) return null;
  return typeof ref === 'object' && '_id' in ref && Object.keys(ref).length > 1 ? (ref as T) : null;
}

// ------------------------------------------------------------------ player

export function serializePlayer(player: PlayerDoc, lang: Lang = 'en') {
  return {
    id: String(player._id),
    name: lang === 'ar' ? player.nameAr : player.nameEn,
    name_en: player.nameEn,
    name_ar: player.nameAr,
    bio: lang === 'ar' ? player.bioAr : player.bioEn,
    bio_en: player.bioEn,
    bio_ar: player.bioAr,
    country: player.country,
    rating: player.rating,
    title: player.title,
    image_url: player.imageUrl,
    date_of_birth: player.dateOfBirth ? new Date(player.dateOfBirth).toISOString().slice(0, 10) : null,
    is_player_of_month: player.isPlayerOfMonth,
    is_tournament_winner: player.isTournamentWinner,
    created_at: iso(player.createdAt),
    updated_at: iso(player.updatedAt),
  };
}

// -------------------------------------------------------------------- news

export function serializeNews(article: NewsDoc, lang: Lang = 'en') {
  const player = populated<PlayerDoc>(article.playerId as Ref<PlayerDoc>);
  return {
    id: String(article._id),
    title: lang === 'ar' ? article.titleAr : article.titleEn,
    title_en: article.titleEn,
    title_ar: article.titleAr,
    content: lang === 'ar' ? article.contentAr : article.contentEn,
    content_en: article.contentEn,
    content_ar: article.contentAr,
    region: article.region,
    image_url: article.imageUrl,
    published: article.published,
    is_featured: article.isFeatured,
    published_at: iso(article.publishedAt),
    player_id: id(article.playerId),
    player_name: player ? (lang === 'ar' ? player.nameAr : player.nameEn) : null,
    created_at: iso(article.createdAt),
    updated_at: iso(article.updatedAt),
  };
}

// -------------------------------------------------------------------- user

/** Everything anyone may see about a player. Never includes an email. */
export function serializeUser(user: UserDoc) {
  const linked = populated<PlayerDoc>(user.linkedPlayerId as Ref<PlayerDoc>);
  return {
    id: String(user._id),
    username: user.username,
    display_name: user.displayName || user.username,
    avatar_url: user.avatarUrl,
    country: user.country,
    online_rating: user.onlineRating,
    games_played: user.gamesPlayed,
    games_won: user.gamesWon,
    games_lost: user.gamesLost,
    games_drawn: user.gamesDrawn,
    is_provisional: isProvisional(user.gamesPlayed),
    linked_player_id: id(user.linkedPlayerId),
    linked_player_name: linked?.nameEn ?? null,
    linked_player_title: linked?.title ?? null,
    is_banned: user.isBanned,
    created_at: iso(user.createdAt),
  };
}

/** The account holder's own view, plus everything an admin may see. */
export function serializeUserPrivate(user: UserDoc) {
  return {
    ...serializeUser(user),
    email: user.email,
    is_verified: user.isVerified,
    banned_at: iso(user.bannedAt),
    ban_reason: user.banReason,
    chat_muted: user.chatMuted,
    last_login_at: iso(user.lastLoginAt),
    notif_email: user.notifEmail,
    notif_dm: user.notifDm,
    notif_game_chat: user.notifGameChat,
    notif_sound: user.notifSound,
  };
}

export function serializeAdmin(admin: { _id: unknown; username: string; email: string; createdAt?: Date }) {
  return {
    id: String(admin._id),
    username: admin.username,
    email: admin.email,
    created_at: iso(admin.createdAt),
  };
}

// -------------------------------------------------------------------- game

/**
 * Remaining time for both sides, with the time already spent on the current
 * move subtracted.
 *
 * The stored value is only updated when a move is played, so a client reading
 * it raw would show a frozen clock for the side to move.
 */
export function liveClocks(game: GameDoc, now = Date.now()): { white: number | null; black: number | null } {
  if (game.whiteTimeMs == null || game.blackTimeMs == null) {
    return { white: null, black: null };
  }

  let white = game.whiteTimeMs;
  let black = game.blackTimeMs;

  if (game.status === 'active') {
    const since = game.lastMoveAt ?? game.startedAt;
    if (since) {
      const elapsed = Math.max(0, now - new Date(since).getTime());
      if (turnFromFen(game.fen) === 'white') white = Math.max(0, white - elapsed);
      else black = Math.max(0, black - elapsed);
    }
  }

  return { white: white / 1000, black: black / 1000 };
}

export function serializeGame(game: GameDoc) {
  const white = populated<UserDoc>(game.whiteUserId as Ref<UserDoc>);
  const black = populated<UserDoc>(game.blackUserId as Ref<UserDoc>);
  const creator = populated<UserDoc>(game.creatorUserId as Ref<UserDoc>);
  const clocks = liveClocks(game);

  return {
    id: String(game._id),
    status: game.status,
    result: game.result,
    termination: game.termination,
    fen: game.fen,
    pgn: game.pgn,
    moves: game.moves,
    move_count: game.moveCount,
    /** Bumped on every observable change, so clients can skip unchanged polls. */
    version: game.version,
    turn: turnFromFen(game.fen),

    time_control_seconds: game.timeControlSeconds,
    increment_seconds: game.incrementSeconds,
    white_time_remaining: clocks.white,
    black_time_remaining: clocks.black,
    /**
     * The server's clock at the moment of this response. Clients diff against
     * it to correct for their own clock skew instead of assuming the two
     * machines agree, which is what the old SPA did.
     */
    server_time: new Date().toISOString(),

    rated: game.rated,
    min_opp_rating: game.minOppRating,
    max_opp_rating: game.maxOppRating,
    chat_disabled: game.chatDisabled,
    voided: Boolean(game.voidedAt),
    void_reason: game.voidReason,

    creator_color: game.creatorColor,
    creator_user_id: id(game.creatorUserId),
    creator_user: creator ? serializeUser(creator) : null,
    white_user: white ? serializeUser(white) : null,
    black_user: black ? serializeUser(black) : null,

    white_rating_before: game.whiteRatingBefore,
    black_rating_before: game.blackRatingBefore,
    white_rating_after: game.whiteRatingAfter,
    black_rating_after: game.blackRatingAfter,

    draw_offer_by: id(game.drawOfferBy),

    started_at: iso(game.startedAt),
    last_move_at: iso(game.lastMoveAt),
    ended_at: iso(game.endedAt),
    created_at: iso(game.createdAt),
  };
}

export type SerializedGame = ReturnType<typeof serializeGame>;

// ---------------------------------------------------------------- messages

export function serializeGameMessage(message: {
  _id: unknown;
  gameId: unknown;
  userId: unknown;
  content: string;
  isDeleted: boolean;
  createdAt?: Date;
}) {
  const author = populated<UserDoc>(message.userId as Ref<UserDoc>);
  return {
    id: String(message._id),
    game_id: id(message.gameId),
    user_id: id(message.userId),
    username: author?.username ?? null,
    display_name: author ? author.displayName || author.username : null,
    content: message.isDeleted ? '[deleted by admin]' : message.content,
    is_deleted: message.isDeleted,
    created_at: iso(message.createdAt),
  };
}

export function serializeDirectMessage(
  message: {
    _id: unknown;
    senderId: unknown;
    recipientId: unknown;
    content: string;
    isDeleted: boolean;
    readAt?: Date | null;
    createdAt?: Date;
  },
  viewerId?: string,
) {
  const sender = populated<UserDoc>(message.senderId as Ref<UserDoc>);
  const recipient = populated<UserDoc>(message.recipientId as Ref<UserDoc>);
  return {
    id: String(message._id),
    sender_id: id(message.senderId),
    recipient_id: id(message.recipientId),
    sender: sender ? serializeUser(sender) : null,
    recipient: recipient ? serializeUser(recipient) : null,
    content: message.isDeleted ? '[deleted by admin]' : message.content,
    is_deleted: message.isDeleted,
    is_read: Boolean(message.readAt),
    is_mine: viewerId !== undefined && id(message.senderId) === viewerId,
    created_at: iso(message.createdAt),
  };
}

// -------------------------------------------------------------- pagination

export interface Page {
  page: number;
  perPage: number;
  total: number;
}

export function paginationMeta({ page, perPage, total }: Page) {
  return {
    total,
    page,
    per_page: perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
    current_page: page,
  };
}

export const DEFAULT_RATING = env.DEFAULT_RATING;
