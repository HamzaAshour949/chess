import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Chat inside a single game. Participants write; spectators read. */
const gameMessageSchema = new Schema(
  {
    gameId: { type: Types.ObjectId, ref: 'Game', required: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 500 },
    isDeleted: { type: Boolean, default: false },
    deletedByAdminId: { type: Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'game_messages' },
);

gameMessageSchema.index({ gameId: 1, createdAt: 1 });
gameMessageSchema.index({ createdAt: -1 });
gameMessageSchema.index({ userId: 1 });

export type GameMessageAttrs = InferSchemaType<typeof gameMessageSchema>;
export type GameMessageDoc = HydratedDocument<GameMessageAttrs>;

export const GameMessage = model('GameMessage', gameMessageSchema);
