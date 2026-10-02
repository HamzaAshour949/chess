import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { imageUpload, storeImage } from '../lib/images.js';
import { requireAdmin } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rate-limit.js';

export const uploadRouter: Router = Router();

/** Editorial images: player portraits and news photos. */
uploadRouter.post(
  '/image',
  requireAdmin,
  uploadLimiter,
  imageUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) throw HttpError.badRequest('No file provided');

    const stored = await storeImage(req.file.buffer, { maxDimension: 2400, allowAnimation: true });
    res.status(201).json(stored);
  }),
);
