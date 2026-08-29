import { io } from "socket.io-client";
import { TOKEN_KEYS } from "./api";

/**
 * One shared Socket.IO connection for the whole app.
 *
 * This replaces the old polling loops: the server pushes a game's new state
 * the moment it changes, so a move reaches the opponent immediately instead of
 * up to 1.5 seconds later. Components still poll as a fallback, but slowly and
 * only while the socket is down — see `useLiveGame`.
 */
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: (callback) => callback({ token: localStorage.getItem(TOKEN_KEYS.user) || undefined }),
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

/** Re-handshake after a sign-in or sign-out so the identity is current. */
export function refreshSocketAuth() {
  if (!socket) return;
  socket.disconnect().connect();
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
