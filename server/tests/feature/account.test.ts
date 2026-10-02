import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import { auth, closeDatabase, makeAdmin, makeUser, request, resetDatabase } from '../helpers/app.js';
import { Game, LinkRequest, Player, User } from '../../src/models/index.js';
import { hashOtp } from '../../src/lib/otp.js';

beforeEach(resetDatabase);
afterAll(closeDatabase);

async function forceResetCode(email: string, code = '424242') {
  await User.updateOne(
    { email },
    {
      $set: {
        resetCodeHash: await hashOtp(code),
        resetExpiresAt: new Date(Date.now() + 10 * 60_000),
        resetAttempts: 0,
      },
    },
  );
  return code;
}

describe('usernames', () => {
  it('are unique regardless of case, enforced by the database', async () => {
    await makeUser({ username: 'Magnus' });
    let error: unknown = null;
    try {
      await makeUser({ username: 'magnus' });
    } catch (caught) {
      error = caught;
    }
    expect((error as { code?: number })?.code).toBe(11000);
  });

  it('cannot be a reserved word', async () => {
    const res = await (await request())
      .post('/api/users/auth/register')
      .send({ username: 'Admin', email: 'x@example.com', password: 'a-good-password' });
    expect(res.status).toBe(409);
  });
});

describe('registration', () => {
  it('lets the owner of an address restart an unverified sign-up', async () => {
    const agent = await request();
    await agent
      .post('/api/users/auth/register')
      .send({ username: 'squatter', email: 'owner@example.com', password: 'squatter-pass' });

    const again = await agent
      .post('/api/users/auth/register')
      .send({ username: 'rightful', email: 'owner@example.com', password: 'owner-password' });

    expect(again.status).toBe(201);
    expect(await User.countDocuments({ email: 'owner@example.com' })).toBe(1);
    expect((await User.findOne({ email: 'owner@example.com' }))?.username).toBe('rightful');
  });

  it('still refuses an address that is already verified', async () => {
    await makeUser({ email: 'taken@example.com' });
    const res = await (await request())
      .post('/api/users/auth/register')
      .send({ username: 'another', email: 'taken@example.com', password: 'a-good-password' });
    expect(res.status).toBe(409);
  });

  it('never lets concurrent guesses exceed the attempt limit', async () => {
    const agent = await request();
    await agent
      .post('/api/users/auth/register')
      .send({ username: 'burst', email: 'burst@example.com', password: 'a-good-password' });

    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        agent
          .post('/api/users/auth/verify-otp')
          .send({ email: 'burst@example.com', code: String(100000 + i) }),
      ),
    );

    const stored = await User.findOne({ username: 'burst' }).select('+otpAttempts').lean();
    expect(stored?.otpAttempts).toBe(5);
  });
});

