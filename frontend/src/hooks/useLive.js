import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api";
import { getSocket } from "../realtime";

/** True while the shared socket is connected, so callers can fall back. */
export function useSocketStatus() {
  const [connected, setConnected] = useState(() => getSocket().connected);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return connected;
}

/**
 * Live state for one game.
 *
 * The socket is the primary channel; the poll is a safety net that runs slowly
 * while connected (30s, to catch a missed frame) and quickly while not (2s).
 * Updates are accepted only when the server's `version` is newer, so an
 * out-of-order socket frame and a slow poll response can never move the board
 * backwards.
 */
export function useLiveGame(gameId) {
  const [game, setGame] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const versionRef = useRef(-1);
  const connected = useSocketStatus();

  const accept = useCallback((next, move) => {
    if (!next) return;
    if (typeof next.version === "number" && next.version < versionRef.current) return;
    versionRef.current = next.version ?? versionRef.current;
    setGame(next);
    if (move) setLastMove(move);
  }, []);

  const fetchGame = useCallback(async () => {
    try {
      const res = await api.get(`/games/${gameId}`);
      accept(res.data);
    } catch {
      // Transient failure; the next tick retries.
    }
  }, [gameId, accept]);

  useEffect(() => {
    if (!gameId) return undefined;
    versionRef.current = -1;
    fetchGame();

    const socket = getSocket();
    socket.emit("game:watch", gameId);

    const onUpdate = (payload) => accept(payload, payload?.last_move);
    socket.on("game:update", onUpdate);
    // A reconnect may have missed frames, so resync on the way back up.
    socket.on("connect", fetchGame);

    return () => {
      socket.emit("game:unwatch", gameId);
      socket.off("game:update", onUpdate);
      socket.off("connect", fetchGame);
    };
  }, [gameId, accept, fetchGame]);

  useEffect(() => {
    const interval = setInterval(fetchGame, connected ? 30_000 : 2_000);
    return () => clearInterval(interval);
  }, [fetchGame, connected]);

  return { game, setGame: accept, lastMove, refresh: fetchGame, connected };
}

/** Live in-game chat: pushed on arrival, with one fetch to prime the history. */
export function useLiveChat(gameId) {
  const [messages, setMessages] = useState([]);
  const connected = useSocketStatus();

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/games/${gameId}/chat`);
      setMessages(res.data || []);
    } catch {
      /* keep whatever is already on screen */
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return undefined;
    load();

    const socket = getSocket();
    const onMessage = (message) => {
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message]
      );
    };
    socket.on("game:chat", onMessage);
    socket.on("connect", load);

    return () => {
      socket.off("game:chat", onMessage);
      socket.off("connect", load);
    };
  }, [gameId, load]);

  // Only poll when the push channel is unavailable.
  useEffect(() => {
    if (connected) return undefined;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [connected, load]);

  return { messages, reload: load };
}

/** Live lobby listing. Any challenge change re-fetches the filtered list. */
export function useLiveLobby(load) {
  const connected = useSocketStatus();
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const socket = getSocket();
    socket.emit("lobby:watch");

    const refresh = () => loadRef.current?.();
    socket.on("lobby:update", refresh);
    socket.on("connect", refresh);

    return () => {
      socket.emit("lobby:unwatch");
      socket.off("lobby:update", refresh);
      socket.off("connect", refresh);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadRef.current?.(), connected ? 20_000 : 4_000);
    return () => clearInterval(interval);
  }, [connected]);
}

/**
 * A clock that ticks locally between server updates.
 *
 * `server_time` in the response is the correction for the client's own clock
 * being wrong: the offset is measured once per update rather than assuming the
 * two machines agree, which is what the old code did when it appended "Z" to a
 * naive timestamp and diffed against Date.now().
 */
export function useTickingClocks(game) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!game || game.status !== "active" || !game.time_control_seconds) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [game?.status, game?.time_control_seconds, game]);

  if (!game || game.white_time_remaining == null) return { white: null, black: null };

  let white = game.white_time_remaining;
  let black = game.black_time_remaining;

  if (game.status === "active" && game.server_time) {
    const elapsed = (now - Date.parse(game.server_time)) / 1000;
    if (elapsed > 0) {
      if (game.turn === "white") white = Math.max(0, white - elapsed);
      else black = Math.max(0, black - elapsed);
    }
  }

  return { white, black };
}
