import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, closeDatabase, makeUser, request, resetDatabase } from '../helpers/app.js';
import { BlockedUser, Game, User } from '../../src/models/index.js';

beforeEach(resetDatabase);
afterAll(closeDatabase);

/** Two verified players and an open challenge already accepted. */
async function startedGame(options: { rated?: boolean; timeControl?: number; increment?: number } = {}) {
  const white = await makeUser({ username: 'whitey' });
  const black = await makeUser({ username: 'blacky' });
  const agent = await request();

  const created = await agent
    .post('/api/games')
    .set(...auth(white.token))
    .send({
      color: 'white',
      rated: options.rated ?? true,
      time_control_seconds: options.timeControl ?? 0,
      increment_seconds: options.increment ?? 0,
    });

  const accepted = await agent
    .post(`/api/games/${created.body.id}/accept`)
    .set(...auth(black.token));

  return { white, black, agent, gameId: created.body.id as string, game: accepted.body };
}

describe('challenges', () => {
  it('creates an open challenge and lists it in the lobby', async () => {
    const { token } = await makeUser();

    const created = await (await request())
      .post('/api/games')
      .set(...auth(token))
      .send({ color: 'white', rated: true, time_control_seconds: 300, increment_seconds: 3 });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('open');
    expect(created.body.white_user.id).toBeTruthy();

    const lobby = await (await request()).get('/api/games/lobby');
    expect(lobby.body).toHaveLength(1);
    expect(lobby.body[0].time_control_seconds).toBe(300);
  });

  it('refuses a second open challenge instead of silently returning the first', async () => {
    const { token } = await makeUser();
    const agent = await request();

    await agent.post('/api/games').set(...auth(token)).send({ time_control_seconds: 300 });
    const second = await agent
      .post('/api/games')
      .set(...auth(token))
      .send({ time_control_seconds: 600 });

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already have an open challenge/i);
  });

  it('will not let a player accept their own challenge', async () => {
    const { token } = await makeUser();
    const agent = await request();
    const created = await agent.post('/api/games').set(...auth(token)).send({});

    const res = await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(token));
    expect(res.status).toBe(400);
  });

  it('enforces the creator rating range', async () => {
    const strong = await makeUser({ onlineRating: 2000 });
    const weak = await makeUser({ onlineRating: 1000 });
    const agent = await request();

    const created = await agent
      .post('/api/games')
      .set(...auth(strong.token))
      .send({ min_opp_rating: 1800 });

    const res = await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(weak.token));
    expect(res.status).toBe(403);
  });

  it('hides challenges the viewer is excluded from', async () => {
    const strong = await makeUser({ onlineRating: 2000 });
    await (await request())
      .post('/api/games')
      .set(...auth(strong.token))
      .send({ min_opp_rating: 1800 });

    const visible = await (await request()).get('/api/games/lobby?viewer_rating=1000');
    const alsoVisible = await (await request()).get('/api/games/lobby?viewer_rating=1900');

    expect(visible.body).toHaveLength(0);
    expect(alsoVisible.body).toHaveLength(1);
  });

  it('refuses an accept between blocked players', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await BlockedUser.create({ blockerId: b.user._id, blockedId: a.user._id });

    const agent = await request();
    const created = await agent.post('/api/games').set(...auth(a.token)).send({});
    const res = await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(b.token));

    expect(res.status).toBe(403);
  });

  it('lets only one of two simultaneous accepts through', async () => {
    const creator = await makeUser();
    const first = await makeUser();
    const second = await makeUser();
    const agent = await request();

    const created = await agent.post('/api/games').set(...auth(creator.token)).send({});

    const [a, b] = await Promise.all([
      agent.post(`/api/games/${created.body.id}/accept`).set(...auth(first.token)),
      agent.post(`/api/games/${created.body.id}/accept`).set(...auth(second.token)),
    ]);

    const codes = [a.status, b.status].sort();
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBeGreaterThanOrEqual(400);

    const game = await Game.findById(created.body.id);
    expect(game?.status).toBe('active');
  });

  it('cancels an open challenge', async () => {
    const { token } = await makeUser();
    const agent = await request();
    const created = await agent.post('/api/games').set(...auth(token)).send({});

    const res = await agent.post(`/api/games/${created.body.id}/cancel`).set(...auth(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('aborted');
    expect((await (await request()).get('/api/games/lobby')).body).toHaveLength(0);
  });
});

