import { Router } from 'express';
import { z } from 'zod';
import {
  RESERVED_USERNAMES,
  USERNAME_COLLATION,
  USER_LANGS,
  User,
  type UserDoc,
} from '../models/index.js';
import { signToken } from '../lib/jwt.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { parseBody } from '../lib/validate.js';
import { serializeUserPrivate } from '../lib/serializers.js';
import { trimToNull } from '../lib/sanitize.js';
import { otpEmail, passwordResetEmail, sendEmail, type EmailLang } from '../lib/email.js';
import { hashPassword, verifyAgainstNothing, verifyPassword } from '../lib/password.js';
import { imageUpload, removeStoredImage, storeImage } from '../lib/images.js';
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
  avatarLimiter,
  loginLimiter,
  otpResendLimiter,
  otpVerifyLimiter,
  passwordResetLimiter,
  registerLimiter,
  sensitiveLimiter,
} from '../middleware/rate-limit.js';
import { deleteAccount } from '../services/account-service.js';

export const userAuthRouter: Router = Router();

const RESET_TTL_MS = 15 * 60 * 1000;

const langField = z.enum(USER_LANGS).default('en');
const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');
const emailField = z.email('Enter a valid email address').max(190);

/** The session payload every sign-in path returns. */
function session(user: UserDoc) {
  return {
    token: signToken(String(user._id), 'user', user.tokenVersion ?? 0),
    user: serializeUserPrivate(user),
  };
}

function nameFor(user: { displayName?: string | null; username: string }) {
  return user.displayName || user.username;
}

/** Issue and email a fresh verification code, replacing any previous one. */
async function issueOtp(user: UserDoc, lang: EmailLang) {
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
  await sendEmail({ to: user.email, toName: nameFor(user), ...otpEmail(nameFor(user), code, lang) });
}

function assertUsernameAllowed(username: string) {
  const lower = username.toLowerCase();
  // `del_` is how deleted accounts are renamed.
  if (RESERVED_USERNAMES.has(lower) || lower.startsWith('del_')) {
    throw HttpError.conflict('Username already taken');
  }
}

/** Turn a unique-index collision into the message the form expects. */
function duplicateKeyError(error: unknown): HttpError | null {
  if ((error as { code?: number })?.code !== 11000) return null;
  const keys = Object.keys((error as { keyPattern?: object }).keyPattern ?? {});
  return HttpError.conflict(keys.includes('email') ? 'Email already registered' : 'Username already taken');
}

// ---------------------------------------------------------------- register

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,30}$/, 'Username must be 3-30 characters: letters, digits or underscore'),
  email: emailField,
  password: passwordField,
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
    assertUsernameAllowed(body.username);

    // Two lookups rather than one $or, so each can use its own index: the
    // username index is case-insensitive, the email index is exact on the
    // stored lowercase form.
    const [byEmail, byName] = await Promise.all([
      User.findOne({ email }).select('+otpLastSentAt'),
      User.findOne({ username: body.username }).collation(USERNAME_COLLATION).select('_id'),
    ]);

    if (byEmail && (byEmail.isVerified || byEmail.deletedAt)) {
      throw HttpError.conflict('Email already registered');
    }
    if (byName && String(byName._id) !== String(byEmail?._id)) {
      throw HttpError.conflict('Username already taken');
    }

    const attrs = {
      username: body.username,
      passwordHash: await hashPassword(body.password),
      displayName: trimToNull(body.display_name, 120),
      country: trimToNull(body.country, 100),
      lang: body.lang,
    };

    let user: UserDoc;
    try {
      if (byEmail) {
        // An unverified sign-up for this address. Whoever controls the inbox
        // is the owner, so starting over replaces the pending details —
        // otherwise anyone could lock an address out by registering it first.
        byEmail.set(attrs);
        user = await byEmail.save();
      } else {
        user = await User.create({ ...attrs, email });
      }
    } catch (error) {
      throw duplicateKeyError(error) ?? error;
    }

    if (!byEmail || canResend(byEmail.otpLastSentAt)) await issueOtp(user, body.lang);

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

    if (!user || user.deletedAt) throw invalid();
    if (user.isVerified) throw HttpError.badRequest('This account is already verified');
    if (isExpired(user.otpExpiresAt)) throw invalid();

    // Spend an attempt *before* checking. Checking first and counting after
    // let a burst of concurrent guesses all pass the cap together.
    const reserved = await User.updateOne(
      { _id: user._id, otpAttempts: { $lt: OTP_MAX_ATTEMPTS } },
      { $inc: { otpAttempts: 1 } },
    );
    if (reserved.modifiedCount === 0) {
      throw HttpError.tooManyRequests('Too many attempts. Request a new code.');
    }

    if (!(await verifyOtp(code, user.otpCodeHash))) throw invalid();

    // Guarded on the code still being the current one, so a code replaced by a
    // resend in the meantime cannot verify the account.
    const verified = await User.findOneAndUpdate(
      { _id: user._id, otpCodeHash: user.otpCodeHash },
      {
        $set: {
          isVerified: true,
          otpCodeHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          lastLoginAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    if (!verified) throw invalid();

    res.json(session(verified));
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

    if (user && !user.isVerified && !user.deletedAt && canResend(user.otpLastSentAt)) {
      await issueOtp(user, lang);
    }

    // Always the same answer, whether or not the address exists.
    res.json({ message: 'If that email is registered, a new code is on its way' });
  }),
);

