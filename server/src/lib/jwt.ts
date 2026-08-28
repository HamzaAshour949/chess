import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type Role = 'admin' | 'user';

export interface TokenPayload {
  /** Subject: the actor's id. */
  sub: string;
  role: Role;
}

const ISSUER = 'chess-hub';

/**
 * Issue an access token.
 *
 * The role is baked into the token rather than inferred from which collection
 * the id happens to match. That is what stops an admin token from being spent
 * as a player token and vice versa — the Flask version relied on admin tokens
 * simply *lacking* a role claim, so anything that failed to set the claim
 * silently authenticated as an admin.
 */
export function signToken(id: string, role: Role): string {
  return jwt.sign({ role }, env.JWT_SECRET, {
    subject: id,
    issuer: ISSUER,
    audience: role,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Verify a token. Returns null for anything malformed, expired or foreign. */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: ISSUER,
      // Both roles are acceptable audiences; the caller checks which one.
      audience: ['admin', 'user'],
    });

    if (typeof decoded === 'string') return null;
    const { sub, role } = decoded;
    if (typeof sub !== 'string' || (role !== 'admin' && role !== 'user')) return null;
    // The audience must match the claimed role, so a token minted for one
    // side can never be replayed as the other.
    if (decoded.aud !== role) return null;

    return { sub, role };
  } catch {
    return null;
  }
}

/** Pull a bearer token out of the Authorization header. */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}