describe('moves', () => {
  it('accepts a legal move and derives fen, pgn and move count', async () => {
    const { white, agent, gameId } = await startedGame();

    const res = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(white.token))
      .send({ move: 'e2e4' });

    expect(res.status).toBe(200);
    expect(res.body.moves).toBe('e2e4');
    expect(res.body.move_count).toBe(1);
    expect(res.body.turn).toBe('black');
    expect(res.body.pgn).toContain('1. e4');
    expect(res.body.fen).toContain(' b ');
  });

  it('rejects an illegal move', async () => {
    const { white, agent, gameId } = await startedGame();

    const res = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(white.token))
      .send({ move: 'e2e5' });

    expect(res.status).toBe(400);
    expect((await Game.findById(gameId))?.moveCount).toBe(0);
  });

  it('rejects a move made out of turn', async () => {
    const { black, agent, gameId } = await startedGame();

    const res = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(black.token))
      .send({ move: 'e7e5' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not your turn/i);
  });

  it('rejects a move from someone who is not playing', async () => {
    const { agent, gameId } = await startedGame();
    const stranger = await makeUser();

    const res = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(stranger.token))
      .send({ move: 'e2e4' });

    expect(res.status).toBe(403);
  });

  it('applies only one of two simultaneous moves', async () => {
    const { white, agent, gameId } = await startedGame();

    const [a, b] = await Promise.all([
      agent.post(`/api/games/${gameId}/move`).set(...auth(white.token)).send({ move: 'e2e4' }),
      agent.post(`/api/games/${gameId}/move`).set(...auth(white.token)).send({ move: 'd2d4' }),
    ]);

    const codes = [a.status, b.status].sort();
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBeGreaterThanOrEqual(400);
    expect((await Game.findById(gameId))?.moveCount).toBe(1);
  });

  it('ignores a tampered stored FEN because the move list governs', async () => {
    const { white, agent, gameId } = await startedGame();
    await agent.post(`/api/games/${gameId}/move`).set(...auth(white.token)).send({ move: 'e2e4' });

    // Rewrite the cached FEN to a position with a white queen on d8.
    await Game.updateOne(
      { _id: gameId },
      { $set: { fen: 'rnbQkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1' } },
    );

    const { black } = await startedGameParticipants(gameId);
    const res = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(black))
      .send({ move: 'e7e5' });

    // The replayed position is what counts, so the honest move still works and
    // the FEN is rewritten from the move list.
    expect(res.status).toBe(200);
    expect(res.body.fen).not.toContain('rnbQkbnr');
    expect(res.body.moves).toBe('e2e4 e7e5');
  });
});

/** Re-derive a participant token for a game created by `startedGame`. */
async function startedGameParticipants(gameId: string) {
  const game = await Game.findById(gameId);
  const { signToken } = await import('../../src/lib/jwt.js');
  return {
    white: signToken(String(game?.whiteUserId), 'user'),
    black: signToken(String(game?.blackUserId), 'user'),
  };
}

