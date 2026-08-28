import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authRouter } from './auth.js';
import { userAuthRouter } from './user-auth.js';

export const apiRouter: Router = Router();

// Decode the bearer token once for every API route; individual routes decide
// whether they require an actor and of which kind.
apiRouter.use(authenticate);

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users/auth', userAuthRouter);
