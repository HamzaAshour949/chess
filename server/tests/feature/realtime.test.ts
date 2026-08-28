import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as SocketServer } from 'socket.io';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { closeRealtime, createRealtime } from '../../src/realtime/io.js';
import { auth, closeDatabase, makeUser, resetDatabase } from '../helpers/app.js';
import { connectDatabase } from '../../src/db/mongoose.js';

let httpServer: HttpServer;
let socketServer: SocketServer;
let port: number;
const clients: ClientSocket[] = [];

beforeEach(async () => {
  await connectDatabase();
  await resetDatabase();

  httpServer = createServer(createApp());
  socketServer = createRealtime(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await closeRealtime(socketServer);
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

afterAll(closeDatabase);

function client(token?: string): ClientSocket {
  const socket = connectClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    ...(token ? { auth: { token } } : {}),
  });
  clients.push(socket);
  return socket;
}

/** Resolve on the next occurrence of `event`, or reject after `timeout`. */
function once<T = unknown>(socket: ClientSocket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeout);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

describe('realtime game updates', () => {
  it('pushes a move to a watching spectator without polling', async () => {
    const agent = supertest(httpServer);
    const white = await makeUser({ username: 'whitey' });
    const black = await makeUser({ username: 'blacky' });

    const created = await agent
      .post('/api/games')
      .set(...auth(white.token))
      .send({ color: 'white' });
    await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(black.token));

    // An anonymous spectator subscribes to the board.
    const spectator = client();
    await connected(spectator);
    spectator.emit('game:watch', created.body.id);
    // Give the join a moment to land before the move is published.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const update = once<Record<string, unknown>>(spectator, 'game:update');
    await agent
      .post(`/api/games/${created.body.id}/move`)
      .set(...auth(white.token))
      .send({ move: 'e2e4' });

    const payload = await update;
    expect(payload.moves).toBe('e2e4');
    expect(payload.move_count).toBe(1);
    expect(payload.last_move).toEqual({ san: 'e4', uci: 'e2e4' });
  });

  it('does not push updates for a board the client is not watching', async () => {
    const agent = supertest(httpServer);
    const white = await makeUser();
    const black = await makeUser();

    const created = await agent.post('/api/games').set(...auth(white.token)).send({ color: 'white' });
    await agent.post(`/api/games/${created.body.id}/accept`).set(...auth(black.token));

    const bystander = client();
    await connected(bystander);

    let received = false;
    bystander.on('game:update', () => {
      received = true;
    });

    await agent
      .post(`/api/games/${created.body.id}/move`)
      .set(...auth(white.token))
      .send({ move: 'e2e4' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(received).toBe(false);
  });

  it('announces a new challenge to the lobby', async () => {
    const agent = supertest(httpServer);
    const creator = await makeUser();

    const watcher = client();
    await connected(watcher);
    watcher.emit('lobby:watch');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const update = once<Record<string, unknown>>(watcher, 'lobby:update');
    await agent
      .post('/api/games')
      .set(...auth(creator.token))
      .send({ color: 'white', time_control_seconds: 180 });

    const payload = await update;
    expect(payload.status).toBe('open');
    expect(payload.time_control_seconds).toBe(180);
  });

  it('accepts an anonymous connection but joins it to no user room', async () => {
    const anonymous = client();
    await expect(connected(anonymous)).resolves.toBeUndefined();
    expect(anonymous.connected).toBe(true);
  });

  it('ignores a malformed game id in a watch request', async () => {
    const socket = client();
    await connected(socket);

    socket.emit('game:watch', { $ne: null });
    socket.emit('game:watch', '../../etc/passwd');
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Still connected and serving; nothing crashed the server.
    expect(socket.connected).toBe(true);
  });

  it('connects with a valid player token', async () => {
    const { token } = await makeUser();
    const socket = client(token);
    await expect(connected(socket)).resolves.toBeUndefined();
  });

  it('still connects when the token is garbage, just unidentified', async () => {
    const socket = client('not.a.real.token');
    await expect(connected(socket)).resolves.toBeUndefined();
  });
});
