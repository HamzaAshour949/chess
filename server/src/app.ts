import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

const REQUEST_ID = /^[\w.-]{8,64}$/;

function urlOf(req: { url?: string; originalUrl?: string }): string {
  return req.originalUrl ?? req.url ?? '';
}

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
          mediaSrc: ["'self'", 'data:'],
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
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    }),
  );

  // Every request gets an id, echoed back and stamped on its log lines, so a
  // user's "it failed at 14:02" can be matched to exactly one log entry. An id
  // from a trusted proxy is kept so the trail spans both hops.
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const id =
      env.TRUST_PROXY && typeof incoming === 'string' && REQUEST_ID.test(incoming)
        ? incoming
        : randomUUID();
    (req as { id?: string }).id = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
        // One line per request: who, what, how it went. Full headers are noise
        // at best and personal data at worst.
        serializers: {
          req: (req: { id?: string; method?: string; url?: string; originalUrl?: string }) => ({
            id: req.id,
            method: req.method,
            url: req.originalUrl ?? req.url,
          }),
          res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        },
        // Express rewrites req.url inside mounted routers; originalUrl is the
        // path the client actually asked for.
        customSuccessMessage: (req, res, responseTime) =>
          `${req.method} ${urlOf(req)} ${res.statusCode} ${Math.round(responseTime)}ms`,
        customErrorMessage: (req, res) => `${req.method} ${urlOf(req)} ${res.statusCode}`,
        // Health checks would otherwise drown the log.
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        customLogLevel: (_req, res, err) =>
          err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      }),
    );
  }

  // JSON and the SPA's text assets shrink by 70-80%; images are already
  // compressed and are skipped by the default filter.
  app.use(compression());

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  app.use('/api', globalLimiter);
  app.use('/api', apiRouter);
  // Anything else under /api is a JSON 404, never the SPA's index.html.
  app.use('/api', notFoundHandler);

  // User uploads. `index: false` and no directory listing; the filenames are
  // random UUIDs assigned by the upload route, never client-supplied, so a
  // file's content never changes and it can be cached for good.
  fs.mkdirSync(env.uploadPath, { recursive: true });
  app.use(
    '/uploads',
    express.static(env.uploadPath, {
      index: false,
      dotfiles: 'deny',
      fallthrough: false,
      maxAge: '365d',
      immutable: true,
    }),
  );

  // The built SPA, with a history fallback so client-side routes deep-link.
  if (fs.existsSync(env.frontendDist)) {
    // Vite fingerprints everything under /assets, so a new build gets new
    // URLs and the old files can be cached forever.
    app.use(
      '/assets',
      express.static(path.join(env.frontendDist, 'assets'), {
        index: false,
        fallthrough: false,
        maxAge: '365d',
        immutable: true,
      }),
    );
    // Everything else — favicon, manifest — revalidates, and index.html is
    // never cached, so a deploy reaches every open tab on its next load.
    app.use(express.static(env.frontendDist, { index: false, maxAge: '1h' }));
    const indexHtml = path.join(env.frontendDist, 'index.html');
    app.get(/^(?!\/api\/|\/uploads\/|\/socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