// ------------------------------------------------------------------- login

const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(190).optional(),
    email: z.string().trim().min(1).max(190).optional(),
    username: z.string().trim().min(1).max(190).optional(),
    password: z.string().min(1, 'Password is required').max(200),
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

    // Usernames cannot contain "@", so the identifier says which it is. Each
    // lookup uses its own index; the username one is case-insensitive, so
    // "Magnus" signs in as "magnus".
    const query = identifier.includes('@')
      ? User.findOne({ email: identifier.toLowerCase() })
      : User.findOne({ username: identifier }).collation(USERNAME_COLLATION);
    const user = await query.select('+passwordHash +otpLastSentAt');

    if (!user || user.deletedAt) {
      await verifyAgainstNothing(body.password);
      throw HttpError.unauthorized('Invalid credentials');
    }

    const check = await verifyPassword(body.password, user.passwordHash);
    if (!check.valid) throw HttpError.unauthorized('Invalid credentials');

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

    const updates: Record<string, unknown> = { lastLoginAt: new Date() };
    // Upgrade a hash made at an older cost, or by bcryptjs, now that we have
    // the plaintext in hand.
    if (check.needsRehash) updates.passwordHash = await hashPassword(body.password);
    await User.updateOne({ _id: user._id }, { $set: updates });

    res.json(session(user));
  }),
);

// ---------------------------------------------------------- password reset

const forgotSchema = z.object({ email: emailField, lang: langField });

userAuthRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const { email, lang } = parseBody(forgotSchema, req);
    const user = await User.findOne({ email: email.toLowerCase() }).select('+resetLastSentAt');

    if (user && !user.deletedAt && canResend(user.resetLastSentAt)) {
      const code = generateOtp();
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            resetCodeHash: await hashOtp(code),
            resetExpiresAt: new Date(Date.now() + RESET_TTL_MS),
            resetLastSentAt: new Date(),
            resetAttempts: 0,
          },
        },
      );
      const emailLang = (user.lang as EmailLang | undefined) ?? lang;
      await sendEmail({
        to: user.email,
        toName: nameFor(user),
        ...passwordResetEmail(nameFor(user), code, emailLang),
      });
    }

    // Identical whether or not the address is registered.
    res.json({ message: 'If that email is registered, a reset code is on its way' });
  }),
);

const resetSchema = z.object({
  email: emailField,
  code: z.string().trim().regex(/^\d{4,10}$/, 'Enter the code from your email'),
  password: passwordField,
});

