import { Router } from 'express';
import { z } from 'zod';
import { Admin } from '../models/index.js';
import { signToken } from '../lib/jwt.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { parseBody } from '../lib/validate.js';
import { serializeAdmin } from '../lib/serializers.js';
import { hashPassword, verifyAgainstNothing, verifyPassword } from '../lib/password.js';
import { currentAdmin, requireAdmin } from '../middleware/auth.js';
import { limiter, loginLimiter } from '../middleware/rate-limit.js';

export const authRouter: Router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(80),
  password: z.string().min(1, 'Password is required').max(200),
});

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = parseBody(loginSchema, req);

    const admin = await Admin.findOne({ username }).select('+passwordHash');
    if (!admin) {
      // Same work as a wrong password, so the response time does not reveal
      // which usernames exist.
      await verifyAgainstNothing(password);
      throw HttpError.unauthorized('Invalid credentials');
    }

    const check = await verifyPassword(password, admin.passwordHash);
    if (!check.valid) throw HttpError.unauthorized('Invalid credentials');
    if (check.needsRehash) {
      await Admin.updateOne({ _id: admin._id }, { $set: { passwordHash: await hashPassword(password) } });
    }

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
      passwordHash: await hashPassword(password),
    });

    res.status(201).json({
      token: signToken(String(admin._id), 'admin'),
      admin: serializeAdmin(admin),
    });
  }),
);
