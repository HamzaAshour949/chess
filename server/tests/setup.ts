/**
 * Test environment, applied before any test file imports the app.
 *
 * Assigned unconditionally, not as defaults: Bun loads a `.env` from the
 * working directory on its own, and a suite that inherited the development
 * MONGODB_URI would wipe the development database on its first reset.
 */
Object.assign(process.env, {
  NODE_ENV: 'test',
  // A dedicated database, so running the suite never touches dev data.
  MONGODB_URI:
    process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/chess_hub_test?replicaSet=rs0',
  JWT_SECRET: 'test-secret-that-is-long-enough-to-pass-validation',
  // Keep hashing cheap: the suite creates a lot of accounts.
  BCRYPT_ROUNDS: '10',
  BREVO_API_KEY: '',
  // Keep test uploads out of the real uploads directory.
  UPLOAD_DIR: '.test-uploads',
  LOG_LEVEL: 'silent',
  FIRST_MOVE_TIMEOUT_SECONDS: '45',
  CHALLENGE_TTL_MINUTES: '30',
});
