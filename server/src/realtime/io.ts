import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { bearerFrom, verifyToken } from '../lib/jwt.js';
import { serializeGame } from '../lib/serializers.js';
import { User, type GameDoc } from '../models/index.js';
import { tokenStillValid } from '../middleware/auth.js';
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
    maxHttpBufferSize: 16 * 1024,
  });

  /** Connected sockets per user, for "online now" indicators. */
  const presence = new Map<string, number>();

  // Identify the socket if it presents a player token. Anonymous sockets are
  // allowed — spectating is public — they simply join no user room. The
  // account is checked like any authenticated request: a banned, deleted or
  // signed-out-everywhere account gets no personal channel.
  io.use((socket, next) => {
    const handshakeToken = socket.handshake.auth?.token;
    const raw =
      (typeof handshakeToken === 'string' ? handshakeToken : null) ??
      bearerFrom(socket.handshake.headers.authorization);
    const payload = raw ? verifyToken(raw) : null;
    if (payload?.role !== 'user') {
      next();
      return;
    }

    User.findById(payload.sub)
      .select('isBanned isVerified deletedAt tokenVersion')
      .lean()
      .then((user) => {
        if (user && !user.isBanned && user.isVerified && tokenStillValid(user, payload.ver)) {
          stateOf(socket).userId = payload.sub;
          void socket.join(userRoom(payload.sub));
        }
        next();
      })
      .catch((error: unknown) => {
        logger.warn({ err: error }, 'Socket identity lookup failed; continuing anonymously');
        next();
      });
  });

  io.on('connection', (socket) => {
    const own = stateOf(socket);
    if (own.userId) presence.set(own.userId, (presence.get(own.userId) ?? 0) + 1);
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
      if (own.userId) {
        const left = (presence.get(own.userId) ?? 1) - 1;
        if (left > 0) presence.set(own.userId, left);
        else presence.delete(own.userId);
      }
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
    disconnectUser(userId) {
      io.in(userRoom(userId)).disconnectSockets(true);
    },
    isOnline(userId) {
      return (presence.get(userId) ?? 0) > 0;
    },
  };

  setEmitter(emitter);
  return io;
}

/**
 * Close every socket and the HTTP server underneath them.
 *
 * Socket.IO's `close()` also closes the HTTP server and waits for its
 * callback. Under Bun an upgraded WebSocket connection still counts as open
 * after Socket.IO has closed it, and that callback only fires if the leftover
 * connections are dropped in the same tick — later, the server stops
 * listening but the callback is never called. So this does not depend on it:
 *
 *  - `graceMs` 0 (tests): drop every connection at once; the callback fires.
 *  - otherwise (shutdown): in-flight requests get `graceMs` to finish, then
 *    whatever is left is dropped and the close counts as done either way.
 *    Under Node the callback usually arrives first and ends the wait early.
 */
export async function closeRealtime(
  io: SocketServer,
  httpServer?: HttpServer,
  graceMs = 0,
): Promise<void> {
  setEmitter(null);
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      httpServer?.closeAllConnections();
      finish();
    }, graceMs);

    io.close(() => finish());
    if (graceMs === 0) httpServer?.closeAllConnections();
  });
}
