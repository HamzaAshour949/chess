import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import api from "../api";
import { getSocket } from "../realtime";

/**
 * True while the shared socket is connected, so callers can fall back.
 *
 * The socket is an external store, so it is read through useSyncExternalStore
 * rather than mirrored into state by an effect — that avoids a render pass on
 * mount and cannot miss a connect that lands between render and subscribe.
 */
function subscribeToSocket(onChange) {
  const socket = getSocket();
  socket.on("connect", onChange);
  socket.on("disconnect", onChange);
  return () => {
    socket.off("connect", onChange);
    socket.off("disconnect", onChange);
  };
}

export function useSocketStatus() {
  return useSyncExternalStore(
    subscribeToSocket,
    () => getSocket().connected,
    () => false, // server-render / first paint: assume disconnected
  );
}

/**
 * Stamp a game payload with the local time it arrived, and the offset between
 * the server's clock and ours.
 *
 * Clocks tick from the arrival time, so a device whose own clock is wrong
 * still counts correctly; the offset lets absolute deadlines (the first-move
 * timer) be read in server time.
 */
function stamp(game) {
  const receivedAt = Date.now();
  const serverNow = game?.server_time ? Date.parse(game.server_time) : receivedAt;
  return { ...game, _receivedAt: receivedAt, _skew: serverNow - receivedAt };
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
  // Stored against the game it belongs to, so opening another game never
  // shows the previous one's board, even for a frame.
  const [state, setState] = useState({ id: null, game: null, lastMove: null, notFound: false });
  const versionRef = useRef({ id: null, version: -1 });
  const connected = useSocketStatus();

  const accept = useCallback(
    (next, move) => {
      if (!next || next.id !== gameId) return;
      const seen = versionRef.current.id === gameId ? versionRef.current.version : -1;
      if (typeof next.version === "number" && next.version < seen) return;
      versionRef.current = { id: gameId, version: next.version ?? seen };
      setState((current) => ({
        id: gameId,
        game: stamp(next),
        lastMove: move ?? (current.id === gameId ? current.lastMove : null),
        notFound: false,
      }));
    },
    [gameId],
  );

  const fetchGame = useCallback(
    () =>
      api
        .get(`/games/${gameId}`)
        .then((res) => accept(res.data))
        .catch((error) => {
          const status = error.response?.status;
          if (status === 404 || status === 422 || status === 400) {
            setState({ id: gameId, game: null, lastMove: null, notFound: true });
          }
          // Otherwise transient; the next tick retries.
        }),
    [gameId, accept],
  );

  useEffect(() => {
    if (!gameId) return undefined;
    fetchGame();

    const socket = getSocket();
    const watch = () => socket.emit("game:watch", gameId);
    watch();

    const onUpdate = (payload) => accept(payload, payload?.last_move);
    socket.on("game:update", onUpdate);
    // A reconnect may have missed frames, and the room membership is gone:
    // rejoin and resync on the way back up.
    const onConnect = () => {
      watch();
      void fetchGame();
    };
    socket.on("connect", onConnect);

    return () => {
      socket.emit("game:unwatch", gameId);
      socket.off("game:update", onUpdate);
      socket.off("connect", onConnect);
    };
  }, [gameId, accept, fetchGame]);

  const current = state.id === gameId;
  const game = current ? state.game : null;
  const live = game && (game.status === "active" || game.status === "open");
  useEffect(() => {
    if (!live) return undefined;
    const interval = setInterval(fetchGame, connected ? 30_000 : 2_000);
    return () => clearInterval(interval);
  }, [fetchGame, connected, live]);

  return {
    game,
    setGame: accept,
    lastMove: current ? state.lastMove : null,
    refresh: fetchGame,
    connected,
    notFound: current && state.notFound,
  };
}

/** Live in-game chat: pushed on arrival, with one fetch to prime the history. */
export function useLiveChat(gameId) {
  const [state, setState] = useState({ id: null, messages: [] });
  const connected = useSocketStatus();

  const load = useCallback(
    () =>
      api
        .get(`/games/${gameId}/chat`)
        .then((res) => setState({ id: gameId, messages: res.data || [] }))
        .catch(() => {
          /* keep whatever is already on screen */
        }),
    [gameId],
  );

  const append = useCallback(
    (message) => {
      setState((current) => {
        const messages = current.id === gameId ? current.messages : [];
        if (messages.some((m) => m.id === message.id)) return current;
        return { id: gameId, messages: [...messages, message] };
      });
    },
    [gameId],
  );

  useEffect(() => {
    if (!gameId) return undefined;
    load();

    const socket = getSocket();
    const onMessage = (message) => {
      if (message?.game_id && message.game_id !== gameId) return;
      append(message);
    };
    socket.on("game:chat", onMessage);
    socket.on("connect", load);

    return () => {
      socket.off("game:chat", onMessage);
      socket.off("connect", load);
    };
  }, [gameId, load, append]);

  // Only poll when the push channel is unavailable.
  useEffect(() => {
    if (connected) return undefined;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [connected, load]);

  return { messages: state.id === gameId ? state.messages : [], reload: load, append };
}

/** Live lobby listing. Any challenge change re-fetches the filtered list. */
export function useLiveLobby(load) {
  const connected = useSocketStatus();
  const loadRef = useRef(load);

  // Assigned in an effect, not during render: a ref written while rendering is
  // not a supported pattern and can tear under concurrent rendering.
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const watch = () => socket.emit("lobby:watch");
    watch();

    let pending = null;
    // A burst of changes (a seek taken, two cancelled) becomes one fetch.
    const refresh = () => {
      clearTimeout(pending);
      pending = setTimeout(() => loadRef.current?.(), 150);
    };
    const onConnect = () => {
      watch();
      refresh();
    };
    socket.on("lobby:update", refresh);
    socket.on("connect", onConnect);

    return () => {
      clearTimeout(pending);
      socket.emit("lobby:unwatch");
      socket.off("lobby:update", refresh);
      socket.off("connect", onConnect);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadRef.current?.(), connected ? 20_000 : 4_000);
    return () => clearInterval(interval);
  }, [connected]);
}

/**
 * Clocks that tick locally between server updates.
 *
 * Counts from the moment the payload arrived rather than from the server's
 * timestamp, so the device's own clock being off by a few seconds does not
 * show up on the board. Only the side to move ticks, and only once the clocks
 * are running (each side's first move is free).
 */
export function useTickingClocks(game) {
  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(game?.clock_running);

  useEffect(() => {
    if (!running) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [running, game?.version]);

  if (!game || game.white_time_remaining == null) return { white: null, black: null };

  let white = game.white_time_remaining;
  let black = game.black_time_remaining;

  if (running && game._receivedAt) {
    const elapsed = Math.max(0, (now - game._receivedAt) / 1000);
    if (game.turn === "white") white = Math.max(0, white - elapsed);
    else black = Math.max(0, black - elapsed);
  }

  return { white, black };
}

/** Seconds until a server-time deadline, ticking once a second. */
export function useCountdown(deadlineIso, skew = 0) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineIso) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadlineIso]);
  if (!deadlineIso) return null;
  return Math.max(0, (Date.parse(deadlineIso) - (now + skew)) / 1000);
}
