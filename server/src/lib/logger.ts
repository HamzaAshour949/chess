import { pino } from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  // Pretty output in development; structured JSON everywhere else so logs stay
  // machine-readable in production.
  ...(env.isProduction || env.isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          // The message already says "GET /api/... 200 12ms"; the request and
          // response objects stay in the structured (production) output only.
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,req,res,responseTime',
          },
        },
      }),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'otpCodeHash',
      '*.otpCodeHash',
    ],
    remove: true,
  },
});
