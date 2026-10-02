import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Chessboard } from "react-chessboard";
import api, { apiError } from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useCountdown, useLiveGame, useTickingClocks } from "../../hooks/useLive";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../components/ui/Toaster";
import { useConfirm } from "../../components/ui/Dialog";
import { CHALLENGES_CHANGED_EVENT } from "../../components/NotificationCenter";
import Avatar from "../../components/Avatar";
import { checkedKingSquare, findMove, legalTargets, materialFromFen, positionAfter, replayPlies } from "../../lib/chess-view";
import { isolate, nameOf, outcomeFor, tcLabel, terminationKey } from "../../lib/format";
import { isSoundEnabled, playSound, setSoundEnabled, soundForSan } from "../../lib/sound";
import PlayerBar from "./game/PlayerBar";
import MoveList from "./game/MoveList";
import ChatPanel from "./game/ChatPanel";
import PromotionPicker from "./game/PromotionPicker";
import NotFoundPage from "./NotFoundPage";

const ENDED = ["white_wins", "black_wins", "draw", "aborted"];
const LOW_TIME = 20;

const LAST_MOVE = { background: "rgba(245, 200, 66, 0.38)" };
const SELECTED = { background: "rgba(245, 200, 66, 0.55)" };
const CHECK = { background: "radial-gradient(circle, rgba(239, 68, 68, 0.9) 0%, rgba(239, 68, 68, 0.35) 45%, transparent 75%)" };
const TARGET = { background: "radial-gradient(circle, rgba(15, 23, 42, 0.35) 22%, transparent 24%)", cursor: "pointer" };
const CAPTURE = { background: "radial-gradient(circle, transparent 56%, rgba(15, 23, 42, 0.38) 58%)", cursor: "pointer" };

