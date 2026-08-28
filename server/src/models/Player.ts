import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * An editorial player profile (FIDE-style data), curated by admins.
 *
 * Read-only from a user's perspective. A user may be *linked* to one of these
 * for identity, but no route anywhere lets a user write to this collection.
 */
const playerSchema = new Schema(
  {
    nameEn: { type: String, required: true, trim: true, maxlength: 200 },
    nameAr: { type: String, required: true, trim: true, maxlength: 200 },
    bioEn: { type: String, default: null },
    bioAr: { type: String, default: null },
    country: { type: String, default: null, maxlength: 100 },
    rating: { type: Number, default: null, min: 0, max: 4000 },
    title: { type: String, default: null, maxlength: 20 },
    imageUrl: { type: String, default: null, maxlength: 500 },
    dateOfBirth: { type: Date, default: null },
    isPlayerOfMonth: { type: Boolean, default: false },
    isTournamentWinner: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'players' },
);

// The public list sorts by rating; the homepage looks up both spotlight flags.
playerSchema.index({ rating: -1 });
playerSchema.index({ isPlayerOfMonth: 1 });
playerSchema.index({ isTournamentWinner: 1 });
// Backs the ?search= filter on names in both languages.
playerSchema.index({ nameEn: 'text', nameAr: 'text' });

export type PlayerAttrs = InferSchemaType<typeof playerSchema>;
export type PlayerDoc = HydratedDocument<PlayerAttrs>;

export const Player = model('Player', playerSchema);
