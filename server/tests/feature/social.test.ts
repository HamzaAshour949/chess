import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, closeDatabase, makeAdmin, makeUser, request, resetDatabase } from '../helpers/app.js';
import { BlockedUser, DirectMessage, Game, LinkRequest, Player, User } from '../../src/models/index.js';

beforeEach(resetDatabase);
afterAll(closeDatabase);

async function startedGame() {
  const white = await makeUser({ username: 'whitey' });
  const black = await makeUser({ username: 'blacky' });
  const agent = await request();
  const created = await agent.post('/api/games').set(...auth(white.token)).send({ color: 'white' });
  await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(black.token));
  return { white, black, agent, gameId: created.body.id as string };
}

describe('game chat', () => {
  it('lets a participant post and anyone read', async () => {
    const { white, agent, gameId } = await startedGame();

    const posted = await agent
      .post(`/api/games/${gameId}/chat`)
      .set(...auth(white.token))
      .send({ content: 'good luck' });

    expect(posted.status).toBe(201);

    // Spectators read without signing in.
    const read = await agent.get(`/api/games/${gameId}/chat`);
    expect(read.body).toHaveLength(1);
    expect(read.body[0].content).toBe('good luck');
  });

  it('strips links from in-game chat', async () => {
    const { white, agent, gameId } = await startedGame();

    const res = await agent
      .post(`/api/games/${gameId}/chat`)
      .set(...auth(white.token))
      .send({ content: 'add me at https://discord.gg/abc' });

    expect(res.body.content).toBe('add me at [link removed]');
  });

  it('keeps a link-stripped message within the length limit', async () => {
    const { white, agent, gameId } = await startedGame();

    const res = await agent
      .post(`/api/games/${gameId}/chat`)
      .set(...auth(white.token))
      .send({ content: `${'a'.repeat(495)} http://x.co` });

    expect(res.status).toBe(201);
    expect(res.body.content.length).toBeLessThanOrEqual(500);
  });

  it('refuses a spectator posting', async () => {
    const { agent, gameId } = await startedGame();
    const spectator = await makeUser();

    const res = await agent
      .post(`/api/games/${gameId}/chat`)
      .set(...auth(spectator.token))
      .send({ content: 'hello' });

    expect(res.status).toBe(403);
  });

  it('refuses a muted player', async () => {
    const { white, agent, gameId } = await startedGame();
    await User.updateOne({ _id: white.user._id }, { $set: { chatMuted: true } });

    const res = await agent
      .post(`/api/games/${gameId}/chat`)
      .set(...auth(white.token))
      .send({ content: 'hello' });

    expect(res.status).toBe(403);
  });

  it('respects an admin chat lock on the game', async () => {
    const { white, agent, gameId } = await startedGame();
    const admin = await makeAdmin();

    await agent.post(`/api/games/admin/games/${gameId}/chat-toggle`).set(...auth(admin.token));

    const res = await agent
      .post(`/api/games/${gameId}/chat`)
      .set(...auth(white.token))
      .send({ content: 'hello' });

    expect(res.status).toBe(403);
  });
});