export default function GamePage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useUserAuth();
  const { toast } = useToast();
  const confirm = useConfirm();

  const { game, setGame, refresh, connected, notFound } = useLiveGame(id);
  const clocks = useTickingClocks(game);

  const [viewPly, setViewPly] = useState(null); // null: follow the live position
  const [flipped, setFlipped] = useState(false);
  // Both belong to the position they were made in: a new server version makes
  // them stale, so they are stored with it and ignored once it moves on.
  const [selectedAt, setSelectedAt] = useState(null); // { square, version }
  const [promotion, setPromotion] = useState(null);
  const [pendingAt, setPendingAt] = useState(null); // optimistic move awaiting the server
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled());

  const version = game?.version;
  const selected = selectedAt && selectedAt.version === version ? selectedAt.square : null;
  const pending = pendingAt && pendingAt.version === version ? pendingAt : null;
  const setSelected = useCallback((square) => setSelectedAt(square ? { square, version } : null), [version]);
  const setPending = useCallback((move) => setPendingAt(move ? { ...move, version } : null), [version]);

  const role = useMemo(() => {
    if (!game || !user) return null;
    if (game.white_user?.id === user.id) return "white";
    if (game.black_user?.id === user.id) return "black";
    return null;
  }, [game, user]);

  const plies = useMemo(() => replayPlies(game?.moves), [game?.moves]);
  const livePly = plies.length - 1;
  const shownPly = viewPly === null ? livePly : Math.min(viewPly, livePly);
  const atLive = shownPly === livePly;

  const active = game?.status === "active";
  const ended = ENDED.includes(game?.status);
  const turn = game?.turn ?? "white";
  const myTurn = active && role === turn && !pending;
  const canMove = myTurn && atLive && !promotion;
  const orientation = (role === "black") !== flipped ? "black" : "white";

  // What the board shows: the optimistic move, the live game, or history.
  const boardFen = pending && atLive ? pending.fen : plies[shownPly]?.fen;
  const boardLastMove = pending && atLive ? pending.uci : plies[shownPly]?.uci;

  // --------------------------------------------------------------- sounds
  const heardPly = useRef(null);
  const previousStatus = useRef(null);
  useEffect(() => {
    if (!game) return;
    if (heardPly.current === null) {
      heardPly.current = livePly; // no sound for the position we opened on
    } else if (livePly > heardPly.current) {
      const mine = plies[livePly]?.color === (role === "white" ? "w" : role === "black" ? "b" : null);
      // Our own move was already heard when it was played optimistically.
      if (!mine) playSound(soundForSan(plies[livePly]?.san));
      heardPly.current = livePly;
    }
    if (previousStatus.current === "active" && ENDED.includes(game.status)) playSound("end");
    previousStatus.current = game.status;
  }, [game, livePly, plies, role]);

  // ---------------------------------------------------------------- clocks
  const clockFor = (side) => (side === "white" ? clocks.white : clocks.black);
  const sideToMoveClock = clockFor(turn);
  const flagChecked = useRef(null);
  useEffect(() => {
    // The server settles flags itself; asking once as soon as ours reads zero
    // makes the result appear without waiting for the sweeper.
    if (game?.clock_running && sideToMoveClock !== null && sideToMoveClock <= 0 && flagChecked.current !== game.version) {
      flagChecked.current = game.version;
      void refresh();
    }
  }, [sideToMoveClock, game?.clock_running, game?.version, refresh]);

  const warned = useRef(false);
  useEffect(() => {
    const mine = role ? clockFor(role) : null;
    if (myTurn && game?.clock_running && mine !== null && mine < 10 && !warned.current) {
      warned.current = true;
      playSound("lowTime");
    }
    if (mine !== null && mine >= 10) warned.current = false;
  });

  const firstMoveLeft = useCountdown(active && game?.move_count < 2 ? game?.deadline_at : null, game?._skew ?? 0);
  useEffect(() => {
    if (firstMoveLeft === 0) void refresh();
  }, [firstMoveLeft, refresh]);

  // ----------------------------------------------------------------- moves
  const submitMove = useCallback(
    async (from, to, promotionPiece) => {
      if (!game) return;
      const next = positionAfter(game.fen, from, to, promotionPiece);
      if (!next) return;
      const uci = `${from}${to}${promotionPiece ?? ""}`;
      setPending({ fen: next.fen, uci });
      setSelected(null);
      playSound(soundForSan(next.san));
      try {
        const res = await api.post(`/games/${game.id}/move`, { move: uci });
        setGame(res.data);
      } catch (error) {
        setPending(null);
        toast({ tone: "error", title: apiError(error, t("invalid_move")) });
        void refresh();
      }
    },
    [game, setGame, setPending, setSelected, refresh, toast, t],
  );

  /** Validate locally; ask for a promotion piece when one is needed. */
  const attemptMove = useCallback(
    (from, to) => {
      if (!game) return false;
      const found = findMove(game.fen, from, to);
      if (!found) return false;
      if (found.needsPromotion) {
        setPromotion({ from, to });
        return false;
      }
      void submitMove(from, to);
      return true;
    },
    [game, submitMove],
  );

  // The board's drop handler is captured when a drag starts, so it reads the
  // latest state through a ref rather than a stale closure.
  const latest = useRef({});
  useLayoutEffect(() => {
    latest.current = { canMove, attemptMove, role, selected, setSelected, fen: game?.fen };
  });

  const onPieceDrop = useCallback(({ sourceSquare, targetSquare }) => {
    const state = latest.current;
    if (!state.canMove || !targetSquare || sourceSquare === targetSquare) return false;
    return state.attemptMove(sourceSquare, targetSquare);
  }, []);

  const onSquareClick = useCallback(({ square, piece }) => {
    const state = latest.current;
    if (!state.canMove) return;
    const mine = piece && state.role && piece.pieceType?.[0] === state.role[0];
    if (state.selected) {
      if (state.selected === square) {
        state.setSelected(null);
        return;
      }
      const target = legalTargets(state.fen, state.selected).some((move) => move.to === square);
      if (target) {
        state.attemptMove(state.selected, square);
        state.setSelected(null);
        return;
      }
    }
    state.setSelected(mine ? square : null);
  }, []);

  const canDragPiece = useCallback(({ piece }) => {
    const state = latest.current;
    return Boolean(state.canMove && piece && state.role && piece.pieceType?.[0] === state.role[0]);
  }, []);

  const squareStyles = useMemo(() => {
    const styles = {};
    if (boardLastMove) {
      styles[boardLastMove.slice(0, 2)] = LAST_MOVE;
      styles[boardLastMove.slice(2, 4)] = LAST_MOVE;
    }
    const king = checkedKingSquare(boardFen);
    if (king) styles[king] = { ...styles[king], ...CHECK };
    if (selected && canMove) {
      styles[selected] = SELECTED;
      for (const move of legalTargets(game?.fen, selected)) {
        styles[move.to] = move.captured ? CAPTURE : TARGET;
      }
    }
    return styles;
  }, [boardLastMove, boardFen, selected, canMove, game?.fen]);

  const boardOptions = {
    id: `game-${id}`,
    position: boardFen,
    boardOrientation: orientation,
    allowDragging: canMove,
    canDragPiece,
    onPieceDrop,
    onSquareClick,
    squareStyles,
    animationDurationInMs: 160,
    boardStyle: { borderRadius: 12, overflow: "hidden" },
    darkSquareStyle: { backgroundColor: "#8b7a5e" },
    lightSquareStyle: { backgroundColor: "#e9dfc8" },
    dropSquareStyle: { boxShadow: "inset 0 0 0 4px rgba(245, 158, 11, 0.65)" },
  };

  // -------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") setViewPly((v) => Math.max(0, (v ?? livePly) - 1));
      else if (event.key === "ArrowRight") setViewPly((v) => ((v ?? livePly) + 1 >= livePly ? null : (v ?? livePly) + 1));
      else if (event.key === "Home") setViewPly(0);
      else if (event.key === "End") setViewPly(null);
      else if (event.key.toLowerCase() === "f") setFlipped((f) => !f);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [livePly]);

  // ------------------------------------------------------------- rematches
  const [rematch, setRematch] = useState({ mine: null, theirs: null });
  const loadRematch = useCallback(() => {
    if (!role || !ended) return;
    api
      .get("/games/me/challenges")
      .then((res) => {
        const forThis = (g) => g.rematch_of_game_id === id;
        setRematch({
          mine: res.data.outgoing.find(forThis) ?? null,
          theirs: res.data.incoming.find(forThis) ?? null,
        });
      })
      .catch(() => {});
  }, [role, ended, id]);
  useEffect(() => {
    loadRematch();
    window.addEventListener(CHALLENGES_CHANGED_EVENT, loadRematch);
    return () => window.removeEventListener(CHALLENGES_CHANGED_EVENT, loadRematch);
  }, [loadRematch]);

  // --------------------------------------------------------------- actions
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    } finally {
      setBusy(false);
    }
  };

  const post = (path) => run(async () => setGame((await api.post(`/games/${id}/${path}`)).data));

  const resign = async () => {
    const ok = await confirm({
      title: t("confirm_resign_title"),
      body: t("confirm_resign_body"),
      confirmLabel: t("resign"),
      tone: "danger",
    });
    if (ok) await post("resign");
  };

  const abort = async () => {
    const ok = await confirm({ title: t("confirm_abort_title"), body: t("confirm_abort_body"), confirmLabel: t("abort") });
    if (ok) await post("abort");
  };

  const offerRematch = () =>
    run(async () => {
      const res = await api.post(`/games/${id}/rematch`);
      if (res.data.status === "active") navigate(`/play/${res.data.id}`);
      else setRematch((r) => ({ ...r, mine: res.data }));
      window.dispatchEvent(new CustomEvent(CHALLENGES_CHANGED_EVENT));
    });

  const cancelRematch = () =>
    run(async () => {
      await api.post(`/games/${rematch.mine.id}/cancel`);
      setRematch((r) => ({ ...r, mine: null }));
    });

  const declineRematch = () =>
    run(async () => {
      await api.post(`/games/${rematch.theirs.id}/decline`);
      setRematch((r) => ({ ...r, theirs: null }));
    });

  const copyText = async (text, done) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "success", title: done });
    } catch {
      toast({ tone: "error", title: t("copy_failed") });
    }
  };

  const copyPgn = () =>
    run(async () => {
      const res = await api.get(`/games/${id}/pgn`, { responseType: "text", transformResponse: (d) => d });
      await copyText(res.data, t("pgn_copied"));
    });

  const toggleSound = () => {
    setSoundEnabled(!sound);
    setSound(!sound);
  };

  // ---------------------------------------------------------------- titles
  const white = game?.white_user;
  const black = game?.black_user;
  const opponent = role === "white" ? black : role === "black" ? white : null;
  useDocumentTitle(
    !game
      ? t("game")
      : active && role && turn === role
        ? `● ${t("your_turn")} — ${nameOf(opponent, t)}`
        : `${nameOf(white, t)} vs ${nameOf(black, t)}`,
  );

  if (notFound) return <NotFoundPage title={t("game_not_found")} body={t("game_not_found_body")} />;

  if (!game) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" aria-busy="true">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="surface-elev aspect-square max-h-[80vh] shimmer" />
          <div className="surface-elev h-96 shimmer" />
        </div>
      </div>
    );
  }

  if (game.status === "open") {
    return <OpenChallenge game={game} user={user} onChange={setGame} />;
  }

  // ------------------------------------------------------------ board model
  const topSide = orientation === "white" ? "black" : "white";
  const bottomSide = orientation;
  const material = materialFromFen(boardFen);
  const barFor = (side) => {
    const player = side === "white" ? white : black;
    const color = side === "white" ? "w" : "b";
    const advantage = side === "white" ? material.score : -material.score;
    const time = clockFor(side);
    return (
      <PlayerBar
        user={player}
        side={side}
        clock={time}
        ticking={active && game.clock_running && turn === side}
        lowTime={active && time != null && time < LOW_TIME}
        captured={material.captured[color]}
        advantage={advantage}
        isYou={role === side}
        result={ended ? outcomeFor(game, player?.id) : null}
      />
    );
  };

  const drawOfferedByMe = game.draw_offer_by && game.draw_offer_by === user?.id;
  const drawOfferedToMe = game.draw_offer_by && role && game.draw_offer_by !== user?.id;
  const canAbort = active && role && game.move_count < 2;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 lg:gap-6 items-start">
        {/* Board column */}
        {/* Board and both player bars fit the viewport height, so neither clock
            is ever scrolled out of sight mid-game. */}
        <div className="w-full mx-auto" style={{ maxWidth: "max(18rem, min(100%, calc(100dvh - 16rem)))" }}>
          <div className="space-y-2">
            {barFor(topSide)}

            {/* A chessboard is never mirrored: a1 stays bottom-left for White in
                every language. Without this the grid follows the Arabic page's
                right-to-left direction and the files come out reversed. */}
            <div className="relative chessboard-shell" dir="ltr" onContextMenu={(e) => e.preventDefault()}>
              <Chessboard options={boardOptions} />
              {promotion && (
                <PromotionPicker
                  color={role === "white" ? "w" : "b"}
                  onPick={(piece) => {
                    const { from, to } = promotion;
                    setPromotion(null);
                    void submitMove(from, to, piece);
                  }}
                  onCancel={() => setPromotion(null)}
                />
              )}
            </div>

            {barFor(bottomSide)}
          </div>

          {/* Status line */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
            {active && game.move_count < 2 && firstMoveLeft !== null ? (
              <span className="chip chip-gold">
                {t(role === turn ? "first_move_you" : "first_move_waiting", {
                  side: t(turn === "white" ? "color_white" : "color_black"),
                  seconds: Math.ceil(firstMoveLeft),
                })}
              </span>
            ) : active ? (
              role ? (
                role === turn ? (
                  <span className="chip chip-gold">● {t("your_turn")}</span>
                ) : (
                  <span className="chip chip-slate">{t("opponent_turn")}</span>
                )
              ) : (
                <span className="chip chip-slate">{t(turn === "white" ? "white_to_move" : "black_to_move")}</span>
              )
            ) : null}
            {!atLive && (
              <button type="button" onClick={() => setViewPly(null)} className="chip chip-blue hover:bg-sky-500/25">
                {t("viewing_move", { ply: shownPly })} · {t("back_to_live")}
              </button>
            )}
            {!connected && <span className="chip chip-red">{t("reconnecting")}</span>}
            <span className="ms-auto flex items-center gap-1">
              <button type="button" onClick={() => setFlipped((f) => !f)} className="btn btn-ghost px-2.5 py-1.5 text-xs" title={`${t("flip_board")} (F)`}>
                ⇅ <span className="hidden sm:inline">{t("flip_board")}</span>
              </button>
              <button type="button" onClick={toggleSound} className="btn btn-ghost px-2.5 py-1.5 text-xs" aria-pressed={sound} aria-label={t("notif_sound")}>
                {sound ? "🔊" : "🔈"}
              </button>
            </span>
          </div>
        </div>

        {/* Side column */}
        <aside className="space-y-4">
          <div className="surface-elev p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <span className="chip chip-slate">{tcLabel(game.time_control_seconds, game.increment_seconds, t)}</span>
              <span className={`chip ${game.rated ? "chip-gold" : "chip-slate"}`}>{game.rated ? t("rated") : t("casual")}</span>
              {!role && <span className="chip chip-red">● {t("spectating")}</span>}
            </div>

            {role && active && (
              <div className="mt-4 space-y-3">
                {drawOfferedToMe && (
                  <div className="surface-2 p-3 border border-amber-400/30">
                    <p className="text-sm text-amber-200 mb-2">{t("draw_offered", { name: isolate(nameOf(opponent, t)) })}</p>
                    <div className="flex gap-2">
                      <button onClick={() => post("draw-accept")} disabled={busy} className="btn btn-primary flex-1 py-2">
                        {t("accept_draw")}
                      </button>
                      <button onClick={() => post("draw-decline")} disabled={busy} className="btn btn-ghost flex-1 py-2">
                        {t("decline_draw")}
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {canAbort ? (
                    <button onClick={abort} disabled={busy} className="btn btn-ghost col-span-2">
                      {t("abort_game")}
                    </button>
                  ) : drawOfferedByMe ? (
                    <button onClick={() => post("draw-decline")} disabled={busy} className="btn btn-ghost">
                      {t("withdraw_draw")}
                    </button>
                  ) : (
                    <button onClick={() => post("draw-offer")} disabled={busy || drawOfferedToMe} className="btn btn-ghost">
                      ½ {t("offer_draw")}
                    </button>
                  )}
                  {!canAbort && (
                    <button onClick={resign} disabled={busy} className="btn btn-danger">
                      ⚑ {t("resign")}
                    </button>
                  )}
                </div>
                {drawOfferedByMe && <p className="text-xs text-slate-400">{t("draw_offered_waiting")}</p>}
              </div>
            )}

            {ended && (
              <GameResult
                game={game}
                role={role}
                userId={user?.id}
                busy={busy}
                rematch={rematch}
                onRematch={offerRematch}
                onCancelRematch={cancelRematch}
                onDeclineRematch={declineRematch}
                onCopyPgn={copyPgn}
                onShare={() => copyText(window.location.href, t("link_copied"))}
              />
            )}
          </div>

          <MoveList plies={plies} viewPly={shownPly} onSelect={(ply) => setViewPly(ply >= livePly ? null : ply)} />

          <ChatPanel gameId={game.id} role={role} chatDisabled={game.chat_disabled} user={user} />

          <p className="text-[11px] text-slate-500 leading-relaxed px-1">{t("board_shortcuts")}</p>
        </aside>
      </div>
    </div>
  );
}

/** The end-of-game card: who won, how, the rating change and what next. */
function GameResult({ game, role, userId, busy, rematch, onRematch, onCancelRematch, onDeclineRematch, onCopyPgn, onShare }) {
  const { t } = useTranslation();
  const outcome = outcomeFor(game, userId);
  const reason = terminationKey(game);
  const delta =
    role === "white"
      ? (game.white_rating_after ?? 0) - (game.white_rating_before ?? 0)
      : role === "black"
        ? (game.black_rating_after ?? 0) - (game.black_rating_before ?? 0)
        : 0;
  const winner = game.status === "white_wins" ? game.white_user : game.status === "black_wins" ? game.black_user : null;

  const headline =
    game.status === "aborted"
      ? t("game_aborted")
      : role
        ? t(outcome === "win" ? "you_won" : outcome === "loss" ? "you_lost" : "draw_result")
        : winner
          ? t("player_won", { name: isolate(nameOf(winner, t)) })
          : t("draw_result");

  return (
    <div className="mt-4 text-center animate-fade-up">
      <div
        className={`text-2xl font-extrabold ${
          outcome === "win" ? "text-emerald-400" : outcome === "loss" ? "text-rose-400" : "text-slate-100"
        }`}
      >
        {headline}
      </div>
      <div className="text-sm text-slate-400 mt-1">
        {game.result && <span className="font-mono me-1.5">{game.result}</span>}
        {reason && t(reason)}
      </div>
      {role && game.rated && !game.voided && game.status !== "aborted" && (
        <div className="mt-2 text-sm text-slate-300">
          {t("rating_change")}:{" "}
          <span className={`font-bold ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        </div>
      )}
      {game.voided && <div className="mt-3 chip chip-red mx-auto w-fit">{t("game_voided")}</div>}

      {role && game.started_at && (
        <div className="mt-4">
          {rematch.theirs ? (
            <div className="surface-2 p-3 border border-amber-400/30">
              <p className="text-sm text-amber-200 mb-2">{t("rematch_offer_from", { name: isolate(nameOf(rematch.theirs.creator_user, t)) })}</p>
              <div className="flex gap-2">
                <button onClick={onRematch} disabled={busy} className="btn btn-primary flex-1 py-2">
                  {t("accept")}
                </button>
                <button onClick={onDeclineRematch} disabled={busy} className="btn btn-ghost flex-1 py-2">
                  {t("decline")}
                </button>
              </div>
            </div>
          ) : rematch.mine ? (
            <div className="surface-2 p-3 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
                {t("rematch_waiting")}
              </span>
              <button onClick={onCancelRematch} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
                {t("cancel")}
              </button>
            </div>
          ) : (
            <button onClick={onRematch} disabled={busy} className="btn btn-primary w-full">
              ↻ {t("rematch")}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Link to="/play" className="btn btn-ghost px-2 text-xs">
          {t("new_game")}
        </Link>
        <a href={`/api/games/${game.id}/pgn`} download className="btn btn-ghost px-2 text-xs">
          ⬇ PGN
        </a>
        <button type="button" onClick={onCopyPgn} disabled={busy} className="btn btn-ghost px-2 text-xs">
          {t("copy_pgn")}
        </button>
      </div>
      <button type="button" onClick={onShare} className="mt-2 text-xs text-slate-400 hover:text-white">
        {t("share_game")}
      </button>
    </div>
  );
}

/** A game page for a challenge nobody has taken yet. */
function OpenChallenge({ game, user, onChange }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const isCreator = user && game.creator_user_id === user.id;
  const isInvited = user && game.invited_user_id === user.id;
  const canAccept = user && !isCreator && (!game.invited_user_id || isInvited);

  const act = async (path) => {
    setBusy(true);
    try {
      const res = await api.post(`/games/${game.id}/${path}`);
      if (res.data.status === "active") navigate(`/play/${res.data.id}`, { replace: true });
      else onChange(res.data);
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="surface-elev p-8">
        <Avatar user={game.creator_user} size={64} className="mb-4" />
        <h1 className="text-xl font-bold text-white">
          {isCreator ? t("waiting_for_opponent") : t("challenge_from", { name: isolate(nameOf(game.creator_user, t)) })}
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          {tcLabel(game.time_control_seconds, game.increment_seconds, t)} · {game.rated ? t("rated") : t("casual")}
        </p>
        {isCreator && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-slate-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
            {game.invited_user ? t("waiting_for_player", { name: isolate(nameOf(game.invited_user, t)) }) : t("waiting_in_lobby")}
          </div>
        )}
        <div className="flex justify-center gap-2 mt-6">
          {isCreator && (
            <button onClick={() => act("cancel")} disabled={busy} className="btn btn-ghost">
              {t("cancel_challenge")}
            </button>
          )}
          {canAccept && (
            <button onClick={() => act("accept")} disabled={busy} className="btn btn-primary">
              {t("accept")}
            </button>
          )}
          {isInvited && (
            <button onClick={() => act("decline")} disabled={busy} className="btn btn-ghost">
              {t("decline")}
            </button>
          )}
          {!user && (
            <Link to="/login" className="btn btn-primary">
              {t("sign_in_to_play")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
