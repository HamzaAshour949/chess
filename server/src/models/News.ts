import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const NEWS_REGIONS = ['en', 'ar', 'both'] as const;
export type NewsRegion = (typeof NEWS_REGIONS)[number];

const newsSchema = new Schema(
  {
    titleEn: { type: String, default: null, maxlength: 500 },
    titleAr: { type: String, default: null, maxlength: 500 },
    contentEn: { type: String, default: null },
    contentAr: { type: String, default: null },
    /** Which language edition the article appears in. */
    region: { type: String, enum: NEWS_REGIONS, default: 'both' },
    imageUrl: { type: String, default: null, maxlength: 500 },
    published: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    playerId: { type: Types.ObjectId, ref: 'Player', default: null },
  },
  { timestamps: true, collection: 'news' },
);

// Public listing: published + region, newest first.
newsSchema.index({ published: 1, region: 1, publishedAt: -1 });
newsSchema.index({ isFeatured: 1 });
newsSchema.index({ playerId: 1, publishedAt: -1 });
newsSchema.index({ createdAt: -1 });

export type NewsAttrs = InferSchemaType<typeof newsSchema>;
export type NewsDoc = HydratedDocument<NewsAttrs>;

export const News = model('News', newsSchema);
