import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { auth, closeDatabase, makeUser, request, resetDatabase } from '../helpers/app.js';
import { BlockedUser, Game, GameMessage, User } from '../../src/models/index.js';

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

describe('direct challenges', () => {
  it('reaches only the invited player and never the lobby', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const c = await makeUser();
    const agent = await request();

    const created = await agent
      .post('/api/games')
      .set(...auth(a.token))
      .send({ opponent_id: String(b.user._id), time_control_seconds: 300 });

    expect(created.status).toBe(201);
    expect(created.body.invited_user_id).toBe(String(b.user._id));
    expect((await agent.get('/api/games/lobby')).body).toHaveLength(0);

    const intruder = await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(c.token));
    expect(intruder.status).toBe(403);

    const incoming = await agent.get('/api/games/me/challenges').set(...auth(b.token));
    expect(incoming.body.incoming).toHaveLength(1);

    const accepted = await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(b.token));
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('active');
  });

  it('lets the invited player decline', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agent = await request();
    const created = await agent
      .post('/api/games')
      .set(...auth(a.token))
      .send({ opponent_id: String(b.user._id) });

    const declined = await agent.post(`/api/games/${created.body.id}/decline`).set(...auth(b.token));

    expect(declined.status).toBe(200);
    expect(declined.body.status).toBe('aborted');
    expect(declined.body.termination).toBe('declined');
  });

  it('allows a lobby seek and an invitation at the same time, but one invitation per player', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agent = await request();

    const seek = await agent.post('/api/games').set(...auth(a.token)).send({});
    const invite = await agent
      .post('/api/games')
      .set(...auth(a.token))
      .send({ opponent_id: String(b.user._id) });
    const again = await agent
      .post('/api/games')
      .set(...auth(a.token))
      .send({ opponent_id: String(b.user._id) });

    expect(seek.status).toBe(201);
    expect(invite.status).toBe(201);
    expect(again.status).toBe(409);
  });

  it('refuses to challenge a player who blocked you', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await BlockedUser.create({ blockerId: b.user._id, blockedId: a.user._id });

    const res = await (await request())
      .post('/api/games')
      .set(...auth(a.token))
      .send({ opponent_id: String(b.user._id) });

    expect(res.status).toBe(403);
  });

  it('withdraws the acceptor’s own seek once their game starts', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agent = await request();

    const aSeek = await agent.post('/api/games').set(...auth(a.token)).send({});
    const bSeek = await agent.post('/api/games').set(...auth(b.token)).send({});
    await agent.post(`/api/games/${aSeek.body.id}/accept`).set(...auth(b.token));

    const leftover = await Game.findById(bSeek.body.id);
    expect(leftover?.status).toBe('aborted');
    expect(leftover?.termination).toBe('cancelled');
    expect((await agent.get('/api/games/lobby')).body).toHaveLength(0);
  });
});

describe('quick pairing', () => {
  it('posts a seek when nobody is waiting, and pairs the next player into it', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const agent = await request();

    const first = await agent
      .post('/api/games/quick')
      .set(...auth(a.token))
      .send({ time_control_seconds: 300, increment_seconds: 3 });
    expect(first.status).toBe(201);
    expect(first.body.matched).toBe(false);
    expect(first.body.game.status).toBe('open');

    const second = await agent
      .post('/api/games/quick')
      .set(...auth(b.token))
      .send({ time_control_seconds: 300, increment_seconds: 3 });
    expect(second.body.matched).toBe(true);
    expect(second.body.game.id).toBe(first.body.game.id);
    expect(second.body.game.status).toBe('active');
  });

  it('keeps an identical seek instead of posting a duplicate', async () => {
    const a = await makeUser();
    const agent = await request();
    const body = { time_control_seconds: 180, increment_seconds: 2 };

    const first = await agent.post('/api/games/quick').set(...auth(a.token)).send(body);
    const second = await agent.post('/api/games/quick').set(...auth(a.token)).send(body);

    expect(second.body.game.id).toBe(first.body.game.id);
  });

  it('does not pair blocked players', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await BlockedUser.create({ blockerId: a.user._id, blockedId: b.user._id });
    const agent = await request();
    const body = { time_control_seconds: 60 };

    await agent.post('/api/games/quick').set(...auth(a.token)).send(body);
    const res = await agent.post('/api/games/quick').set(...auth(b.token)).send(body);

    expect(res.body.matched).toBe(false);
    expect(await Game.countDocuments({ status: 'open' })).toBe(2);
  });
});

