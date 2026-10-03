import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { env } from '../config/env.js';

export const USER_LANGS = ['en', 'ar'] as const;
export type UserLang = (typeof USER_LANGS)[number];

/**
 * Case-insensitive comparison for usernames.
 *
 * "Magnus" and "magnus" are the same account. The unique index is built with
 * this collation, so the database — not a check-then-insert that two
 * concurrent sign-ups could both pass — is what refuses the duplicate, and
 * lookups that pass the same collation use the index.
 */
export const USERNAME_COLLATION = { locale: 'en', strength: 2 } as const;

/** Unverified sign-ups are removed after this long, freeing the name and email. */
const UNVERIFIED_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * A platform account that plays games.
 *
 * Never an admin: there is no role field here, and no route promotes a user.
 */
const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 190 },
    passwordHash: { type: String, required: true, select: false },
    /**
     * Bumped on a password change, a reset or "sign out everywhere". Tokens
     * carry the value they were issued under, so bumping it revokes every
     * token already handed out without a server-side session store.
     */
    tokenVersion: { type: Number, default: 0 },
    displayName: { type: String, default: null, maxlength: 120 },
    avatarUrl: { type: String, default: null, maxlength: 500 },
    country: { type: String, default: null, maxlength: 100 },
    /** Preferred language, used for emails. */
    lang: { type: String, enum: USER_LANGS, default: 'en' },

    // Email verification by one-time code. The code is stored as a bcrypt hash
    // so a database leak cannot be replayed to seize pending accounts.
    isVerified: { type: Boolean, default: false },
    otpCodeHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpLastSentAt: { type: Date, default: null, select: false },

    // Password reset, by a separate one-time code with its own counters, so a
    // reset in flight never interferes with a pending verification.
    resetCodeHash: { type: String, default: null, select: false },
    resetExpiresAt: { type: Date, default: null, select: false },
    resetAttempts: { type: Number, default: 0, select: false },
    resetLastSentAt: { type: Date, default: null, select: false },

    // Online Elo, deliberately separate from the editorial Player.rating.
    onlineRating: { type: Number, default: () => env.DEFAULT_RATING, min: 0, max: 4000 },
    gamesPlayed: { type: Number, default: 0, min: 0 },
    gamesWon: { type: Number, default: 0, min: 0 },
    gamesLost: { type: Number, default: 0, min: 0 },
    gamesDrawn: { type: Number, default: 0, min: 0 },

    // One-way, admin-granted association with an editorial profile. Being
    // linked confers identity only. Uniqueness is enforced by the partial
    // index below, not by a check-then-write that two concurrent approvals
    // could both pass.
    linkedPlayerId: { type: Types.ObjectId, ref: 'Player', default: null },

    isBanned: { type: Boolean, default: false },
    bannedAt: { type: Date, default: null },
    banReason: { type: String, default: null },
    chatMuted: { type: Boolean, default: false },

    notifEmail: { type: Boolean, default: true },
    notifDm: { type: Boolean, default: true },
    notifGameChat: { type: Boolean, default: true },
    notifSound: { type: Boolean, default: true },

    lastLoginAt: { type: Date, default: null },
    /** Set when the owner deletes the account; the row is anonymised, not removed. */
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index(
  { username: 1 },
  { unique: true, collation: USERNAME_COLLATION, name: 'username_ci_unique' },
);
// Partial, not sparse: every unlinked account stores an explicit null, and a
// sparse index only skips *missing* fields, so it would reject the second
// unlinked account outright.
userSchema.index(
  { linkedPlayerId: 1 },
  { unique: true, partialFilterExpression: { linkedPlayerId: { $type: 'objectId' } } },
);
userSchema.index({ onlineRating: -1 });
userSchema.index({ isBanned: 1, isVerified: 1 });
userSchema.index({ createdAt: -1 });
// Abandoned sign-ups expire on their own, so nobody can squat a username or
// someone else's email address by registering and never verifying.
userSchema.index(
  { createdAt: 1 },
  {
    name: 'unverified_ttl',
    expireAfterSeconds: UNVERIFIED_TTL_SECONDS,
    partialFilterExpression: { isVerified: false },
  },
);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;

export const User = model('User', userSchema);

/** Fewer than this many games means a provisional rating (higher K-factor). */
export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < env.PROVISIONAL_GAMES;
}

/**
 * Names that would collide with routes or read as official. Checked
 * case-insensitively at registration.
 */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'auth',
  'api',
  'me',
  'moderator',
  'root',
  'support',
  'system',
  'chesshub',
]);
