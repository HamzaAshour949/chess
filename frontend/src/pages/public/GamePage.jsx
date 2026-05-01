import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import api from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";

function fmtClock(sec) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

function PlayerStrip({ u, side, isTurn, time, lowTime }) {
  return (
    <div className={`surface-2 p-3 flex items-center gap-3 ${isTurn ? "ring-2 ring-amber-400/60" : ""}`}>
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-slate-200">
        {(u?.display_name || "?").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold truncate flex items-center gap-2">
          <span className="text-base">{side === "white" ? "♔" : "♚"}</span>
          {u?.display_name || "—"}
          {u?.is_provisional && <span className="text-xs text-slate-500">?</span>}
        </div>
        <div className="text-xs text-slate-400">{u?.online_rating || "—"}</div>
      </div>
      {time != null && (
        <div className={`px-3 py-1.5 rounded-lg text-lg font-mono font-bold ${
          lowTime ? "bg-rose-500/30 text-rose-200 animate-pulse"
          : isTurn ? "bg-amber-500/20 text-amber-300"
          : "bg-white/5 text-slate-300"
        }`}>{fmtClock(time)}</div>
      )}
    </div>
  );
}

export default function GamePage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { user } = useUserAuth();

  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const versionRef = useRef(-1);

  const [tickNow, setTickNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setTickNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);

  const fetchGame = useCallback(async () => {
    try {
      const r = await api.get(`/games/${id}`);
      if (r.data.version !== versionRef.current) {
        versionRef.current = r.data.version;
        setGame(r.data);
      }
    } catch (e) { /* ignore polling errors */ }
  }, [id]);

  useEffect(() => {
    fetchGame();
    const i = setInterval(fetchGame, 1500);
    return () => clearInterval(i);
  }, [fetchGame]);

  const role = useMemo(() => {
    if (!game || !user) return null;
    if (game.white_user?.id === user.id) return "white";
    if (game.black_user?.id === user.id) return "black";
    return null;
  }, [game, user]);

  const turn = useMemo(() => {
    if (!game?.fen) return "white";
    return game.fen.split(" ")[1] === "w" ? "white" : "black";
  }, [game?.fen]);

  const orientation = role === "black" ? "black" : "white";

  const liveClocks = useMemo(() => {
    if (!game) return { w: null, b: null };
    let w = game.white_time_remaining;
    let b = game.black_time_remaining;
    if (game.status === "active" && game.last_move_at && w != null && b != null) {
      const elapsed = (tickNow - new Date(game.last_move_at + "Z").getTime()) / 1000;
      if (elapsed > 0) {
        if (turn === "white") w = Math.max(0, w - elapsed);
        else b = Math.max(0, b - elapsed);
      }
    }
    return { w, b };
  }, [game, turn, tickNow]);

  const tryMove = async (from, to, promotion) => {
    if (!game || game.status !== "active" || !role || role !== turn) return false;
    const local = new Chess(game.fen);
    const m = local.move({ from, to, promotion: promotion || "q" });
    if (!m) return false;
    const uci = from + to + (m.promotion ? m.promotion : "");
    try {
      const r = await api.post(`/games/${game.id}/move`, { move: uci });
      versionRef.current = r.data.version;
      setGame(r.data);
      return true;
    } catch (e) {
      setError(e.response?.data?.error || "Invalid move");
      setTimeout(() => setError(""), 2500);
      return false;
    }
  };

  const onPieceDrop = (sourceSquare, targetSquare, piece) => {
    const promo = piece && piece.toLowerCase().endsWith("p") &&
      (targetSquare[1] === "8" || targetSquare[1] === "1") ? "q" : undefined;
    tryMove(sourceSquare, targetSquare, promo);
    return false;
  };

  const action = async (path) => {
    try {
      const r = await api.post(`/games/${id}/${path}`);
      setGame(r.data); versionRef.current = r.data.version;
    } catch (e) { setError(e.response?.data?.error || "Failed"); }
  };

  if (!game) {
    return <div className="max-w-5xl mx-auto px-4 py-12"><div className="surface-elev h-[640px] shimmer" /></div>;
  }

  const ended = ["white_wins", "black_wins", "draw", "aborted"].includes(game.status);
  const winnerSide = game.status === "white_wins" ? "white" : game.status === "black_wins" ? "black" : null;
  const youWon = role && winnerSide === role;
  const youLost = role && winnerSide && winnerSide !== role;
  const ratingChange = role === "white"
    ? (game.white_rating_after ?? 0) - (game.white_rating_before ?? 0)
    : role === "black"
    ? (game.black_rating_after ?? 0) - (game.black_rating_before ?? 0)
    : 0;

  const moves = (game.pgn || "")
    .replace(/\d+\.\s/g, "|")
    .split("|").filter(Boolean)
    .map((pair) => pair.trim().split(/\s+/));

  const top = role === "black" ? game.white_user : game.black_user;
  const bottom = role === "black" ? game.black_user : game.white_user;
  const topSide = role === "black" ? "white" : "black";
  const bottomSide = role === "black" ? "black" : "white";
  const topTime = topSide === "white" ? liveClocks.w : liveClocks.b;
  const bottomTime = bottomSide === "white" ? liveClocks.w : liveClocks.b;
  const lowThreshold = 30;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div>
          <div className="surface-elev p-4 sm:p-5">
            <PlayerStrip u={top} side={topSide} isTurn={!ended && turn === topSide}
              time={topTime} lowTime={topTime != null && topTime < lowThreshold} />
            <div
              className="my-4 chessboard-shell"
              onContextMenu={(e) => e.preventDefault()}
            >
              <Chessboard
                id={`game-${game.id}`}
                position={game.fen}
                boardOrientation={orientation}
                arePiecesDraggable={!ended && role === turn}
                onPieceDrop={onPieceDrop}
                onSquareRightClick={() => {}}
                arePremovesAllowed={false}
                customBoardStyle={{ borderRadius: 12, boxShadow: "0 12px 40px -12px rgba(0,0,0,0.6)" }}
                customDarkSquareStyle={{ backgroundColor: "#3b3a36" }}
                customLightSquareStyle={{ backgroundColor: "#e9dfc8" }}
                customDropSquareStyle={{ boxShadow: "inset 0 0 1px 4px rgba(245, 158, 11, 0.55)" }}
              />
            </div>
            <PlayerStrip u={bottom} side={bottomSide} isTurn={!ended && turn === bottomSide}
              time={bottomTime} lowTime={bottomTime != null && bottomTime < lowThreshold} />

            {error && <div className="chip chip-red w-full justify-center py-2 mt-3">{error}</div>}
          </div>

          {ended && (
            <div className="surface-elev p-6 mt-4 text-center animate-fade-up">
              <div className="text-3xl font-extrabold mb-1">
                {role
                  ? youWon ? <span className="text-emerald-400">{t("you_won")}</span>
                  : youLost ? <span className="text-rose-400">{t("you_lost")}</span>
                  : <span className="text-slate-200">{t("draw_result")}</span>
                  : <span className="text-slate-200">{t("game_over")}</span>}
              </div>
              <div className="text-sm text-slate-400">
                {game.result} · {game.status.replace("_", " ")}
              </div>
              {role && game.rated && !game.voided && (
                <div className="mt-3 text-sm text-slate-300">
                  {t("rating_change")}: <span className={`font-bold ${ratingChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {ratingChange > 0 ? "+" : ""}{ratingChange}
                  </span>
                </div>
              )}
              {game.voided && (
                <div className="mt-3 chip chip-red mx-auto w-fit">{t("game_voided")}</div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {!role && (
            <div className="surface-elev p-4 text-sm text-slate-300 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              {t("spectating")}
            </div>
          )}

          {role && !ended && (
            <div className="surface-elev p-4">
              <div className="text-sm text-slate-300 mb-3">
                {role === turn ? (
                  <span className="text-amber-400 font-semibold">● {t("your_turn")}</span>
                ) : (
                  <span className="text-slate-400">{t("opponent_turn")}</span>
                )}
              </div>

              {game.draw_offer_by && game.draw_offer_by !== user.id && (
                <div className="mb-3 surface-2 p-3 border border-amber-400/30">
                  <p className="text-sm text-amber-300 mb-2">
                    {t("draw_offered", { name: top?.display_name || "Opponent" })}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => action("draw-accept")} className="btn btn-primary flex-1">{t("accept_draw")}</button>
                    <button onClick={() => action("draw-decline")} className="btn btn-ghost flex-1">{t("decline_draw")}</button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button onClick={() => action("draw-offer")}
                  disabled={game.draw_offer_by === user.id}
                  className="btn btn-ghost">
                  {game.draw_offer_by === user.id ? "…" : t("offer_draw")}
                </button>
                <button onClick={() => { if (confirm(t("resign") + "?")) action("resign"); }}
                  className="btn btn-danger">
                  {t("resign")}
                </button>
                {game.time_control_seconds > 0 && (
                  <button onClick={() => action("claim-time")}
                    className="btn btn-ghost text-xs">
                    {t("claim_on_time")}
                  </button>
                )}
              </div>
            </div>
          )}

          <ChatPanel gameId={game.id} role={role} chatDisabled={game.chat_disabled} t={t} user={user} />

          <div className="surface-elev p-4">
            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">{t("moves")}</h3>
            {moves.length === 0 ? (
              <p className="text-xs text-slate-500">—</p>
            ) : (
              <ol className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-sm font-mono max-h-72 overflow-y-auto">
                {moves.map((pair, i) => (
                  <li key={i} className="contents">
                    <span className="text-slate-500">{i + 1}.</span>
                    <span className="text-slate-200">{pair[0] || ""}</span>
                    <span className="text-slate-200">{pair[1] || ""}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <Link to="/play" className="btn btn-ghost w-full">← {t("play")}</Link>
        </aside>
      </div>
    </div>
  );
}


function ChatPanel({ gameId, role, chatDisabled, t, user }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [muted, setMuted] = useState(() => localStorage.getItem("mute_game_chat") === "1");
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const lastIdRef = useRef(0);

  const load = useCallback(() => {
    api.get(`/games/${gameId}/chat`).then((r) => {
      const list = r.data || [];
      const tail = list.length ? list[list.length - 1].id : 0;
      if (tail !== lastIdRef.current || list.length !== messages.length) {
        lastIdRef.current = tail;
        setMessages(list);
      }
    }).catch(() => {});
  }, [gameId, messages.length]);

  useEffect(() => {
    load();
    const i = setInterval(load, 2500);
    return () => clearInterval(i);
  }, [load]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api.post(`/games/${gameId}/chat`, { content: text });
      setText("");
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed");
      setTimeout(() => setError(""), 2500);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("mute_game_chat", next ? "1" : "0");
  };

  return (
    <div className="surface-elev p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t("chat")}</h3>
        <button onClick={toggleMute} title={muted ? t("unmute") : t("mute")}
          className="text-xs text-slate-400 hover:text-amber-400">
          {muted ? "🔕" : "🔔"}
        </button>
      </div>
      <div ref={scrollRef} className="space-y-1.5 max-h-56 overflow-y-auto pe-1 mb-2 text-sm">
        {muted ? (
          <p className="text-xs text-slate-500">{t("notifications_muted")}</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-slate-500">{t("no_messages_yet")}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="leading-snug">
              <span className={`font-semibold ${m.user_id === user?.id ? "text-amber-300" : "text-sky-300"}`}>
                {m.display_name || m.username}:
              </span>{" "}
              <span className={m.is_deleted ? "text-slate-500 italic" : "text-slate-200"}>{m.content}</span>
            </div>
          ))
        )}
      </div>
      {chatDisabled ? (
        <p className="text-xs text-rose-400">{t("chat_disabled_admin")}</p>
      ) : !role ? (
        <p className="text-xs text-slate-500">{t("spectator_chat_readonly")}</p>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)}
            maxLength={500} placeholder={t("type_message")}
            className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/40" />
          <button type="submit" className="btn btn-primary px-3 py-1.5 text-sm">{t("send")}</button>
        </form>
      )}
      {error && <p className="text-xs text-rose-400 mt-1.5">{error}</p>}
    </div>
  );
}
