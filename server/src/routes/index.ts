import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { isDatabaseConnected } from '../db/mongoose.js';
import { authRouter } from './auth.js';
import { userAuthRouter } from './user-auth.js';
import { usersRouter } from './users.js';
import { playersRouter } from './players.js';
import { newsRouter } from './news.js';
import { siteStringsRouter } from './site-strings.js';
import { uploadRouter } from './upload.js';
import { gamesRouter } from './games.js';
import { messagesRouter } from './messages.js';
import { linksRouter } from './links.js';
import { adminGamesRouter, adminMessagesRouter } from './admin-moderation.js';

export const apiRouter: Router = Router();

/**
 * Liveness and readiness in one: 200 while the database is reachable, 503
 * when it is not, so a load balancer or orchestrator takes the instance out
 * of rotation instead of sending it traffic it can only fail.
 */
apiRouter.get('/health', (_req, res) => {
  const database = isDatabaseConnected();
  res.status(database ? 200 : 503).json({
    status: database ? 'ok' : 'degraded',
    database: database ? 'up' : 'down',
    uptime: Math.round(process.uptime()),
    runtime: `bun ${Bun.version}`,
  });
});

// Decode the bearer token once for every other API route; individual routes
// decide whether they require an actor and of which kind.
apiRouter.use(authenticate);

apiRouter.use('/auth', authRouter);
// The account router mounts first so /users/auth/* never reads as a username.
apiRouter.use('/users/auth', userAuthRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/players', playersRouter);
apiRouter.use('/news', newsRouter);
apiRouter.use('/strings', siteStringsRouter);
apiRouter.use('/upload', uploadRouter);

// The admin routers mount first so their literal paths are matched before the
// "/:id" patterns in the routers below them.
apiRouter.use('/games/admin', adminGamesRouter);
apiRouter.use('/messages/admin', adminMessagesRouter);
apiRouter.use('/games', gamesRouter);
apiRouter.use('/messages', messagesRouter);
apiRouter.use('/links', linksRouter);
