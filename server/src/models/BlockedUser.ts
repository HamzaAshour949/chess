import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** A user-to-user block. Prevents DMs and challenge accepts in both directions. */
const blockedUserSchema = new Schema(
  {
    blockerId: { type: Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'blocked_users' },
);

blockedUserSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockedUserSchema.index({ blockedId: 1 });

export type BlockedUserAttrs = InferSchemaType<typeof blockedUserSchema>;
export type BlockedUserDoc = HydratedDocument<BlockedUserAttrs>;

export const BlockedUser = model('BlockedUser', blockedUserSchema);
