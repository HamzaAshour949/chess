import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Only trust proxy headers when explicitly configured. Trusting them blindly
  // lets any client spoof X-Forwarded-For and walk straight past rate limits.
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // The SPA is bundled; inline styles come from Tailwind's runtime and
          // the chessboard's positioning.
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", ...(env.isProduction ? [] : ['ws:', 'wss:', 'http://localhost:*'])],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          // Helmet enables this by default; over plain-http localhost it only
          // gets in the way, so it is production-only.
          upgradeInsecureRequests: env.isProduction ? [] : null,
        },
      },
      // Uploaded images are served to the SPA from this origin.
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  // Same-origin by default: the SPA is served by this process in production, so
  // no CORS entry is needed at all. Configured origins are for a separate dev
  // server or a split deployment. A wildcard is never accepted.
  app.use(
    '/api',
    cors({
      origin: env.CORS_ORIGINS.length === 0 ? false : env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        // Health checks and polling would otherwise drown the log.
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        customLogLevel: (_req, res, err) =>
          err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      }),
    );
  }

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  app.use('/api', globalLimiter);
  app.use('/api', apiRouter);

  // User uploads. `index: false` and no directory listing; the filenames are
  // random UUIDs assigned by the upload route, never client-supplied.
  fs.mkdirSync(env.uploadPath, { recursive: true });
  app.use(
    '/uploads',
    express.static(env.uploadPath, {
      index: false,
      dotfiles: 'deny',
      maxAge: '30d',
      immutable: true,
    }),
  );

  // The built SPA, with a history fallback so client-side routes deep-link.
  if (fs.existsSync(env.frontendDist)) {
    app.use(express.static(env.frontendDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/|\/uploads\/).*/, (_req, res) => {
      res.sendFile(path.join(env.frontendDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
