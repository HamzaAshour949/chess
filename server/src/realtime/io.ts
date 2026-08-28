import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { bearerFrom, verifyToken } from '../lib/jwt.js';
import { serializeGame } from '../lib/serializers.js';
import type { GameDoc } from '../models/index.js';
import { setEmitter, type MoveInfo, type RealtimeEmitter } from './publish.js';

/** Rooms. A socket may be in many game rooms plus the lobby. */
const gameRoom = (id: string) => `game:${id}`;
const userRoom = (id: string) => `user:${id}`;
const LOBBY = 'lobby';

/** Watching too many boards at once is the cheap way to fan out load. */
const MAX_WATCHED_GAMES = 12;

interface SocketState {
  userId?: string;
  watched: Set<string>;
}

const state = new WeakMap<Socket, SocketState>();

function stateOf(socket: Socket): SocketState {
  let existing = state.get(socket);
  if (!existing) {
    existing = { watched: new Set() };
    state.set(socket, existing);
  }
  return existing;
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

/**
 * Attach the realtime layer to an HTTP server.
 *
 * Replaces the SPA's 1.5s polling loop: a move reaches the opponent as soon as
 * the server has it, and an idle board costs nothing. The REST endpoints stay
 * authoritative and complete, so a client that cannot hold a socket open still
 * works by polling.
 */
export function createRealtime(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    path: '/socket.io',
    serveClient: false,
    // Same-origin by default, matching the HTTP CORS policy.
    cors: env.CORS_ORIGINS.length ? { origin: env.CORS_ORIGINS, credentials: true } : undefined,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    // Spectator payloads are small; compression costs more than it saves.
    perMessageDeflate: false,
  });

  // Identify the socket if it presents a player token. Anonymous sockets are
  // allowed — spectating is public — they simply join no user room.
  io.use((socket, next) => {
    const raw =
      (socket.handshake.auth?.token as string | undefined) ??
      bearerFrom(socket.handshake.headers.authorization);

    if (raw) {
      const payload = verifyToken(raw);
      if (payload?.role === 'user') {
        stateOf(socket).userId = payload.sub;
        void socket.join(userRoom(payload.sub));
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    const own = stateOf(socket);
    logger.debug({ socketId: socket.id, userId: own.userId }, 'Socket connected');

    socket.on('game:watch', (gameId: unknown) => {
      if (!isObjectId(gameId)) return;
      if (own.watched.size >= MAX_WATCHED_GAMES) return;
      own.watched.add(gameId);
      void socket.join(gameRoom(gameId));
    });

    socket.on('game:unwatch', (gameId: unknown) => {
      if (!isObjectId(gameId)) return;
      own.watched.delete(gameId);
      void socket.leave(gameRoom(gameId));
    });

    socket.on('lobby:watch', () => void socket.join(LOBBY));
    socket.on('lobby:unwatch', () => void socket.leave(LOBBY));

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Socket disconnected');
      state.delete(socket);
    });
  });

  const emitter: RealtimeEmitter = {
    gameUpdated(game: GameDoc, move?: MoveInfo) {
      const payload = serializeGame(game);
      io.to(gameRoom(String(game._id))).emit('game:update', move ? { ...payload, last_move: move } : payload);
    },
    lobbyChanged(game: GameDoc) {
      io.to(LOBBY).emit('lobby:update', serializeGame(game));
    },
    gameMessage(gameId, message) {
      io.to(gameRoom(gameId)).emit('game:chat', message);
    },
    directMessage(recipientId, message) {
      io.to(userRoom(recipientId)).emit('dm:new', message);
    },
    notifyUser(userId, event, payload) {
      io.to(userRoom(userId)).emit(event, payload);
    },
  };

  setEmitter(emitter);
  return io;
}

export async function closeRealtime(io: SocketServer): Promise<void> {
  setEmitter(null);
  await new Promise<void>((resolve) => io.close(() => resolve()));
}
