import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Admin-editable overrides layered on top of the SPA's static i18n bundles. */
const siteStringSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 191 },
    lang: { type: String, required: true, default: 'en', maxlength: 10 },
    value: { type: String, default: '' },
  },
  { timestamps: true, collection: 'site_strings' },
);

siteStringSchema.index({ key: 1, lang: 1 }, { unique: true });
siteStringSchema.index({ lang: 1 });

export type SiteStringAttrs = InferSchemaType<typeof siteStringSchema>;
export type SiteStringDoc = HydratedDocument<SiteStringAttrs>;

export const SiteString = model('SiteString', siteStringSchema);
