import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { HttpError } from './http-error.js';

/** Formats we are willing to decode and re-encode. */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif']);

/**
 * One file, buffered in memory, never written under a client-supplied name.
 * The MIME type is only a first filter — the bytes are verified by decoding.
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new HttpError(400, 'Only image uploads are allowed'));
      return;
    }
    callback(null, true);
  },
}).single('file');

export interface StoredImage {
  url: string;
  width: number;
  height: number;
  bytes: number;
}

interface ProcessOptions {
  /** Longest edge after downscaling. */
  maxDimension: number;
  /** Crop to a centred square of `maxDimension` (avatars). */
  square?: boolean;
  /** Keep animation for animated GIFs. */
  allowAnimation?: boolean;
  /** Sub-directory under the uploads root. */
  folder?: string;
}

/**
 * Decode, verify, re-encode and store an uploaded image.
 *
 * Re-encoding drops EXIF (which can carry GPS coordinates) and any appended
 * payload that made the file a polyglot, so what lands in the uploads
 * directory is always a real image. The Flask version trusted the filename
 * extension, so any file renamed to .png was accepted and stored.
 */
export async function storeImage(buffer: Buffer, options: ProcessOptions): Promise<StoredImage> {
  const metadata = await sharp(buffer, { failOn: 'error' })
    .metadata()
    .catch(() => {
      throw HttpError.badRequest('That file is not a readable image');
    });

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw HttpError.badRequest(
      `Unsupported image format${metadata.format ? `: ${metadata.format}` : ''}`,
    );
  }

  const animated =
    Boolean(options.allowAnimation) && metadata.format === 'gif' && (metadata.pages ?? 1) > 1;
  let image = sharp(buffer, { failOn: 'error', animated }).rotate();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const max = options.maxDimension;

  if (options.square) {
    image = image.resize({ width: max, height: max, fit: 'cover', position: 'attention' });
  } else if (width > max || height > max) {
    image = image.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
  }

  const extension = animated ? 'gif' : 'webp';
  let output: Buffer;
  try {
    output = animated ? await image.gif().toBuffer() : await image.webp({ quality: 85 }).toBuffer();
  } catch {
    throw HttpError.badRequest('That file is not a readable image');
  }

  const folder = options.folder ?? '';
  const directory = path.join(env.uploadPath, folder);
  const filename = `${randomUUID()}.${extension}`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), output);

  const scale = options.square ? 1 : Math.min(1, max / Math.max(width, height, 1));
  return {
    url: `/uploads/${folder ? `${folder}/` : ''}${filename}`,
    width: options.square ? max : Math.round(width * scale),
    height: options.square ? max : Math.round(height * scale),
    bytes: output.byteLength,
  };
}

/**
 * Delete a previously stored upload, if the URL points into our own uploads
 * directory. Anything else — an external URL, a path that tries to climb out
 * of the directory — is ignored.
 */
export async function removeStoredImage(url: string | null | undefined): Promise<void> {
  if (!url?.startsWith('/uploads/')) return;
  const relative = url.slice('/uploads/'.length);
  const target = path.resolve(env.uploadPath, relative);
  if (!target.startsWith(path.resolve(env.uploadPath) + path.sep)) return;
  await unlink(target).catch(() => undefined);
}