describe('finishing a game', () => {
  it('records checkmate and moves both ratings', async () => {
    const { white, black, agent, gameId } = await startedGame({ rated: true });

    // Fool's mate.
    for (const [token, move] of [
      [white.token, 'f2f3'],
      [black.token, 'e7e5'],
      [white.token, 'g2g4'],
      [black.token, 'd8h4'],
    ] as const) {
      await agent.post(`/api/games/${gameId}/move`).set(...auth(token)).send({ move });
    }

    const game = await Game.findById(gameId);
    expect(game?.status).toBe('black_wins');
    expect(game?.result).toBe('0-1');
    expect(game?.termination).toBe('checkmate');

    const whiteUser = await User.findById(white.user._id);
    const blackUser = await User.findById(black.user._id);
    expect(blackUser?.onlineRating).toBeGreaterThan(1200);
    expect(whiteUser?.onlineRating).toBeLessThan(1200);
    expect(whiteUser?.gamesPlayed).toBe(1);
    expect(whiteUser?.gamesLost).toBe(1);
    expect(blackUser?.gamesWon).toBe(1);
  });

  it('leaves ratings alone for a casual game but still counts it', async () => {
    const { white, black, agent, gameId } = await startedGame({ rated: false });

    for (const [token, move] of [
      [white.token, 'f2f3'],
      [black.token, 'e7e5'],
      [white.token, 'g2g4'],
      [black.token, 'd8h4'],
    ] as const) {
      await agent.post(`/api/games/${gameId}/move`).set(...auth(token)).send({ move });
    }

    const whiteUser = await User.findById(white.user._id);
    expect(whiteUser?.onlineRating).toBe(1200);
    expect(whiteUser?.gamesPlayed).toBe(1);
  });

  it('handles resignation', async () => {
    const { white, agent, gameId } = await startedGame();

    const res = await agent.post(`/api/games/${gameId}/resign`).set(...auth(white.token));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('black_wins');
    expect(res.body.termination).toBe('resignation');
  });

  it('never applies a result twice', async () => {
    const { white, agent, gameId } = await startedGame();

    await Promise.all([
      agent.post(`/api/games/${gameId}/resign`).set(...auth(white.token)),
      agent.post(`/api/games/${gameId}/resign`).set(...auth(white.token)),
    ]);

    const whiteUser = await User.findById(white.user._id);
    expect(whiteUser?.gamesPlayed).toBe(1);
    expect(whiteUser?.gamesLost).toBe(1);
  });

  it('refuses moves after the game has ended', async () => {
    const { white, agent, gameId } = await startedGame();
    await agent.post(`/api/games/${gameId}/resign`).set(...auth(white.token));

    const res = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(white.token))
      .send({ move: 'e2e4' });

    expect(res.status).toBe(400);
  });
});

describe('draw offers', () => {
  it('bumps the version so the opponent notices the offer', async () => {
    const { white, black, agent, gameId } = await startedGame();
    const before = (await agent.get(`/api/games/${gameId}`)).body.version;

    const offered = await agent.post(`/api/games/${gameId}/draw-offer`).set(...auth(white.token));

    // The Flask version derived `version` from the move count alone, so an
    // offer was invisible to a polling client until a move was played.
    expect(offered.body.version).toBeGreaterThan(before);
    expect(offered.body.draw_offer_by).toBe(String(white.user._id));

    const accepted = await agent.post(`/api/games/${gameId}/draw-accept`).set(...auth(black.token));
    expect(accepted.body.status).toBe('draw');
    expect(accepted.body.termination).toBe('agreement');
  });

  it('will not let the offering player accept their own offer', async () => {
    const { white, agent, gameId } = await startedGame();
    await agent.post(`/api/games/${gameId}/draw-offer`).set(...auth(white.token));

    const res = await agent.post(`/api/games/${gameId}/draw-accept`).set(...auth(white.token));
    expect(res.status).toBe(400);
  });

  it('declines an offer and bumps the version', async () => {
    const { white, black, agent, gameId } = await startedGame();
    const offered = await agent.post(`/api/games/${gameId}/draw-offer`).set(...auth(white.token));

    const declined = await agent.post(`/api/games/${gameId}/draw-decline`).set(...auth(black.token));

    expect(declined.body.draw_offer_by).toBeNull();
    expect(declined.body.version).toBeGreaterThan(offered.body.version);
  });

  it('clears a pending offer when a move is played', async () => {
    const { white, black, agent, gameId } = await startedGame();
    await agent.post(`/api/games/${gameId}/draw-offer`).set(...auth(black.token));

    const moved = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(white.token))
      .send({ move: 'e2e4' });

    expect(moved.body.draw_offer_by).toBeNull();
  });
});

