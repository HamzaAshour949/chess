import path from 'node:path';
import { z } from 'zod';

/**
 * Validated configuration.
 *
 * Bun loads `.env` files itself — the package scripts pass the repo root's
 * `.env` with `--env-file`, and a missing file is simply skipped — so this
 * module only validates what is already in `process.env`. A variable set in
 * the real environment always wins over the file, which is what a container
 * or CI runner expects.
 */
const repoRoot = path.resolve(import.meta.dir, '..', '..', '..');

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

/** Secrets that appear in this repository and must never reach production. */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'change-me-to-a-long-random-secret',
  'test-secret-that-is-long-enough-to-pass-validation',
]);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    APP_URL: z.url().default('http://localhost:8080'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    /** Sync indexes on boot. Turn off when a release step runs `db:indexes`. */
    DB_SYNC_INDEXES: z
      .string()
      .default('1')
      .transform((value) => ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())),

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
    /** Time each side has to make its first move before the game is aborted. */
    FIRST_MOVE_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(3600).default(45),
    /** Open challenges nobody accepted are withdrawn after this long. */
    CHALLENGE_TTL_MINUTES: z.coerce.number().int().min(1).max(7 * 24 * 60).default(30),

    BREVO_API_KEY: z.string().default(''),
    BREVO_FROM_EMAIL: z.string().default('no-reply@chesshub.local'),
    BREVO_FROM_NAME: z.string().default('Chess Hub'),
    /** Log emails instead of sending them. Always on outside production. */
    EMAIL_CONSOLE: boolish,

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (KNOWN_PLACEHOLDER_SECRETS.has(value.JWT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'is a placeholder from the repository; generate a real secret',
      });
    }
    // Without a mail provider nobody can verify an address or reset a
    // password, so production refuses to start rather than half-work.
    if (!value.BREVO_API_KEY && !value.EMAIL_CONSOLE) {
      ctx.addIssue({
        code: 'custom',
        path: ['BREVO_API_KEY'],
        message: 'is required in production (or set EMAIL_CONSOLE=1 to log emails deliberately)',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail loudly at boot rather than surfacing as a confusing runtime error later.
  throw new Error(
    `Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill it in.`,
  );
}

const data = parsed.data;

export const env = {
  ...data,
  repoRoot,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  /** Emails are logged, not sent: no key configured, or asked for explicitly. */
  emailToConsole: data.EMAIL_CONSOLE || !data.BREVO_API_KEY,
  /** Absolute path uploads are written to and served from. */
  uploadPath: path.isAbsolute(data.UPLOAD_DIR) ? data.UPLOAD_DIR : path.join(repoRoot, data.UPLOAD_DIR),
  /** Built SPA served in production. */
  frontendDist: path.join(repoRoot, 'frontend', 'dist'),
  firstMoveTimeoutMs: data.FIRST_MOVE_TIMEOUT_SECONDS * 1000,
  challengeTtlMs: data.CHALLENGE_TTL_MINUTES * 60 * 1000,
} as const;

export type Env = typeof env;
