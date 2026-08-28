import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, closeDatabase, makeAdmin, makeUser, request, resetDatabase } from '../helpers/app.js';
import { User } from '../../src/models/index.js';
import { signToken } from '../../src/lib/jwt.js';

beforeEach(resetDatabase);
afterAll(closeDatabase);

describe('POST /api/auth/login (admin)', () => {
  it('returns a token for correct credentials', async () => {
    const { password } = await makeAdmin({ username: 'root' });
    const res = await (await request())
      .post('/api/auth/login')
      .send({ username: 'root', password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.admin.username).toBe('root');
    expect(res.body.admin).not.toHaveProperty('passwordHash');
  });

  it('rejects a wrong password', async () => {
    await makeAdmin({ username: 'root' });
    const res = await (await request())
      .post('/api/auth/login')
      .send({ username: 'root', password: 'nope' });

    expect(res.status).toBe(401);
  });

  it('gives the same answer for an unknown account', async () => {
    const res = await (await request())
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'nope' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

describe('POST /api/auth/setup', () => {
  it('creates the first admin and then closes itself', async () => {
    const first = await (await request())
      .post('/api/auth/setup')
      .send({ username: 'root', email: 'root@chesshub.test', password: 'a-long-password' });
    expect(first.status).toBe(201);

    const second = await (await request())
      .post('/api/auth/setup')
      .send({ username: 'root2', email: 'root2@chesshub.test', password: 'a-long-password' });
    expect(second.status).toBe(403);
  });
});

describe('role separation', () => {
  it('refuses a player token on an admin route', async () => {
    const { token } = await makeUser();
    const res = await (await request()).get('/api/auth/me').set(...auth(token));

    expect(res.status).toBe(403);
  });

  it('refuses an admin token on a player route', async () => {
    const { token } = await makeAdmin();
    const res = await (await request()).get('/api/users/auth/me').set(...auth(token));

    expect(res.status).toBe(403);
  });

  it('refuses a token for an account that has been deleted', async () => {
    const { admin, token } = await makeAdmin();
    await admin.deleteOne();

    const res = await (await request()).get('/api/auth/me').set(...auth(token));
    expect(res.status).toBe(401);
  });

  it('refuses a token signed with the wrong secret', async () => {
    const res = await (await request())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.token');

    expect(res.status).toBe(401);
  });

  it('refuses a token whose id does not exist', async () => {
    const res = await (await request())
      .get('/api/users/auth/me')
      .set(...auth(signToken('64b8f0000000000000000000', 'user')));

    expect(res.status).toBe(401);
  });
});

describe('player registration and verification', () => {
  it('registers, then verifies with the emailed code', async () => {
    const agent = await request();

    const registered = await agent.post('/api/users/auth/register').send({
      username: 'magnus',
      email: 'Magnus@Example.com',
      password: 'a-good-password',
      display_name: 'Magnus C',
    });
    expect(registered.status).toBe(201);
    expect(registered.body.email).toBe('magnus@example.com');

    // The account is unusable until the code is confirmed.
    const before = await agent
      .post('/api/users/auth/login')
      .send({ identifier: 'magnus', password: 'a-good-password' });
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('email_unverified');

    // Read the code the only way a test can: force a known one.
    const { hashOtp, otpExpiry } = await import('../../src/lib/otp.js');
    await User.updateOne(
      { username: 'magnus' },
      { $set: { otpCodeHash: await hashOtp('123456'), otpExpiresAt: otpExpiry(), otpAttempts: 0 } },
    );

    const verified = await agent
      .post('/api/users/auth/verify-otp')
      .send({ email: 'magnus@example.com', code: '123456' });

    expect(verified.status).toBe(200);
    expect(verified.body.token).toBeTypeOf('string');
    expect(verified.body.user.is_verified).toBe(true);
    expect(verified.body.user).not.toHaveProperty('passwordHash');
    expect(verified.body.user).not.toHaveProperty('otpCodeHash');
  });

  it('stores the code hashed, never in plaintext', async () => {
    await (await request()).post('/api/users/auth/register').send({
      username: 'hashcheck',
      email: 'hash@example.com',
      password: 'a-good-password',
    });

    const stored = await User.findOne({ username: 'hashcheck' })
      .select('+otpCodeHash')
      .lean();

    expect(stored?.otpCodeHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const agent = await request();
    await agent.post('/api/users/auth/register').send({
      username: 'attempts',
      email: 'attempts@example.com',
      password: 'a-good-password',
    });

    const res = await agent
      .post('/api/users/auth/verify-otp')
      .send({ email: 'attempts@example.com', code: '000000' });

    expect(res.status).toBe(400);
    const stored = await User.findOne({ username: 'attempts' }).select('+otpAttempts').lean();
    expect(stored?.otpAttempts).toBe(1);
  });

  it('refuses duplicate usernames regardless of case', async () => {
    const agent = await request();
    await agent.post('/api/users/auth/register').send({
      username: 'Taken',
      email: 'taken@example.com',
      password: 'a-good-password',
    });

    const res = await agent.post('/api/users/auth/register').send({
      username: 'taken',
      email: 'other@example.com',
      password: 'a-good-password',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Username already taken');
  });

  it('does not reveal whether an address is registered when resending', async () => {
    const res = await (await request())
      .post('/api/users/auth/resend-otp')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email is registered/i);
  });

  it('validates the registration payload', async () => {
    const res = await (await request()).post('/api/users/auth/register').send({
      username: 'no',
      email: 'not-an-email',
      password: 'short',
    });

    expect(res.status).toBe(422);
    expect(res.body.details.length).toBeGreaterThan(0);
  });
});

describe('player login', () => {
  it('accepts a username whose case differs from the stored one', async () => {
    await makeUser({ username: 'MagnusC', password: 'a-good-password' });

    const res = await (await request())
      .post('/api/users/auth/login')
      .send({ identifier: 'magnusc', password: 'a-good-password' });

    expect(res.status).toBe(200);
  });

  it('accepts an email in any case', async () => {
    await makeUser({ email: 'player@example.com', password: 'a-good-password' });

    const res = await (await request())
      .post('/api/users/auth/login')
      .send({ identifier: 'PLAYER@example.com', password: 'a-good-password' });

    expect(res.status).toBe(200);
  });

  it('blocks a banned account and says why', async () => {
    const { user, password } = await makeUser();
    user.isBanned = true;
    user.banReason = 'Cheating';
    await user.save();

    const res = await (await request())
      .post('/api/users/auth/login')
      .send({ identifier: user.username, password });

    expect(res.status).toBe(403);
    expect(res.body.details.ban_reason).toBe('Cheating');
  });

  it('blocks a banned account from authenticated routes immediately', async () => {
    const { user, token } = await makeUser();
    user.isBanned = true;
    await user.save();

    const res = await (await request()).get('/api/users/auth/me').set(...auth(token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_banned');
  });
});

describe('PATCH /api/users/auth/me', () => {
  it('updates the profile and notification preferences', async () => {
    const { token } = await makeUser();

    const res = await (await request())
      .patch('/api/users/auth/me')
      .set(...auth(token))
      .send({ display_name: '  Grandmaster  ', country: 'Norway', notif_sound: false });

    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Grandmaster');
    expect(res.body.country).toBe('Norway');
    expect(res.body.notif_sound).toBe(false);
  });

  it('cannot be used to change the rating or ban state', async () => {
    const { token, user } = await makeUser();

    await (await request())
      .patch('/api/users/auth/me')
      .set(...auth(token))
      .send({ online_rating: 3000, is_banned: false, linked_player_id: '64b8f0000000000000000000' });

    const fresh = await User.findById(user._id).lean();
    expect(fresh?.onlineRating).toBe(1200);
    expect(fresh?.linkedPlayerId).toBeNull();
  });
});
