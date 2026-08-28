import type { GameDoc } from '../models/index.js';

/**
 * Publishing seam between the HTTP routes and Socket.IO.
 *
 * Routes call these functions without importing the socket server, which keeps
 * the dependency one-way (realtime -> routes, never back) and makes every
 * publish a no-op in tests, where no socket server is running.
 */
export interface RealtimeEmitter {
  gameUpdated(game: GameDoc, extra?: MoveInfo): void;
  lobbyChanged(game: GameDoc): void;
  gameMessage(gameId: string, message: unknown): void;
  directMessage(recipientId: string, message: unknown): void;
  notifyUser(userId: string, event: string, payload: unknown): void;
}

export interface MoveInfo {
  san: string;
  uci: string;
}

let emitter: RealtimeEmitter | null = null;

export function setEmitter(next: RealtimeEmitter | null): void {
  emitter = next;
}

/**
 * Push a game's new state to everyone watching it.
 *
 * `channel` of "lobby" also refreshes the lobby list, for the transitions that
 * change what is on offer: created, cancelled, accepted.
 */
export function publishGame(game: GameDoc, channel?: 'lobby', move?: MoveInfo): void {
  emitter?.gameUpdated(game, move);
  if (channel === 'lobby') emitter?.lobbyChanged(game);
}

export function publishGameMessage(gameId: string, message: unknown): void {
  emitter?.gameMessage(gameId, message);
}

export function publishDirectMessage(recipientId: string, message: unknown): void {
  emitter?.directMessage(recipientId, message);
}

export function notifyUser(userId: string, event: string, payload: unknown): void {
  emitter?.notifyUser(userId, event, payload);
}
