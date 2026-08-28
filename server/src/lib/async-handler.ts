import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap an async route so a rejected promise reaches the error middleware.
 *
 * Express 5 forwards rejections from async handlers on its own, but wrapping
 * keeps the behaviour explicit and typed at every call site.
 */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
>(
  fn: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
