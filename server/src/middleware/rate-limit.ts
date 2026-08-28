import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Build a rate limiter.
 *
 * Limiting is disabled under NODE_ENV=test so the suite can hammer endpoints,
 * and the store is per-process memory — fine for one node, but swap in a Redis
 * store before running more than one instance or the effective limit multiplies
 * by the instance count.
 */
export function limiter(options: Partial<Options> & { windowMs: number; limit: number }) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { error: 'Too many requests, please slow down.' },
    ...options,
  });
}

const minute = 60_000;
const hour = 60 * minute;

export const globalLimiter = limiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/** Credential endpoints: tight, to blunt online password guessing. */
export const loginLimiter = limiter({ windowMs: 15 * minute, limit: 10 });
export const registerLimiter = limiter({ windowMs: hour, limit: 10 });
export const otpVerifyLimiter = limiter({ windowMs: 15 * minute, limit: 15 });
export const otpResendLimiter = limiter({ windowMs: hour, limit: 6 });

/** Content endpoints. */
export const uploadLimiter = limiter({ windowMs: minute, limit: 30 });
export const writeLimiter = limiter({ windowMs: minute, limit: 60 });
export const chatLimiter = limiter({ windowMs: minute, limit: 20 });
export const dmLimiter = limiter({ windowMs: minute, limit: 30 });
export const linkRequestLimiter = limiter({ windowMs: hour, limit: 5 });

/**
 * Moves are generous on purpose: a bullet game legitimately produces a burst,
 * and the real protection is that an illegal or out-of-turn move is rejected
 * by the engine anyway.
 */
export const moveLimiter = limiter({ windowMs: minute, limit: 180 });
