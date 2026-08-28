import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** A cryptographically random six-digit code. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Codes are stored hashed, so a database leak cannot be replayed. */
export function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, env.BCRYPT_ROUNDS);
}

export function verifyOtp(code: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(code, hash);
}

export function otpExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + OTP_TTL_MS);
}

export function isExpired(expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !expiresAt || now.getTime() > expiresAt.getTime();
}

export function canResend(lastSentAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= OTP_RESEND_COOLDOWN_MS;
}