describe('password reset', () => {
  it('resets with the emailed code, signs in, and revokes older sessions', async () => {
    const { user, token: oldToken } = await makeUser({ email: 'forgot@example.com' });
    const agent = await request();

    const requested = await agent
      .post('/api/users/auth/forgot-password')
      .send({ email: 'forgot@example.com' });
    expect(requested.status).toBe(200);

    const code = await forceResetCode('forgot@example.com');
    const reset = await agent
      .post('/api/users/auth/reset-password')
      .send({ email: 'forgot@example.com', code, password: 'brand-new-password' });

    expect(reset.status).toBe(200);
    expect(reset.body.token).toBeTypeOf('string');

    const stale = await agent.get('/api/users/auth/me').set(...auth(oldToken));
    expect(stale.status).toBe(401);
    const fresh = await agent.get('/api/users/auth/me').set(...auth(reset.body.token));
    expect(fresh.status).toBe(200);

    const login = await agent
      .post('/api/users/auth/login')
      .send({ identifier: user.username, password: 'brand-new-password' });
    expect(login.status).toBe(200);
  });

  it('answers the same for an unknown address', async () => {
    const res = await (await request())
      .post('/api/users/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong code without changing the password', async () => {
    const { user, password } = await makeUser({ email: 'wrong@example.com' });
    const agent = await request();
    await forceResetCode('wrong@example.com', '111111');

    const res = await agent
      .post('/api/users/auth/reset-password')
      .send({ email: 'wrong@example.com', code: '222222', password: 'something-else' });

    expect(res.status).toBe(400);
    const login = await agent
      .post('/api/users/auth/login')
      .send({ identifier: user.username, password });
    expect(login.status).toBe(200);
  });
});

describe('signed-in account management', () => {
  it('changes the password and signs out every other session', async () => {
    const { token, password } = await makeUser();
    const agent = await request();

    const wrong = await agent
      .post('/api/users/auth/me/password')
      .set(...auth(token))
      .send({ current_password: 'not-it', new_password: 'a-new-password' });
    expect(wrong.status).toBe(422);

    const changed = await agent
      .post('/api/users/auth/me/password')
      .set(...auth(token))
      .send({ current_password: password, new_password: 'a-new-password' });
    expect(changed.status).toBe(200);

    expect((await agent.get('/api/users/auth/me').set(...auth(token))).status).toBe(401);
    expect((await agent.get('/api/users/auth/me').set(...auth(changed.body.token))).status).toBe(200);
  });

  it('signs out everywhere else on request', async () => {
    const { token } = await makeUser();
    const agent = await request();

    const revoked = await agent.post('/api/users/auth/me/sessions/revoke').set(...auth(token));

    expect((await agent.get('/api/users/auth/me').set(...auth(token))).status).toBe(401);
    expect((await agent.get('/api/users/auth/me').set(...auth(revoked.body.token))).status).toBe(200);
  });

  it('uploads an avatar and refuses an arbitrary external URL', async () => {
    const { token } = await makeUser();
    const agent = await request();
    const png = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .png()
      .toBuffer();

    const uploaded = await agent
      .post('/api/users/auth/me/avatar')
      .set(...auth(token))
      .attach('file', png, 'me.png');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.avatar_url).toMatch(/^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/);

    const tracking = await agent
      .patch('/api/users/auth/me')
      .set(...auth(token))
      .send({ avatar_url: 'https://tracker.example/pixel.gif' });
    expect(tracking.status).toBe(422);

    const cleared = await agent.patch('/api/users/auth/me').set(...auth(token)).send({ avatar_url: null });
    expect(cleared.body.avatar_url).toBeNull();
  });

  it('stores a preferred language', async () => {
    const { token } = await makeUser();
    const res = await (await request()).patch('/api/users/auth/me').set(...auth(token)).send({ lang: 'ar' });
    expect(res.body.lang).toBe('ar');
  });

  it('deletes an account: anonymised, signed out, withdrawn from play', async () => {
    const { user, token, password } = await makeUser({ username: 'leaving' });
    const agent = await request();
    await agent.post('/api/games').set(...auth(token)).send({});

    const refused = await agent.delete('/api/users/auth/me').set(...auth(token)).send({ password: 'nope' });
    expect(refused.status).toBe(422);

    const deleted = await agent.delete('/api/users/auth/me').set(...auth(token)).send({ password });
    expect(deleted.status).toBe(200);

    const row = await User.findById(user._id);
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.username).toBe(`del_${user._id}`);
    expect(row?.email).not.toContain('chesshub.test');
    expect((await agent.get('/api/users/auth/me').set(...auth(token))).status).toBe(401);
    expect(await Game.countDocuments({ status: 'open' })).toBe(0);

    const login = await agent.post('/api/users/auth/login').send({ identifier: 'leaving', password });
    expect(login.status).toBe(401);
  });
});