describe('direct messages', () => {
  it('sends, threads and marks read', async () => {
    const a = await makeUser({ username: 'alice' });
    const b = await makeUser({ username: 'bob' });
    const agent = await request();

    await agent
      .post(`/api/messages/with/${b.user._id}`)
      .set(...auth(a.token))
      .send({ content: 'hey there' });

    const unread = await agent.get('/api/messages/unread-count').set(...auth(b.token));
    expect(unread.body.unread).toBe(1);

    const threads = await agent.get('/api/messages/threads').set(...auth(b.token));
    expect(threads.body).toHaveLength(1);
    expect(threads.body[0].other_user.username).toBe('alice');
    expect(threads.body[0].unread).toBe(1);

    const thread = await agent.get(`/api/messages/with/${a.user._id}`).set(...auth(b.token));
    expect(thread.body.messages).toHaveLength(1);
    expect(thread.body.messages[0].is_mine).toBe(false);

    const after = await agent.get('/api/messages/unread-count').set(...auth(b.token));
    expect(after.body.unread).toBe(0);
  });

  it('counts unread accurately past the old 500-message window', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { conversationKey } = await import('../../src/models/index.js');

    // 600 messages: the Flask implementation only looked at the newest 500.
    await DirectMessage.insertMany(
      Array.from({ length: 600 }, (_, i) => ({
        senderId: a.user._id,
        recipientId: b.user._id,
        content: `message ${i}`,
        pairKey: conversationKey(String(a.user._id), String(b.user._id)),
        createdAt: new Date(Date.now() - (600 - i) * 1000),
      })),
    );

    const unread = await (await request())
      .get('/api/messages/unread-count')
      .set(...auth(b.token));

    expect(unread.body.unread).toBe(600);
  });

  it('keeps links in direct messages', async () => {
    const a = await makeUser();
    const b = await makeUser();

    const res = await (await request())
      .post(`/api/messages/with/${b.user._id}`)
      .set(...auth(a.token))
      .send({ content: 'see https://lichess.org/study' });

    expect(res.body.content).toContain('https://lichess.org/study');
  });

  it('blocks messaging in both directions once either side blocks', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agent = await request();

    await agent.post(`/api/messages/blocks/${b.user._id}`).set(...auth(a.token));

    const fromBlocker = await agent
      .post(`/api/messages/with/${b.user._id}`)
      .set(...auth(a.token))
      .send({ content: 'hi' });
    const fromBlocked = await agent
      .post(`/api/messages/with/${a.user._id}`)
      .set(...auth(b.token))
      .send({ content: 'hi' });

    expect(fromBlocker.status).toBe(403);
    expect(fromBlocked.status).toBe(403);
  });

  it('hides the conversation history from a blocked user', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agent = await request();

    await agent
      .post(`/api/messages/with/${b.user._id}`)
      .set(...auth(a.token))
      .send({ content: 'before the block' });
    await BlockedUser.create({ blockerId: a.user._id, blockedId: b.user._id });

    // The old API kept the thread readable and only stopped new messages.
    const res = await agent.get(`/api/messages/with/${a.user._id}`).set(...auth(b.token));
    expect(res.status).toBe(403);
  });

  it('refuses a message to a player who turned direct messages off', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await User.updateOne({ _id: b.user._id }, { $set: { notifDm: false } });

    const res = await (await request())
      .post(`/api/messages/with/${b.user._id}`)
      .set(...auth(a.token))
      .send({ content: 'hi' });

    expect(res.status).toBe(403);
  });

  it('refuses messaging yourself', async () => {
    const a = await makeUser();
    const res = await (await request())
      .post(`/api/messages/with/${a.user._id}`)
      .set(...auth(a.token))
      .send({ content: 'hi' });

    expect(res.status).toBe(400);
  });
});

describe('player profile linking', () => {
  async function seedPlayer() {
    return Player.create({ nameEn: 'Magnus Carlsen', nameAr: 'ماغنوس كارلسن', title: 'GM' });
  }

  it('requires an admin approval before the link exists', async () => {
    const player = await seedPlayer();
    const { user, token } = await makeUser();
    const admin = await makeAdmin();
    const agent = await request();

    const requested = await agent
      .post('/api/links/request')
      .set(...auth(token))
      .send({ player_id: String(player._id), message: 'I am Magnus' });
    expect(requested.status).toBe(201);

    // Still unlinked while the request is pending.
    expect((await User.findById(user._id))?.linkedPlayerId).toBeNull();

    const approved = await agent
      .post(`/api/links/admin/requests/${requested.body.id}/approve`)
      .set(...auth(admin.token))
      .send({ admin_note: 'Verified by federation' });

    expect(approved.status).toBe(200);
    expect(String((await User.findById(user._id))?.linkedPlayerId)).toBe(String(player._id));
  });

  it('refuses a second pending request from the same user', async () => {
    const player = await seedPlayer();
    const other = await seedPlayer();
    const { token } = await makeUser();
    const agent = await request();

    await agent.post('/api/links/request').set(...auth(token)).send({ player_id: String(player._id) });
    const second = await agent
      .post('/api/links/request')
      .set(...auth(token))
      .send({ player_id: String(other._id) });

    expect(second.status).toBe(409);
  });

  it('will not link one profile to two accounts', async () => {
    const player = await seedPlayer();
    const first = await makeUser();
    const second = await makeUser();
    const admin = await makeAdmin();
    const agent = await request();

    await agent
      .post('/api/links/request')
      .set(...auth(first.token))
      .send({ player_id: String(player._id) });
    const firstRequest = await LinkRequest.findOne({ userId: first.user._id });
    await agent
      .post(`/api/links/admin/requests/${firstRequest?._id}/approve`)
      .set(...auth(admin.token));

    const blocked = await agent
      .post('/api/links/request')
      .set(...auth(second.token))
      .send({ player_id: String(player._id) });

    expect(blocked.status).toBe(409);
  });

  it('gives a linked user no write access to the profile', async () => {
    const player = await seedPlayer();
    const { user, token } = await makeUser();
    await User.updateOne({ _id: user._id }, { $set: { linkedPlayerId: player._id } });

    const res = await (await request())
      .put(`/api/players/${player._id}`)
      .set(...auth(token))
      .send({ name_en: 'Hacked', rating: 3000 });

    expect(res.status).toBe(403);
    expect((await Player.findById(player._id))?.nameEn).toBe('Magnus Carlsen');
  });

  it('lets an admin break a link', async () => {
    const player = await seedPlayer();
    const { user } = await makeUser();
    const admin = await makeAdmin();
    await User.updateOne({ _id: user._id }, { $set: { linkedPlayerId: player._id } });

    await (await request())
      .post(`/api/links/admin/users/${user._id}/unlink`)
      .set(...auth(admin.token));

    expect((await User.findById(user._id))?.linkedPlayerId).toBeNull();
  });
});

