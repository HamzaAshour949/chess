import { io } from "socket.io-client";
import { TOKEN_KEYS } from "./api";

// Empty in production builds (same origin); the API origin under `vite dev`.
const ORIGIN = typeof __SOCKET_ORIGIN__ === "string" && __SOCKET_ORIGIN__ ? __SOCKET_ORIGIN__ : undefined;

/**
 * One shared Socket.IO connection for the whole app.
 *
 * The server pushes a game's new state the moment it changes, so a move
 * reaches the opponent immediately. Components still poll as a fallback, but
 * slowly while connected and quickly only while the socket is down — see
 * `useLiveGame`.
 */
let socket = null;

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEYS.user) || undefined;
  } catch {
    return undefined;
  }
}

export function getSocket() {
  if (!socket) {
    socket = io(ORIGIN, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: (callback) => callback({ token: readToken() }),
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
