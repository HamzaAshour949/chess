import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Password hashing on Bun's native bcrypt.
 *
 * `Bun.password` hashes on a worker thread, so a sign-in no longer stalls the
 * event loop — and every live game on it — for the quarter-second a cost-12
 * bcrypt takes. The hashes are standard `$2b$` bcrypt, so accounts created
 * before the move to Bun keep working.
 */

/** bcrypt only ever reads the first 72 bytes of its input. */
const BCRYPT_MAX_BYTES = 72;
const encoder = new TextEncoder();

export function hashPassword(password: string, cost: number = env.BCRYPT_ROUNDS): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'bcrypt', cost });
}

export interface PasswordCheck {
  valid: boolean;
  /** The hash is weaker than current policy and should be replaced. */
  needsRehash: boolean;
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<PasswordCheck> {
  if (!hash) return { valid: false, needsRehash: false };

  if (await safeVerify(password, hash)) {
    return { valid: true, needsRehash: bcryptCost(hash) !== env.BCRYPT_ROUNDS };
  }

  // Hashes written by bcryptjs before the move to Bun silently truncated the
  // password at 72 bytes, whereas Bun pre-hashes a longer one. Retrying with
  // the truncated bytes reproduces exactly what bcryptjs checked, so those
  // accounts can still sign in; the caller then rehashes them.
  const bytes = encoder.encode(password);
  if (bytes.length > BCRYPT_MAX_BYTES && isBcrypt(hash)) {
    if (await safeVerify(bytes.subarray(0, BCRYPT_MAX_BYTES), hash)) {
      return { valid: true, needsRehash: true };
    }
  }

  return { valid: false, needsRehash: false };
}

async function safeVerify(password: string | Uint8Array, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    // A malformed stored hash is a failed check, not a server error.
    return false;
  }
}

function isBcrypt(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

function bcryptCost(hash: string): number | null {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  return match ? Number(match[1]) : null;
}

let dummyHash: Promise<string> | null = null;

/**
 * Make the hash `verifyAgainstNothing()` checks against. The server calls
 * this before it accepts connections: made lazily, the first sign-in for a
 * missing account would also pay for creating it, take twice as long as a
 * wrong password, and so reveal that the account does not exist.
 */
export function prepareDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomUUID());
  return dummyHash;
}

/**
 * Burn the same time as a real check when the account does not exist.
 *
 * Without it a missing account answers noticeably faster than a wrong
 * password and the login form becomes a username oracle. The hash is made at
 * the configured cost, so the timing matches whatever BCRYPT_ROUNDS is.
 */
export async function verifyAgainstNothing(password: string): Promise<false> {
  await safeVerify(password, await prepareDummyHash());
  return false;
}
