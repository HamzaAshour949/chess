import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Feature tests share one MongoDB database, so files must not run in
    // parallel; each file clears the collections before it runs.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      // A dedicated database, so running the suite never touches dev data.
      MONGODB_URI: 'mongodb://127.0.0.1:27017/chess_hub_test?replicaSet=rs0',
      JWT_SECRET: 'test-secret-that-is-long-enough-to-pass-validation',
      // Keep hashing cheap: the suite creates a lot of accounts.
      BCRYPT_ROUNDS: '10',
      BREVO_API_KEY: '',
      LOG_LEVEL: 'silent',
    },
  },
});
