import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/index.js';
import { env } from '../config/env.js';
import { signToken } from '../lib/jwt.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { parseBody } from '../lib/validate.js';
import { serializeUserPrivate } from '../lib/serializers.js';
import { trimToNull } from '../lib/sanitize.js';
import { otpEmail, sendEmail } from '../lib/email.js';
import {
  OTP_MAX_ATTEMPTS,
  canResend,
  generateOtp,
  hashOtp,
  isExpired,
  otpExpiry,
  verifyOtp,
} from '../lib/otp.js';
import { currentUser, requireUser } from '../middleware/auth.js';
import {
  loginLimiter,
  otpResendLimiter,
  otpVerifyLimiter,
  registerLimiter,
} from '../middleware/rate-limit.js';

export const userAuthRouter: Router = Router();

const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO1oO7VQfF5Y0GQPO5rZ5uMqQzZQzZQzZ';

const langField = z.enum(['en', 'ar']).default('en');

/** Issue and email a fresh code, replacing any previous one. */
async function issueOtp(user: { _id: unknown; email: string; username: string; displayName?: string | null }, lang: 'en' | 'ar') {
  const code = generateOtp();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        otpCodeHash: await hashOtp(code),
        otpExpiresAt: otpExpiry(),
        otpLastSentAt: new Date(),
        otpAttempts: 0,
      },
    },
  );
  await sendEmail({
    to: user.email,
    toName: user.displayName || user.username,
    ...otpEmail(user.displayName || user.username, code, lang),
  });
}

// ---------------------------------------------------------------- register

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,30}$/, 'Username must be 3-30 characters: letters, digits or underscore'),
  email: z.email('Enter a valid email address').max(190),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  display_name: z.string().max(120).optional(),
  country: z.string().max(100).optional(),
  lang: langField,
});

userAuthRouter.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req);
    const email = body.email.toLowerCase();

    // Usernames are compared case-insensitively so "Magnus" and "magnus"
    // cannot both be registered and later collide at sign-in.
    const clash = await User.findOne({
      $or: [{ email }, { username: { $regex: `^${body.username}$`, $options: 'i' } }],
    })
      .select('_id email username')
      .lean();

    if (clash) {
      throw HttpError.conflict(
        clash.email === email ? 'Email already registered' : 'Username already taken',
      );
    }

    const user = await User.create({
      username: body.username,
      email,
      passwordHash: await bcrypt.hash(body.password, env.BCRYPT_ROUNDS),
      displayName: trimToNull(body.display_name, 120),
      country: trimToNull(body.country, 100),
    });

    await issueOtp(user, body.lang);

    res.status(201).json({
      message: 'Verification code sent',
      email: user.email,
      user_id: String(user._id),
    });
  }),
);

// -------------------------------------------------------------- verify OTP

const verifySchema = z.object({
  email: z.email('Enter a valid email address'),
  code: z.string().trim().regex(/^\d{4,10}$/, 'Enter the code from your email'),
});

userAuthRouter.post(
  '/verify-otp',
  otpVerifyLimiter,
  asyncHandler(async (req, res) => {
    const { email, code } = parseBody(verifySchema, req);

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+otpCodeHash +otpExpiresAt +otpAttempts',
    );

    // One message for every failure mode, so this cannot be used to test
    // which addresses are registered.
    const invalid = () => HttpError.badRequest('Invalid or expired code');

    if (!user) throw invalid();
    if (user.isVerified) throw HttpError.badRequest('This account is already verified');
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw HttpError.tooManyRequests('Too many attempts. Request a new code.');
    }
    if (isExpired(user.otpExpiresAt)) throw invalid();

    if (!(await verifyOtp(code, user.otpCodeHash))) {
      await User.updateOne({ _id: user._id }, { $inc: { otpAttempts: 1 } });
      throw invalid();
    }

    user.isVerified = true;
    user.otpCodeHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      token: signToken(String(user._id), 'user'),
      user: serializeUserPrivate(user),
    });
  }),
);

// -------------------------------------------------------------- resend OTP

const resendSchema = z.object({ email: z.email(), lang: langField });

userAuthRouter.post(
  '/resend-otp',
  otpResendLimiter,
  asyncHandler(async (req, res) => {
    const { email, lang } = parseBody(resendSchema, req);
    const user = await User.findOne({ email: email.toLowerCase() }).select('+otpLastSentAt');

    if (user && !user.isVerified && canResend(user.otpLastSentAt)) {
      await issueOtp(user, lang);
    }

    // Always the same answer, whether or not the address exists.
    res.json({ message: 'If that email is registered, a new code is on its way' });
  }),
);

// ------------------------------------------------------------------- login

const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
    lang: langField,
  })
  .refine((body) => body.identifier || body.email || body.username, {
    message: 'Enter your username or email',
    path: ['identifier'],
  });

userAuthRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req);
    const identifier = (body.identifier ?? body.email ?? body.username ?? '').trim();

    // Match the email case-insensitively via the stored lowercase form, and the
    // username case-insensitively too. The Flask version lowercased the whole
    // identifier before comparing it to a case-sensitive username column, so
    // anyone with a capital letter in their username could not sign in with it.
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: { $regex: `^${escapeRegExp(identifier)}$`, $options: 'i' } },
      ],
    }).select('+passwordHash +otpLastSentAt');

    const matches = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !matches) throw HttpError.unauthorized('Invalid credentials');

    if (user.isBanned) {
      throw HttpError.forbidden('Account suspended', {
        code: 'account_banned',
        details: { is_banned: true, ban_reason: user.banReason },
      });
    }

    if (!user.isVerified) {
      if (canResend(user.otpLastSentAt)) await issueOtp(user, body.lang);
      throw HttpError.forbidden('Email not verified', {
        code: 'email_unverified',
        details: { needs_verification: true, email: user.email },
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      token: signToken(String(user._id), 'user'),
      user: serializeUserPrivate(user),
    });
  }),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// -------------------------------------------------------------------- self

userAuthRouter.get(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await user.populate('linkedPlayerId');
    res.json(serializeUserPrivate(user));
  }),
);

const updateMeSchema = z.object({
  display_name: z.string().max(120).nullish(),
  country: z.string().max(100).nullish(),
  avatar_url: z.string().max(500).nullish(),
  notif_email: z.boolean().optional(),
  notif_dm: z.boolean().optional(),
  notif_game_chat: z.boolean().optional(),
  notif_sound: z.boolean().optional(),
});

userAuthRouter.patch(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => {
    const body = parseBody(updateMeSchema, req);
    const user = currentUser(req);

    if ('display_name' in body) user.displayName = trimToNull(body.display_name, 120);
    if ('country' in body) user.country = trimToNull(body.country, 100);
    if ('avatar_url' in body) user.avatarUrl = trimToNull(body.avatar_url, 500);
    if (body.notif_email !== undefined) user.notifEmail = body.notif_email;
    if (body.notif_dm !== undefined) user.notifDm = body.notif_dm;
    if (body.notif_game_chat !== undefined) user.notifGameChat = body.notif_game_chat;
    if (body.notif_sound !== undefined) user.notifSound = body.notif_sound;

    await user.save();
    await user.populate('linkedPlayerId');
    res.json(serializeUserPrivate(user));
  }),
);
