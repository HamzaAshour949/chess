import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { requireAdmin } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rate-limit.js';

export const uploadRouter: Router = Router();

/** Formats we are willing to decode and re-encode. */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif']);
const MAX_DIMENSION = 2400;

/**
 * Files are buffered in memory and never written under a client-supplied name.
 * The upload is decoded and re-encoded before it touches disk, so what lands in
 * the uploads directory is always a real image.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new HttpError(400, 'Only image uploads are allowed'));
      return;
    }
    callback(null, true);
  },
});

uploadRouter.post(
  '/image',
  requireAdmin,
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw HttpError.badRequest('No file provided');

    // Verify the bytes really are an image. The Flask version trusted the
    // filename extension, so any file renamed to .png was accepted and stored.
    let image = sharp(req.file.buffer, { failOn: 'error' });
    let metadata;
    try {
      metadata = await image.metadata();
    } catch {
      throw HttpError.badRequest('That file is not a readable image');
    }

    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      throw HttpError.badRequest(`Unsupported image format${metadata.format ? `: ${metadata.format}` : ''}`);
    }

    // Re-encoding drops EXIF (which can carry GPS coordinates) and any
    // appended payload that made the file a polyglot.
    const animated = metadata.format === 'gif' && (metadata.pages ?? 1) > 1;
    if (animated) {
      image = sharp(req.file.buffer, { animated: true });
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      image = image.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const extension = animated ? 'gif' : 'webp';
    const output = animated
      ? await image.gif().toBuffer()
      : await image.webp({ quality: 85 }).toBuffer();

    const filename = `${randomUUID()}.${extension}`;
    await mkdir(env.uploadPath, { recursive: true });
    await writeFile(path.join(env.uploadPath, filename), output);

    res.status(201).json({
      url: `/uploads/${filename}`,
      width: Math.min(width, MAX_DIMENSION),
      height: Math.min(height, MAX_DIMENSION),
      bytes: output.byteLength,
    });
  }),
);
