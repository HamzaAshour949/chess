import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authRouter } from './auth.js';
import { userAuthRouter } from './user-auth.js';
import { playersRouter } from './players.js';
import { newsRouter } from './news.js';
import { siteStringsRouter } from './site-strings.js';
import { uploadRouter } from './upload.js';
import { gamesRouter } from './games.js';
import { messagesRouter } from './messages.js';
import { linksRouter } from './links.js';
import { adminGamesRouter, adminMessagesRouter } from './admin-moderation.js';

export const apiRouter: Router = Router();

// Decode the bearer token once for every API route; individual routes decide
// whether they require an actor and of which kind.
apiRouter.use(authenticate);

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users/auth', userAuthRouter);
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
