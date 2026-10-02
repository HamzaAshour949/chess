import type { Request } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
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

/**
 * Key signed-in traffic by account rather than address.
 *
 * A school, a club or a café puts many players behind one IP; keyed by IP they
 * would share one move budget and a busy room would lock itself out of its
 * own games. Anonymous traffic still falls back to the (IPv6-safe) address.
 */
function accountKey(req: Request): string {
  return req.auth ? `${req.auth.role}:${req.auth.id}` : ipKeyGenerator(req.ip ?? '');
}

/** A limiter for authenticated actions, counted per account. */
function perAccount(options: { windowMs: number; limit: number }) {
  return limiter({ ...options, keyGenerator: accountKey });
}

const minute = 60_000;
const hour = 60 * minute;

export const globalLimiter = limiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  // Orchestrator health probes must never be throttled into "unhealthy".
  skip: (req) => env.isTest || req.path === '/health',
});

/** Credential endpoints: tight and per address, to blunt online guessing. */
export const loginLimiter = limiter({ windowMs: 15 * minute, limit: 10 });
export const registerLimiter = limiter({ windowMs: hour, limit: 10 });
export const otpVerifyLimiter = limiter({ windowMs: 15 * minute, limit: 15 });
export const otpResendLimiter = limiter({ windowMs: hour, limit: 6 });
export const passwordResetLimiter = limiter({ windowMs: hour, limit: 6 });
/** Changing a password or deleting an account requires the current one. */
export const sensitiveLimiter = perAccount({ windowMs: 15 * minute, limit: 10 });

/** Content endpoints. */
export const uploadLimiter = perAccount({ windowMs: minute, limit: 30 });
export const avatarLimiter = perAccount({ windowMs: hour, limit: 20 });
export const writeLimiter = perAccount({ windowMs: minute, limit: 60 });
export const chatLimiter = perAccount({ windowMs: minute, limit: 20 });
export const dmLimiter = perAccount({ windowMs: minute, limit: 30 });
export const linkRequestLimiter = perAccount({ windowMs: hour, limit: 5 });
/** Offers, rematches and invitations: each one pings another player. */
export const offerLimiter = perAccount({ windowMs: minute, limit: 12 });
/** Public search boxes. */
export const searchLimiter = limiter({ windowMs: minute, limit: 60 });

/**
 * Moves are generous on purpose: a bullet game legitimately produces a burst,
 * and the real protection is that an illegal or out-of-turn move is rejected
 * by the engine anyway.
 */
export const moveLimiter = perAccount({ windowMs: minute, limit: 180 });
