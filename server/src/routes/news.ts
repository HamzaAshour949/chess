import { Router } from 'express';
import { z } from 'zod';
import { NEWS_REGIONS, News } from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { objectId, pagination, parseBody, parseQuery } from '../lib/validate.js';
import { normalizeLang, paginationMeta, serializeNews } from '../lib/serializers.js';
import { requireAdmin } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';

export const newsRouter: Router = Router();

const newsBody = z.object({
  title_en: z.string().max(500).nullish(),
  title_ar: z.string().max(500).nullish(),
  content_en: z.string().max(100_000).nullish(),
  content_ar: z.string().max(100_000).nullish(),
  region: z.enum(NEWS_REGIONS).optional(),
  image_url: z.string().max(500).nullish(),
  published: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  player_id: z.union([objectId, z.literal(''), z.null()]).optional(),
});

type NewsBody = z.infer<typeof newsBody>;

function toAttrs(body: Partial<NewsBody>) {
  const attrs: Record<string, unknown> = {};
  if (body.title_en !== undefined) attrs.titleEn = body.title_en || null;
  if (body.title_ar !== undefined) attrs.titleAr = body.title_ar || null;
  if (body.content_en !== undefined) attrs.contentEn = body.content_en || null;
  if (body.content_ar !== undefined) attrs.contentAr = body.content_ar || null;
  if (body.region !== undefined) attrs.region = body.region;
  if (body.image_url !== undefined) attrs.imageUrl = body.image_url || null;
  if (body.player_id !== undefined) attrs.playerId = body.player_id || null;
  return attrs;
}

/** Only one article may be featured at a time. */
async function makeExclusiveFeature(keepId: string) {
  await News.updateMany({ _id: { $ne: keepId }, isFeatured: true }, { $set: { isFeatured: false } });
}

// ------------------------------------------------------------------ public

const listQuery = pagination(10).extend({
  lang: z.enum(['en', 'ar']).default('en'),
  player_id: objectId.optional(),
});

newsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, per_page: perPage, lang, player_id: playerId } = parseQuery(listQuery, req);

    // An article is visible in a language edition if it targets that language
    // or both.
    const filter: Record<string, unknown> = {
      published: true,
      region: { $in: [lang, 'both'] },
    };
    if (playerId) filter.playerId = playerId;

    const [articles, total] = await Promise.all([
      News.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        // Populating here is what keeps the list to two queries instead of one
        // per article for the author's name.
        .populate('playerId', 'nameEn nameAr title'),
      News.countDocuments(filter),
    ]);

    res.json({
      news: articles.map((article) => serializeNews(article, lang)),
      ...paginationMeta({ page, perPage, total }),
    });
  }),
);

// Must be declared before "/:id" or "admin" would be parsed as an id.
newsRouter.get(
  '/admin',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { page, per_page: perPage } = parseQuery(pagination(10), req);

    const [articles, total] = await Promise.all([
      News.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('playerId', 'nameEn nameAr title'),
      News.countDocuments(),
    ]);

    res.json({
      news: articles.map((article) => serializeNews(article, 'en')),
      ...paginationMeta({ page, perPage, total }),
    });
  }),
);

newsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const lang = normalizeLang(req.query.lang);

    const article = await News.findById(id).populate('playerId', 'nameEn nameAr title');
    if (!article) throw HttpError.notFound('Article not found');

    // Drafts are visible to admins only; to everyone else they do not exist.
    if (!article.published && req.auth?.role !== 'admin') {
      throw HttpError.notFound('Article not found');
    }

    res.json(serializeNews(article, lang));
  }),
);

// ------------------------------------------------------------------- admin

newsRouter.post(
  '/',
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(newsBody, req);
    const published = body.published ?? false;

    const article = await News.create({
      ...toAttrs(body),
      published,
      isFeatured: body.is_featured ?? false,
      publishedAt: published ? new Date() : null,
    });

    if (article.isFeatured) await makeExclusiveFeature(String(article._id));
    await article.populate('playerId', 'nameEn nameAr title');

    res.status(201).json(serializeNews(article, 'en'));
  }),
);

newsRouter.put(
  '/:id',
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const body = parseBody(newsBody.partial(), req);

    const article = await News.findById(id);
    if (!article) throw HttpError.notFound('Article not found');

    article.set(toAttrs(body));

    if (body.published !== undefined) {
      // Stamp publishedAt the first time it goes live, and keep that original
      // date across later edits.
      if (body.published && !article.published) article.publishedAt = new Date();
      article.published = body.published;
    }
    if (body.is_featured !== undefined) article.isFeatured = body.is_featured;

    await article.save();
    if (article.isFeatured) await makeExclusiveFeature(id);
    await article.populate('playerId', 'nameEn nameAr title');

    res.json(serializeNews(article, 'en'));
  }),
);

newsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const deleted = await News.findByIdAndDelete(id);
    if (!deleted) throw HttpError.notFound('Article not found');

    res.json({ message: 'Article deleted' });
  }),
);
