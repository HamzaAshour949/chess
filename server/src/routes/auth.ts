import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Admin } from '../models/index.js';
import { env } from '../config/env.js';
import { signToken } from '../lib/jwt.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { parseBody } from '../lib/validate.js';
import { serializeAdmin } from '../lib/serializers.js';
import { currentAdmin, requireAdmin } from '../middleware/auth.js';
import { limiter, loginLimiter } from '../middleware/rate-limit.js';

export const authRouter: Router = Router();

/**
 * A bcrypt hash of a value nobody knows, compared against when the account
 * does not exist. Without it, a missing account returns noticeably faster than
 * a wrong password and the endpoint becomes a username oracle.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO1oO7VQfF5Y0GQPO5rZ5uMqQzZQzZQzZ';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = parseBody(loginSchema, req);

    const admin = await Admin.findOne({ username }).select('+passwordHash');
    const matches = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);

    if (!admin || !matches) throw HttpError.unauthorized('Invalid credentials');

    res.json({
      token: signToken(String(admin._id), 'admin'),
      admin: serializeAdmin(admin),
    });
  }),
);

authRouter.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(serializeAdmin(currentAdmin(req)));
  }),
);

const setupSchema = z.object({
  username: z.string().trim().min(3).max(80),
  email: z.email('Invalid email').max(190),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
});

/**
 * Bootstrap the first admin. Only works while no admin exists, so it closes
 * itself the moment the platform is set up.
 */
authRouter.post(
  '/setup',
  limiter({ windowMs: 60 * 60 * 1000, limit: 5 }),
  asyncHandler(async (req, res) => {
    if ((await Admin.estimatedDocumentCount()) > 0) {
      throw HttpError.forbidden('An admin account already exists');
    }

    const { username, email, password } = parseBody(setupSchema, req);
    const admin = await Admin.create({
      username,
      email,
      passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    });

    res.status(201).json({
      token: signToken(String(admin._id), 'admin'),
      admin: serializeAdmin(admin),
    });
  }),
);
