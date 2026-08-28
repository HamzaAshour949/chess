import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A back-office account.
 *
 * Deliberately a separate collection from `users`: an admin is not a player
 * with a flag set, so no bug in role handling can turn one into the other.
 */
const adminSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 190 },
    // `select: false` keeps the hash out of every query that does not ask for it.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true, collection: 'admins' },
);

export type AdminAttrs = InferSchemaType<typeof adminSchema>;
export type AdminDoc = HydratedDocument<AdminAttrs>;

export const Admin = model('Admin', adminSchema);
