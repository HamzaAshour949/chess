import { Router } from 'express';
import { z } from 'zod';
import { SiteString } from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { parseBody, parseQuery } from '../lib/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';

export const siteStringsRouter: Router = Router();

/** Keys are used as i18n paths, so keep them to a safe, predictable shape. */
const keyField = z
  .string()
  .trim()
  .min(1, 'Key is required')
  .max(191)
  .regex(/^[A-Za-z0-9_.-]+$/, 'Key may contain letters, digits, dot, dash and underscore only');

// ------------------------------------------------------------------ public

/** Overrides for the SPA, grouped as { en: {key: value}, ar: {...} }. */
siteStringsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { lang } = parseQuery(z.object({ lang: z.enum(['en', 'ar']).optional() }), req);

    const rows = await SiteString.find(lang ? { lang } : {})
      .select('key lang value')
      .lean();

    const grouped: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      (grouped[row.lang] ??= {})[row.key] = row.value;
    }

    res.json(grouped);
  }),
);

// ------------------------------------------------------------------- admin

siteStringsRouter.get(
  '/all',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await SiteString.find().sort({ key: 1, lang: 1 }).lean();
    res.json(
      rows.map((row) => ({ id: String(row._id), key: row.key, lang: row.lang, value: row.value })),
    );
  }),
);

const bulkSchema = z.object({
  strings: z
    .array(
      z.object({
        key: keyField,
        lang: z.enum(['en', 'ar']),
        value: z.string().max(10_000).default(''),
      }),
    )
    .max(2000),
});

siteStringsRouter.put(
  '/bulk',
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { strings } = parseBody(bulkSchema, req);

    if (strings.length > 0) {
      // One round trip for the whole editor save, instead of a query per row.
      await SiteString.bulkWrite(
        strings.map((entry) => ({
          updateOne: {
            filter: { key: entry.key, lang: entry.lang },
            update: { $set: { value: entry.value } },
            upsert: true,
          },
        })),
      );
    }

    res.json({ message: 'Strings updated', count: strings.length });
  }),
);

const createSchema = z.object({
  key: keyField,
  value_en: z.string().max(10_000).default(''),
  value_ar: z.string().max(10_000).default(''),
});

siteStringsRouter.post(
  '/',
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { key, value_en: valueEn, value_ar: valueAr } = parseBody(createSchema, req);

    await SiteString.bulkWrite([
      { updateOne: { filter: { key, lang: 'en' }, update: { $set: { value: valueEn } }, upsert: true } },
      { updateOne: { filter: { key, lang: 'ar' }, update: { $set: { value: valueAr } }, upsert: true } },
    ]);

    res.status(201).json({ message: 'String created', key });
  }),
);

siteStringsRouter.delete(
  '/:key',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const key = keyField.parse(req.params.key);
    const result = await SiteString.deleteMany({ key });
    res.json({ message: 'String deleted', deleted: result.deletedCount });
  }),
);