describe('admin moderation', () => {
  it('bans a player and locks them out immediately', async () => {
    const { user, token } = await makeUser();
    const admin = await makeAdmin();
    const agent = await request();

    await agent
      .post(`/api/links/admin/users/${user._id}/ban`)
      .set(...auth(admin.token))
      .send({ reason: 'Engine use' });

    const res = await agent.get('/api/users/auth/me').set(...auth(token));
    expect(res.status).toBe(403);
    expect(res.body.details.ban_reason).toBe('Engine use');
  });

  it('filters the user list by status and search', async () => {
    await makeUser({ username: 'cheater', isBanned: true });
    await makeUser({ username: 'honest' });
    const admin = await makeAdmin();
    const agent = await request();

    const banned = await agent
      .get('/api/links/admin/users?status=banned')
      .set(...auth(admin.token));
    const searched = await agent
      .get('/api/links/admin/users?search=hon')
      .set(...auth(admin.token));

    expect(banned.body.users.map((u: { username: string }) => u.username)).toEqual(['cheater']);
    expect(searched.body.users.map((u: { username: string }) => u.username)).toEqual(['honest']);
  });

  it('voids a finished game and reverses its rating effect', async () => {
    const { white, black, agent, gameId } = await startedGame();
    const admin = await makeAdmin();

    await agent.post(`/api/games/${gameId}/resign`).set(...auth(white.token));

    const afterLoss = await User.findById(white.user._id);
    expect(afterLoss?.onlineRating).toBeLessThan(1200);

    const voided = await agent
      .post(`/api/games/admin/games/${gameId}/void`)
      .set(...auth(admin.token))
      .send({ reason: 'Opponent was cheating' });

    expect(voided.status).toBe(200);
    expect(voided.body.voided).toBe(true);

    const restoredWhite = await User.findById(white.user._id);
    const restoredBlack = await User.findById(black.user._id);
    expect(restoredWhite?.onlineRating).toBe(1200);
    expect(restoredBlack?.onlineRating).toBe(1200);
    expect(restoredWhite?.gamesPlayed).toBe(0);
    expect(restoredWhite?.gamesLost).toBe(0);
  });

  it('refuses to void the same game twice', async () => {
    const { white, agent, gameId } = await startedGame();
    const admin = await makeAdmin();
    await agent.post(`/api/games/${gameId}/resign`).set(...auth(white.token));

    await agent.post(`/api/games/admin/games/${gameId}/void`).set(...auth(admin.token)).send({});
    const again = await agent
      .post(`/api/games/admin/games/${gameId}/void`)
      .set(...auth(admin.token))
      .send({});

    expect(again.status).toBe(400);
  });

  it('aborts a live game without touching ratings', async () => {
    const { white, agent, gameId } = await startedGame();
    const admin = await makeAdmin();

    const res = await agent
      .post(`/api/games/admin/games/${gameId}/abort`)
      .set(...auth(admin.token))
      .send({ reason: 'Server issue' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('aborted');
    // Aborting is not a void: the void marker stays clear.
    expect((await Game.findById(gameId))?.voidedAt).toBeNull();
    expect((await User.findById(white.user._id))?.onlineRating).toBe(1200);
  });

  it('soft-deletes a chat message and shows a placeholder', async () => {
    const { white, agent, gameId } = await startedGame();
    const admin = await makeAdmin();

    const posted = await agent
      .post(`/api/games/${gameId}/chat`)
      .set(...auth(white.token))
      .send({ content: 'something rude' });

    await agent
      .delete(`/api/games/admin/messages/${posted.body.id}`)
      .set(...auth(admin.token));

    const read = await agent.get(`/api/games/${gameId}/chat`);
    expect(read.body[0].content).toBe('[deleted by admin]');
    expect(read.body[0].is_deleted).toBe(true);
  });

  it('keeps every moderation route closed to players', async () => {
    const { token } = await makeUser();
    const agent = await request();

    for (const path of [
      '/api/games/admin/games',
      '/api/games/admin/messages',
      '/api/messages/admin/dms',
      '/api/links/admin/users',
      '/api/links/admin/requests',
    ]) {
      expect((await agent.get(path).set(...auth(token))).status).toBe(403);
      expect((await agent.get(path)).status).toBe(401);
    }
  });
});