userAuthRouter.post(
  '/reset-password',
  otpVerifyLimiter,
  asyncHandler(async (req, res) => {
    const { email, code, password } = parseBody(resetSchema, req);
    const invalid = () => HttpError.badRequest('Invalid or expired code');

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+resetCodeHash +resetExpiresAt +resetAttempts',
    );
    if (!user || user.deletedAt || !user.resetCodeHash) throw invalid();
    if (isExpired(user.resetExpiresAt)) throw invalid();

    const reserved = await User.updateOne(
      { _id: user._id, resetAttempts: { $lt: OTP_MAX_ATTEMPTS } },
      { $inc: { resetAttempts: 1 } },
    );
    if (reserved.modifiedCount === 0) {
      throw HttpError.tooManyRequests('Too many attempts. Request a new code.');
    }

    if (!(await verifyOtp(code, user.resetCodeHash))) throw invalid();

    // Receiving the code proves control of the inbox, so an unverified
    // account is verified here too. Every existing session is revoked.
    const updated = await User.findOneAndUpdate(
      { _id: user._id, resetCodeHash: user.resetCodeHash },
      {
        $set: {
          passwordHash: await hashPassword(password),
          resetCodeHash: null,
          resetExpiresAt: null,
          resetAttempts: 0,
          isVerified: true,
          otpCodeHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          lastLoginAt: new Date(),
        },
        $inc: { tokenVersion: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw invalid();

    if (updated.isBanned) {
      throw HttpError.forbidden('Account suspended', {
        code: 'account_banned',
        details: { is_banned: true, ban_reason: updated.banReason },
      });
    }

    res.json(session(updated));
  }),
);

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
  // Avatars are uploaded (see below); an arbitrary external URL here would let
  // a player make everyone who views their profile fetch from a server of
  // their choosing. Only clearing is accepted.
  avatar_url: z.null().optional(),
  lang: z.enum(USER_LANGS).optional(),
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
    if (body.avatar_url === null && user.avatarUrl) {
      await removeStoredImage(user.avatarUrl);
      user.avatarUrl = null;
    }
    if (body.lang !== undefined) user.lang = body.lang;
    if (body.notif_email !== undefined) user.notifEmail = body.notif_email;
    if (body.notif_dm !== undefined) user.notifDm = body.notif_dm;
    if (body.notif_game_chat !== undefined) user.notifGameChat = body.notif_game_chat;
    if (body.notif_sound !== undefined) user.notifSound = body.notif_sound;

    await user.save();
    await user.populate('linkedPlayerId');
    res.json(serializeUserPrivate(user));
  }),
);

userAuthRouter.post(
  '/me/avatar',
  requireUser,
  avatarLimiter,
  imageUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) throw HttpError.badRequest('No file provided');
    const user = currentUser(req);

    const stored = await storeImage(req.file.buffer, {
      maxDimension: 256,
      square: true,
      folder: 'avatars',
    });

    const previous = user.avatarUrl;
    user.avatarUrl = stored.url;
    await user.save();
    await removeStoredImage(previous);

    await user.populate('linkedPlayerId');
    res.status(201).json(serializeUserPrivate(user));
  }),
);

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Enter your current password').max(200),
  new_password: passwordField,
});

userAuthRouter.post(
  '/me/password',
  requireUser,
  sensitiveLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(changePasswordSchema, req);
    const user = await User.findById(currentUser(req)._id).select('+passwordHash');
    if (!user) throw HttpError.unauthorized('Account no longer exists');

    const check = await verifyPassword(body.current_password, user.passwordHash);
    if (!check.valid) {
      throw new HttpError(422, 'Your current password is incorrect', {
        details: [{ path: 'current_password', message: 'Incorrect password' }],
      });
    }

    // Every other session is signed out; this one gets a fresh token.
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(body.new_password) }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) throw HttpError.unauthorized('Account no longer exists');
    await updated.populate('linkedPlayerId');

    res.json(session(updated));
  }),
);

/** Sign out everywhere else: every token issued so far stops working. */
userAuthRouter.post(
  '/me/sessions/revoke',
  requireUser,
  sensitiveLimiter,
  asyncHandler(async (req, res) => {
    const updated = await User.findOneAndUpdate(
      { _id: currentUser(req)._id },
      { $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) throw HttpError.unauthorized('Account no longer exists');
    await updated.populate('linkedPlayerId');
    res.json(session(updated));
  }),
);

const deleteSchema = z.object({ password: z.string().min(1, 'Enter your password').max(200) });

userAuthRouter.delete(
  '/me',
  requireUser,
  sensitiveLimiter,
  asyncHandler(async (req, res) => {
    const { password } = parseBody(deleteSchema, req);
    const user = await User.findById(currentUser(req)._id).select('+passwordHash');
    if (!user) throw HttpError.unauthorized('Account no longer exists');

    if (!(await verifyPassword(password, user.passwordHash)).valid) {
      throw new HttpError(422, 'Your password is incorrect', {
        details: [{ path: 'password', message: 'Incorrect password' }],
      });
    }

    await deleteAccount(user);
    res.json({ message: 'Account deleted' });
  }),
);
