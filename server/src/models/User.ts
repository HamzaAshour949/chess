import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { env } from '../config/env.js';

/**
 * A platform account that plays games.
 *
 * Never an admin: there is no role field here, and no route promotes a user.
 */
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 190 },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, default: null, maxlength: 120 },
    avatarUrl: { type: String, default: null, maxlength: 500 },
    country: { type: String, default: null, maxlength: 100 },

    // Email verification by one-time code. The code is stored as a bcrypt hash
    // so a database leak cannot be replayed to seize pending accounts.
    isVerified: { type: Boolean, default: false },
    otpCodeHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpLastSentAt: { type: Date, default: null, select: false },

    // Online Elo, deliberately separate from the editorial Player.rating.
    onlineRating: { type: Number, default: () => env.DEFAULT_RATING, min: 0, max: 4000 },
    gamesPlayed: { type: Number, default: 0, min: 0 },
    gamesWon: { type: Number, default: 0, min: 0 },
    gamesLost: { type: Number, default: 0, min: 0 },
    gamesDrawn: { type: Number, default: 0, min: 0 },

    // One-way, admin-granted association with an editorial profile. Being
    // linked confers identity only. Unique + sparse so a profile can never
    // back two accounts — enforced by the index, not by a check-then-write
    // that two concurrent approvals could both pass.
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
  },
  { timestamps: true, collection: 'users' },
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

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;

export const User = model('User', userSchema);

/** Fewer than this many games means a provisional rating (higher K-factor). */
export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < env.PROVISIONAL_GAMES;
}