describe('rematch', () => {
  it('offers the same settings with colours swapped, and starts when both ask', async () => {
    const { white, black, agent, gameId } = await startedGame();
    await agent.post(`/api/games/${gameId}/resign`).set(...auth(white.token));

    const offer = await agent.post(`/api/games/${gameId}/rematch`).set(...auth(white.token));
    expect(offer.status).toBe(201);
    expect(offer.body.status).toBe('open');
    expect(offer.body.invited_user_id).toBe(String(black.user._id));
    expect(offer.body.creator_color).toBe('black');
    expect(offer.body.rematch_of_game_id).toBe(gameId);

    const accepted = await agent.post(`/api/games/${gameId}/rematch`).set(...auth(black.token));
    expect(accepted.body.id).toBe(offer.body.id);
    expect(accepted.body.status).toBe('active');
    expect(accepted.body.white_user.id).toBe(String(black.user._id));
  });

  it('is only available once the game is over', async () => {
    const { white, agent, gameId } = await startedGame();
    const res = await agent.post(`/api/games/${gameId}/rematch`).set(...auth(white.token));
    expect(res.status).toBe(400);
  });
});

describe('draw offers between moves', () => {
  it('treats a counter-offer as agreement', async () => {
    const { white, black, agent, gameId } = await startedGame();
    await agent.post(`/api/games/${gameId}/draw-offer`).set(...auth(white.token));

    const res = await agent.post(`/api/games/${gameId}/draw-offer`).set(...auth(black.token));

    expect(res.body.status).toBe('draw');
    expect(res.body.termination).toBe('agreement');
  });

  it('keeps your own offer standing when you move', async () => {
    const { white, agent, gameId } = await startedGame();
    await agent.post(`/api/games/${gameId}/draw-offer`).set(...auth(white.token));

    const moved = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(white.token))
      .send({ move: 'e2e4' });

    expect(moved.body.draw_offer_by).toBe(String(white.user._id));
  });
});

describe('game records', () => {
  it('exports a finished game as a PGN file', async () => {
    const { white, black, agent, gameId } = await startedGame();
    for (const [token, move] of [
      [white.token, 'f2f3'],
      [black.token, 'e7e5'],
      [white.token, 'g2g4'],
      [black.token, 'd8h4'],
    ] as const) {
      await agent.post(`/api/games/${gameId}/move`).set(...auth(token)).send({ move });
    }

    const res = await agent.get(`/api/games/${gameId}/pgn`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-chess-pgn');
    expect(res.headers['content-disposition']).toContain(`chesshub-${gameId}.pgn`);
    const text = res.text;
    expect(text).toContain('[White "whitey"]');
    expect(text).toContain('[Black "blacky"]');
    expect(text).toContain('[Result "0-1"]');
    expect(text).toContain('1. f3 e5 2. g4 Qh4# 0-1');
  });

  it('pages my games', async () => {
    const { white, agent } = await startedGame();
    const res = await agent.get('/api/games/me/games?per_page=1').set(...auth(white.token));

    expect(res.body.games).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });
});

describe('game chat', () => {
  it('serves the newest messages when the history is long', async () => {
    const { white, gameId, agent } = await startedGame();
    await GameMessage.insertMany(
      Array.from({ length: 250 }, (_, i) => ({
        gameId,
        userId: white.user._id,
        content: `line ${i}`,
        createdAt: new Date(Date.now() - (250 - i) * 1000),
      })),
    );

    const res = await agent.get(`/api/games/${gameId}/chat`);

    expect(res.body).toHaveLength(200);
    expect(res.body.at(-1).content).toBe('line 249');
    expect(res.body[0].content).toBe('line 50');
  });

  it('respects a player who turned game chat off', async () => {
    const { white, black, agent, gameId } = await startedGame();
    await User.updateOne({ _id: black.user._id }, { $set: { notifGameChat: false } });

    const res = await agent
      .post(`/api/games/${gameId}/chat`)
      .set(...auth(white.token))
      .send({ content: 'good luck' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/opponent/i);
  });
});
