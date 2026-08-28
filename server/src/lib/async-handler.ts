import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap an async route so a rejected promise reaches the error middleware.
 *
 * Express 5 forwards rejections from async handlers on its own, but wrapping
 * keeps the behaviour explicit at every call site and survives a downgrade.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
