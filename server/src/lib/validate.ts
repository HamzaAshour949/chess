import type { Request } from 'express';
import { z, type ZodType } from 'zod';
import { HttpError } from './http-error.js';

/** Parse and validate a request body, raising a 422 with field detail. */
export function parseBody<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/** Parse and validate the query string. */
export function parseQuery<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function validationError(error: z.ZodError): HttpError {
  const first = error.issues[0];
  // Lead with the first problem: the SPA shows `error` inline and most forms
  // only have room for one message.
  return new HttpError(422, first ? first.message : 'Validation failed', {
    details: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

/** A MongoDB ObjectId, as it arrives in a path parameter. */
export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** Shared pagination query shape. */
export function pagination(defaultPerPage = 20, maxPerPage = 100) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(maxPerPage).default(defaultPerPage),
  });
}

export const langQuery = z.object({
  lang: z.enum(['en', 'ar']).default('en'),
});
