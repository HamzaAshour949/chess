import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** A private one-to-one message between two users, outside any game. */
const directMessageSchema = new Schema(
  {
    senderId: { type: Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedByAdminId: { type: Types.ObjectId, ref: 'Admin', default: null },
    /**
     * Sorted [smaller, larger] participant ids.
     *
     * Lets one indexed equality match fetch a conversation and one aggregation
     * group threads, instead of the Flask version's approach of pulling the
     * last 500 messages into memory and bucketing them there — which silently
     * lost older threads and under-counted unread messages for busy accounts.
     */
    pairKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'direct_messages' },
);

directMessageSchema.index({ pairKey: 1, createdAt: -1 });
directMessageSchema.index({ recipientId: 1, readAt: 1, isDeleted: 1 });
directMessageSchema.index({ createdAt: -1 });

export type DirectMessageAttrs = InferSchemaType<typeof directMessageSchema>;
export type DirectMessageDoc = HydratedDocument<DirectMessageAttrs>;

export const DirectMessage = model('DirectMessage', directMessageSchema);

/** Stable, order-independent key for the conversation between two users. */
export function conversationKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}