describe('clocks', () => {
  it('deducts thinking time and adds the increment', async () => {
    const { white, agent, gameId } = await startedGame({ timeControl: 60, increment: 5 });

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const res = await agent
      .post(`/api/games/${gameId}/move`)
      .set(...auth(white.token))
      .send({ move: 'e2e4' });

    // Roughly one second gone, five added.
    expect(res.body.white_time_remaining).toBeGreaterThan(63);
    expect(res.body.white_time_remaining).toBeLessThan(64.5);
    // Black's clock has already started, so it is a hair under its budget.
    expect(res.body.black_time_remaining).toBeGreaterThan(59.8);
    expect(res.body.black_time_remaining).toBeLessThanOrEqual(60);
  });

  it('counts down for the side to move even without a request', async () => {
    const { agent, gameId } = await startedGame({ timeControl: 60 });

    const first = (await agent.get(`/api/games/${gameId}`)).body.white_time_remaining;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = (await agent.get(`/api/games/${gameId}`)).body.white_time_remaining;

    expect(second).toBeLessThan(first);
  });

  it('awards the game when a flag falls', async () => {
    const { agent, gameId } = await startedGame({ timeControl: 60 });
    // Backdate the last move past white's whole budget.
    await Game.updateOne(
      { _id: gameId },
      { $set: { lastMoveAt: new Date(Date.now() - 61_000), startedAt: new Date(Date.now() - 61_000) } },
    );

    const res = await agent.get(`/api/games/${gameId}`);

    expect(res.body.status).toBe('black_wins');
    expect(res.body.termination).toBe('timeout');
  });

  it('is a draw when the player left on the clock cannot mate', async () => {
    const { agent, gameId } = await startedGame({ timeControl: 60 });
    // Black has a lone king, so running white out of time cannot be a win.
    await Game.updateOne(
      { _id: gameId },
      {
        $set: {
          fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 40',
          moves: '',
          lastMoveAt: new Date(Date.now() - 61_000),
        },
      },
    );

    const res = await agent.get(`/api/games/${gameId}`);

    expect(res.body.status).toBe('draw');
    expect(res.body.termination).toBe('timeout');
  });

  it('rejects a time claim while the opponent still has time', async () => {
    const { white, agent, gameId } = await startedGame({ timeControl: 600 });

    const res = await agent.post(`/api/games/${gameId}/claim-time`).set(...auth(white.token));
    expect(res.status).toBe(400);
  });
});

describe('spectating', () => {
  it('serves a game to an anonymous visitor', async () => {
    const { gameId, agent } = await startedGame();

    const res = await agent.get(`/api/games/${gameId}`);

    expect(res.status).toBe(200);
    expect(res.body.white_user.username).toBe('whitey');
    // No private detail leaks to a spectator.
    expect(res.body.white_user).not.toHaveProperty('email');
  });

  it('lists live games', async () => {
    await startedGame();
    const res = await (await request()).get('/api/games/live');

    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('active');
  });

  it('includes a server timestamp so clients can correct for clock skew', async () => {
    const { gameId, agent } = await startedGame({ timeControl: 300 });
    const res = await agent.get(`/api/games/${gameId}`);

    expect(Date.parse(res.body.server_time)).toBeGreaterThan(0);
  });
});

describe('leaderboard', () => {
  it('ranks by rating and excludes players with no games', async () => {
    await makeUser({ username: 'strong', onlineRating: 2000, gamesPlayed: 30 });
    await makeUser({ username: 'weak', onlineRating: 1100, gamesPlayed: 5 });
    await makeUser({ username: 'newcomer', onlineRating: 1500, gamesPlayed: 0 });

    const res = await (await request()).get('/api/games/leaderboard');

    expect(res.body.map((u: { username: string }) => u.username)).toEqual(['strong', 'weak']);
    expect(res.body[0].is_provisional).toBe(false);
    expect(res.body[1].is_provisional).toBe(true);
  });
});