describe('public profiles', () => {
  it('finds a player case-insensitively and hides private fields', async () => {
    await makeUser({ username: 'Kasparov' });

    const res = await (await request()).get('/api/users/kasparov');

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('Kasparov');
    expect(res.body.user).not.toHaveProperty('email');
    expect(res.body.relationship).toBeNull();
  });

  it('does not show banned or unverified accounts', async () => {
    await makeUser({ username: 'banned_one', isBanned: true });
    await makeUser({ username: 'pending_one', isVerified: false });
    const agent = await request();

    expect((await agent.get('/api/users/banned_one')).status).toBe(404);
    expect((await agent.get('/api/users/pending_one')).status).toBe(404);
  });

  it('tells the viewer what they can do', async () => {
    const viewer = await makeUser();
    await makeUser({ username: 'quiet', notifDm: false });

    const res = await (await request()).get('/api/users/quiet').set(...auth(viewer.token));

    expect(res.body.relationship).toEqual({
      blocked_by_me: false,
      can_message: false,
      can_challenge: true,
    });
  });

  it('searches by username prefix', async () => {
    await makeUser({ username: 'fischer_bobby' });
    await makeUser({ username: 'tal_mikhail' });

    const res = await (await request()).get('/api/users?search=FISCH');

    expect(res.body.map((u: { username: string }) => u.username)).toEqual(['fischer_bobby']);
  });

  it('charts the rating after each rated game', async () => {
    const white = await makeUser({ username: 'charted' });
    const black = await makeUser();
    const agent = await request();
    const created = await agent.post('/api/games').set(...auth(white.token)).send({ color: 'white' });
    await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(black.token));
    await agent.post(`/api/games/${created.body.id}/resign`).set(...auth(black.token));

    const res = await agent.get('/api/users/charted/rating-history');

    expect(res.body.points).toHaveLength(1);
    expect(res.body.points[0].rating).toBeGreaterThan(1200);
    expect(res.body.current).toBe(res.body.points[0].rating);
  });
});

describe('moderation side effects', () => {
  it('a ban withdraws the player’s challenges and aborts their games', async () => {
    const { token: adminToken } = await makeAdmin();
    const a = await makeUser();
    const b = await makeUser();
    const c = await makeUser();
    const agent = await request();

    const game = await agent.post('/api/games').set(...auth(a.token)).send({});
    await agent.post(`/api/games/${game.body.id}/accept`).set(...auth(b.token));
    await agent.post('/api/games').set(...auth(c.token)).send({ opponent_id: String(a.user._id) });

    await agent.post(`/api/links/admin/users/${a.user._id}/ban`).set(...auth(adminToken)).send({});

    const live = await Game.findById(game.body.id);
    expect(live?.status).toBe('aborted');
    expect(await Game.countDocuments({ status: 'open' })).toBe(0);
    expect((await User.findById(b.user._id))?.gamesPlayed).toBe(0);
  });

  it('approving a link settles every other pending request for that profile', async () => {
    const { token: adminToken } = await makeAdmin();
    const player = await Player.create({ nameEn: 'Hou Yifan', nameAr: 'هو يفان' });
    const first = await makeUser();
    const second = await makeUser();
    const agent = await request();

    const winner = await agent
      .post('/api/links/request')
      .set(...auth(first.token))
      .send({ player_id: String(player._id) });
    await agent
      .post('/api/links/request')
      .set(...auth(second.token))
      .send({ player_id: String(player._id) });

    await agent
      .post(`/api/links/admin/requests/${winner.body.id}/approve`)
      .set(...auth(adminToken))
      .send({});

    const other = await LinkRequest.findOne({ userId: second.user._id });
    expect(other?.status).toBe('rejected');
  });
});

describe('platform', () => {
  it('reports health with the database state', async () => {
    const res = await (await request()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('up');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('answers malformed JSON with a 400, not a crash', async () => {
    const res = await (await request())
      .post('/api/users/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"identifier": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/malformed json/i);
  });

  it('returns JSON 404s for unknown API routes', async () => {
    const res = await (await request()).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });
});
