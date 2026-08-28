import type { NextFunction, Request, Response } from 'express';
import { Admin, User } from '../models/index.js';
import { bearerFrom, verifyToken } from '../lib/jwt.js';
import { HttpError } from '../lib/http-error.js';
import { asyncHandler } from '../lib/async-handler.js';

/** Decode the bearer token, if any. Never rejects — guards do that. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerFrom(req.headers.authorization);
  if (token) {
    const payload = verifyToken(token);
    if (payload) req.auth = { id: payload.sub, role: payload.role };
  }
  next();
}

/**
 * Require a verified, unbanned player.
 *
 * The account is re-read on every request rather than trusted from the token,
 * so a ban, a mute or a deletion takes effect immediately instead of when the
 * token happens to expire.
 */
export const requireUser = asyncHandler(async (req, _res, next) => {
  if (!req.auth) throw HttpError.unauthorized('Sign in to continue');
  if (req.auth.role !== 'user') throw HttpError.forbidden('This endpoint is for player accounts');

  const user = await User.findById(req.auth.id);
  if (!user) throw HttpError.unauthorized('Account no longer exists');

  if (user.isBanned) {
    throw HttpError.forbidden('Account suspended', {
      code: 'account_banned',
      details: { ban_reason: user.banReason },
    });
  }
  if (!user.isVerified) {
    throw HttpError.forbidden('Email not verified', { code: 'email_unverified' });
  }

  req.currentUser = user;
  next();
});

/**
 * Require an admin.
 *
 * Also re-reads the record: the Flask version only checked that the token's
 * role claim was not "user", so a deleted admin kept full access until the
 * token expired.
 */
export const requireAdmin = asyncHandler(async (req, _res, next) => {
  if (!req.auth) throw HttpError.unauthorized('Sign in to continue');
  if (req.auth.role !== 'admin') throw HttpError.forbidden('Admin access required');

  const admin = await Admin.findById(req.auth.id);
  if (!admin) throw HttpError.unauthorized('Account no longer exists');

  req.currentAdmin = admin;
  next();
});

/**
 * Load the player if one is signed in, but allow anonymous access.
 *
 * Used by endpoints that serve spectators and participants from the same
 * route, such as reading a game or its chat.
 */
export const optionalUser = asyncHandler(async (req, _res, next) => {
  if (req.auth?.role === 'user') {
    const user = await User.findById(req.auth.id);
    if (user && !user.isBanned && user.isVerified) req.currentUser = user;
  }
  next();
});

/** The signed-in player, for routes already behind `requireUser`. */
export function currentUser(req: Request) {
  const user = req.currentUser;
  if (!user) throw HttpError.unauthorized('Sign in to continue');
  return user;
}

/** The signed-in admin, for routes already behind `requireAdmin`. */
export function currentAdmin(req: Request) {
  const admin = req.currentAdmin;
  if (!admin) throw HttpError.unauthorized('Sign in to continue');
  return admin;
}
