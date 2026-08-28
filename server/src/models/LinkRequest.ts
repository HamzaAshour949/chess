import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const LINK_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type LinkRequestStatus = (typeof LINK_REQUEST_STATUSES)[number];

/**
 * A user's request to be associated with an editorial player profile.
 *
 * Only an admin approving one of these ever sets User.linkedPlayerId; there is
 * no endpoint through which a user can set it directly.
 */
const linkRequestSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    playerId: { type: Types.ObjectId, ref: 'Player', required: true },
    message: { type: String, default: null, maxlength: 1000 },
    status: { type: String, enum: LINK_REQUEST_STATUSES, default: 'pending' },
    adminNote: { type: String, default: null, maxlength: 1000 },
    reviewedByAdminId: { type: Types.ObjectId, ref: 'Admin', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'link_requests' },
);

linkRequestSchema.index({ status: 1, createdAt: -1 });
linkRequestSchema.index({ userId: 1, createdAt: -1 });
linkRequestSchema.index({ playerId: 1 });
// At most one open request per user, enforced by the database rather than by a
// check-then-insert that two concurrent submissions could both slip through.
linkRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

export type LinkRequestAttrs = InferSchemaType<typeof linkRequestSchema>;
export type LinkRequestDoc = HydratedDocument<LinkRequestAttrs>;

export const LinkRequest = model('LinkRequest', linkRequestSchema);
