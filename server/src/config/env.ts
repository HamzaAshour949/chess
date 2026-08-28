import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// The repo keeps one .env at its root; server/.env may override it locally.
const repoRoot = path.resolve(here, '..', '..', '..');
loadEnv({ path: path.join(repoRoot, '.env'), quiet: true });
loadEnv({ path: path.join(repoRoot, 'server', '.env'), override: true, quiet: true });

/** Comma-separated list -> trimmed, non-empty entries. */
const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const boolish = z
  .string()
  .default('0')
  .transform((value) => ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  APP_URL: z.string().url().default('http://localhost:8080'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  CORS_ORIGINS: csv,

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  TRUST_PROXY: boolish,

  UPLOAD_DIR: z.string().default('uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  DEFAULT_RATING: z.coerce.number().int().default(1200),
  PROVISIONAL_GAMES: z.coerce.number().int().default(10),

  BREVO_API_KEY: z.string().default(''),
  BREVO_FROM_EMAIL: z.string().default('no-reply@chesshub.local'),
  BREVO_FROM_NAME: z.string().default('Chess Hub'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail loudly at boot rather than surfacing as a confusing runtime error later.
  throw new Error(`Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = {
  ...parsed.data,
  repoRoot,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  /** Absolute path uploads are written to and served from. */
  uploadPath: path.isAbsolute(parsed.data.UPLOAD_DIR)
    ? parsed.data.UPLOAD_DIR
    : path.join(repoRoot, parsed.data.UPLOAD_DIR),
  /** Built SPA served in production. */
  frontendDist: path.join(repoRoot, 'frontend', 'dist'),
} as const;

export type Env = typeof env;
