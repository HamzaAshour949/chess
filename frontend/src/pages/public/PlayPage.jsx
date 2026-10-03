import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useLiveLobby } from "../../hooks/useLive";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useUserAuth } from "../../context/UserAuthContext";
import { useToast } from "../../components/ui/Toaster";
import { CHALLENGES_CHANGED_EVENT } from "../../components/NotificationCenter";
import Avatar from "../../components/Avatar";
import UserSearch from "../../components/UserSearch";
import { isolate, nameOf, speedOf, tcLabel } from "../../lib/format";

/** Quick-pairing presets, as minutes + increment seconds. */
const PRESETS = [
  [1, 0],
  [2, 1],
  [3, 0],
  [3, 2],
  [5, 0],
  [5, 3],
  [10, 0],
  [10, 5],
  [15, 10],
  [30, 0],
  [30, 20],
  [0, 0],
];

const MINUTE_CHOICES = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90];
const INCREMENT_CHOICES = [0, 1, 2, 3, 5, 10, 15, 20, 30];

function Section({ title, children, aside }) {
  return (
    <section className="surface-elev p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The player's own open challenge, while it waits for an opponent. */
function Waiting({ game, onCancel, busy }) {
  const { t } = useTranslation();
  return (
    <div className="surface-elev p-5 border border-amber-400/30 bg-amber-500/[0.04] animate-fade-up" role="status">
      <div className="flex items-center gap-4">
        <span className="relative flex w-10 h-10 flex-shrink-0" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
          <span className="relative w-10 h-10 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-xl">♞</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white">
            {game.invited_user
              ? t("waiting_for_player", { name: isolate(nameOf(game.invited_user, t)) })
              : t("searching_opponent")}
          </p>
          <p className="text-sm text-slate-400">
            {tcLabel(game.time_control_seconds, game.increment_seconds, t)} · {game.rated ? t("rated") : t("casual")}
          </p>
        </div>
        <button type="button" onClick={() => onCancel(game.id)} disabled={busy} className="btn btn-ghost">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

function ChallengeRow({ game, userId, onAccept, busy }) {
  const { t } = useTranslation();
  const creator = game.creator_user;
  const mine = game.creator_user_id === userId;
  return (
    <li className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition">
      <Avatar user={creator} size={36} />
      <div className="flex-1 min-w-0">
        <Link to={`/u/${creator?.username}`} className="font-semibold text-white hover:text-amber-300 truncate block">
          <bdi>{nameOf(creator, t)}</bdi>
        </Link>
        <div className="text-xs text-slate-400 tabular-nums">
          {creator?.online_rating}
          {creator?.is_provisional && "?"}
          {(game.min_opp_rating || game.max_opp_rating) && (
            <span className="ms-2 text-sky-300">
              {t("for_ratings", { min: game.min_opp_rating ?? "…", max: game.max_opp_rating ?? "…" })}
            </span>
          )}
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-1.5">
        <span className="chip chip-slate">{tcLabel(game.time_control_seconds, game.increment_seconds, t)}</span>
        <span className={`chip ${game.rated ? "chip-gold" : "chip-slate"}`}>{game.rated ? t("rated") : t("casual")}</span>
        <span className="chip chip-slate" title={t(`color_${game.creator_color}`)}>
          {game.creator_color === "white" ? "♔" : game.creator_color === "black" ? "♚" : "♔♚"}
        </span>
      </div>
      {mine ? (
        <span className="text-xs text-slate-500 w-20 text-center">{t("yours")}</span>
      ) : (
        <button type="button" onClick={() => onAccept(game.id)} disabled={busy} className="btn btn-primary px-4 py-2 w-20">
          {t("play_verb")}
        </button>
      )}
    </li>
  );
}

export default function PlayPage() {
  const { t } = useTranslation();
  const { user } = useUserAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  useDocumentTitle(t("play"));

  const [lobby, setLobby] = useState([]);
  const [lobbyLoaded, setLobbyLoaded] = useState(false);
  const [challenges, setChallenges] = useState({ incoming: [], outgoing: [] });
  const [activeGames, setActiveGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [quickRated, setQuickRated] = useState(true);
  const [showCustom, setShowCustom] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [form, setForm] = useState({ color: "random", minutes: 5, increment: 0, rated: true, min: "", max: "" });
  const [filters, setFilters] = useState({ rated: "all", speed: "any", compatible: false });

  const ratedFilter = filters.rated;
  const viewerRating = filters.compatible ? user?.online_rating : null;
  const loadLobby = useCallback(() => {
    const query = new URLSearchParams();
    if (ratedFilter !== "all") query.set("rated", ratedFilter);
    if (viewerRating) query.set("viewer_rating", viewerRating);
    api
      .get(`/games/lobby?${query}`)
      .then((res) => setLobby(res.data || []))
      .catch(() => {})
      .finally(() => setLobbyLoaded(true));
  }, [ratedFilter, viewerRating]);

  const loadMine = useCallback(() => {
    api.get("/games/me/challenges").then((res) => setChallenges(res.data)).catch(() => {});
    api
      .get("/games/me/games?status=active&per_page=10")
      .then((res) => setActiveGames((res.data.games || []).filter((g) => g.status === "active")))
      .catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    loadLobby();
    loadMine();
  }, [loadLobby, loadMine]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useLiveLobby(refresh);
  useEffect(() => {
    window.addEventListener(CHALLENGES_CHANGED_EVENT, loadMine);
    return () => window.removeEventListener(CHALLENGES_CHANGED_EVENT, loadMine);
  }, [loadMine]);

  // /play?opponent=username arrives from a profile's "Challenge" button.
  const opponentParam = params.get("opponent");
  useEffect(() => {
    if (!opponentParam) return;
    api
      .get(`/users/${encodeURIComponent(opponentParam)}`)
      .then((res) => {
        setOpponent(res.data.user);
        setShowCustom(true);
      })
      .catch(() => toast({ tone: "error", title: t("player_not_found") }))
      .finally(() => {
        params.delete("opponent");
        setParams(params, { replace: true });
      });
  }, [opponentParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const quickPlay = (minutes, increment) =>
    run(async () => {
      const res = await api.post("/games/quick", {
        time_control_seconds: minutes * 60,
        increment_seconds: increment,
        rated: quickRated,
      });
      if (res.data.matched) navigate(`/play/${res.data.game.id}`);
      else loadMine();
    });

  const accept = (id) =>
    run(async () => {
      const res = await api.post(`/games/${id}/accept`);
      navigate(`/play/${res.data.id}`);
    });

  const decline = (id) =>
    run(async () => {
      await api.post(`/games/${id}/decline`);
      loadMine();
    });

  const cancel = (id) =>
    run(async () => {
      await api.post(`/games/${id}/cancel`);
      refresh();
    });

  const createCustom = (event) => {
    event.preventDefault();
    run(async () => {
      await api.post("/games", {
        color: form.color,
        time_control_seconds: form.minutes * 60,
        increment_seconds: form.minutes ? form.increment : 0,
        rated: form.rated,
        ...(opponent
          ? { opponent_id: opponent.id }
          : { min_opp_rating: form.min || null, max_opp_rating: form.max || null }),
      });
      setOpponent(null);
      setShowCustom(false);
      refresh();
    });
  };

  const seek = challenges.outgoing.find((g) => !g.invited_user_id);
  const invitations = challenges.outgoing.filter((g) => g.invited_user_id);
  const visibleLobby = lobby.filter(
    (g) => filters.speed === "any" || speedOf(g.time_control_seconds, g.increment_seconds) === filters.speed,
  );

  const selectCls = "bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 text-sm";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{t("play")}</h1>
          <p className="text-slate-400 mt-1">{t("play_intro")}</p>
        </div>
        <Link to="/watch" className="btn btn-ghost">
          {t("watch_live")}
        </Link>
      </div>

      <div className="space-y-4 mb-6">
        {challenges.incoming.map((game) => (
          <div key={game.id} className="surface-elev p-4 border border-amber-400/40 flex flex-wrap items-center gap-3 animate-fade-up">
            <Avatar user={game.creator_user} size={40} />
            <div className="flex-1 min-w-[12rem]">
              <p className="font-semibold text-white">
                {game.rematch_of_game_id
                  ? t("rematch_offer_from", { name: isolate(nameOf(game.creator_user, t)) })
                  : t("challenge_from", { name: isolate(nameOf(game.creator_user, t)) })}
              </p>
              <p className="text-sm text-slate-400">
                {tcLabel(game.time_control_seconds, game.increment_seconds, t)} · {game.rated ? t("rated") : t("casual")}
              </p>
            </div>
            <button type="button" onClick={() => accept(game.id)} disabled={busy} className="btn btn-primary">
              {t("accept")}
            </button>
            <button type="button" onClick={() => decline(game.id)} disabled={busy} className="btn btn-ghost">
              {t("decline")}
            </button>
          </div>
        ))}
        {seek && <Waiting game={seek} onCancel={cancel} busy={busy} />}
        {invitations.map((game) => (
          <Waiting key={game.id} game={game} onCancel={cancel} busy={busy} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section
            title={t("quick_pairing")}
            aside={
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickRated}
                  onChange={(e) => setQuickRated(e.target.checked)}
                  className="w-4 h-4 accent-amber-500"
                />
                {t("rated")}
              </label>
            }
          >
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map(([minutes, increment]) => {
                const current =
                  seek &&
                  seek.time_control_seconds === minutes * 60 &&
                  seek.increment_seconds === increment &&
                  seek.rated === quickRated;
                return (
                  <button
                    key={`${minutes}+${increment}`}
                    type="button"
                    disabled={busy}
                    onClick={() => (current ? cancel(seek.id) : quickPlay(minutes, increment))}
                    className={`rounded-xl border px-2 py-3 text-center transition ${
                      current
                        ? "bg-amber-400 text-slate-950 border-amber-300"
                        : "bg-white/[0.04] border-white/10 hover:bg-white/10 hover:border-amber-400/40 text-white"
                    }`}
                  >
                    <span className="block text-lg font-bold tabular-nums" dir="ltr">
                      {minutes ? `${minutes}+${increment}` : "∞"}
                    </span>
                    <span className={`block text-[11px] ${current ? "text-slate-900" : "text-slate-400"}`}>
                      {current ? t("searching_short") : t(`speed_${speedOf(minutes * 60, increment)}`)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-3">{t("quick_pairing_hint")}</p>
          </Section>

          <Section
            title={t("custom_game")}
            aside={
              !showCustom && (
                <button type="button" onClick={() => setShowCustom(true)} className="btn btn-ghost px-3 py-1.5 text-sm">
                  {t("create_challenge")}
                </button>
              )
            }
          >
            {!showCustom ? (
              <p className="text-sm text-slate-400">{t("custom_game_intro")}</p>
            ) : (
              <form onSubmit={createCustom} className="space-y-4">
                <div>
                  <span className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    {t("opponent")}
                  </span>
                  {opponent ? (
                    <div className="surface-2 px-3 py-2 flex items-center gap-3">
                      <Avatar user={opponent} size={28} />
                      <span className="flex-1 text-sm text-white"><bdi>{nameOf(opponent, t)}</bdi></span>
                      <button type="button" onClick={() => setOpponent(null)} className="text-xs text-slate-400 hover:text-white">
                        {t("anyone_instead")}
                      </button>
                    </div>
                  ) : (
                    <UserSearch onSelect={setOpponent} excludeId={user?.id} placeholder={t("challenge_player_placeholder")} />
                  )}
                </div>

                <fieldset>
                  <legend className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("color")}</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: "white", label: t("color_white"), icon: "♔" },
                      { v: "random", label: t("color_random"), icon: "♔♚" },
                      { v: "black", label: t("color_black"), icon: "♚" },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.v}
                        aria-pressed={form.color === opt.v}
                        onClick={() => setForm({ ...form, color: opt.v })}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition border ${
                          form.color === opt.v
                            ? "bg-amber-500 text-slate-900 border-amber-400"
                            : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        <span className="block text-lg leading-none" aria-hidden="true">
                          {opt.icon}
                        </span>
                        <span className="block text-[11px] mt-1">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("minutes")}</span>
                    <select
                      className="input"
                      value={form.minutes}
                      onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
                    >
                      {MINUTE_CHOICES.map((m) => (
                        <option key={m} value={m}>
                          {m ? m : t("tc_unlimited")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("increment_seconds")}</span>
                    <select
                      className="input"
                      value={form.increment}
                      disabled={!form.minutes}
                      onChange={(e) => setForm({ ...form, increment: Number(e.target.value) })}
                    >
                      {INCREMENT_CHOICES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {!opponent && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("min_rating")}</span>
                      <input
                        type="number"
                        min="0"
                        max="4000"
                        inputMode="numeric"
                        placeholder={t("any")}
                        className="input"
                        value={form.min}
                        onChange={(e) => setForm({ ...form, min: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("max_rating")}</span>
                      <input
                        type="number"
                        min="0"
                        max="4000"
                        inputMode="numeric"
                        placeholder={t("any")}
                        className="input"
                        value={form.max}
                        onChange={(e) => setForm({ ...form, max: e.target.value })}
                      />
                    </label>
                  </div>
                )}

                <label className="flex items-center justify-between cursor-pointer surface-2 px-3 py-2.5">
                  <span className="text-sm text-slate-200 font-medium">{t("rated")}</span>
                  <input
                    type="checkbox"
                    checked={form.rated}
                    onChange={(e) => setForm({ ...form, rated: e.target.checked })}
                    className="w-5 h-5 accent-amber-500"
                  />
                </label>

                <div className="flex gap-2">
                  <button type="submit" disabled={busy || (!opponent && Boolean(seek))} className="btn btn-primary flex-1">
                    {opponent ? t("send_challenge") : t("post_to_lobby")}
                  </button>
                  <button type="button" onClick={() => setShowCustom(false)} className="btn btn-ghost">
                    {t("cancel")}
                  </button>
                </div>
                {!opponent && seek && <p className="text-xs text-slate-400">{t("one_seek_at_a_time")}</p>}
              </form>
            )}
          </Section>

          {activeGames.length > 0 && (
            <Section title={t("your_games")}>
              <ul className="space-y-2">
                {activeGames.map((g) => {
                  const opp = g.white_user?.id === user?.id ? g.black_user : g.white_user;
                  const myTurn = (g.turn === "white" ? g.white_user?.id : g.black_user?.id) === user?.id;
                  return (
                    <li key={g.id}>
                      <Link
                        to={`/play/${g.id}`}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${
                          myTurn ? "bg-amber-500/10 border-amber-400/40" : "bg-white/[0.03] border-white/10 hover:border-white/20"
                        }`}
                      >
                        <Avatar user={opp} size={32} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-white font-medium truncate"><bdi>{nameOf(opp, t)}</bdi></span>
                          <span className="block text-xs text-slate-400">
                            {tcLabel(g.time_control_seconds, g.increment_seconds, t)}
                          </span>
                        </span>
                        <span className={`chip ${myTurn ? "chip-gold" : "chip-slate"}`}>
                          {myTurn ? t("your_turn") : t("their_turn")}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>

        <div className="lg:col-span-3">
          <Section
            title={
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                {t("open_challenges")}
                <span className="text-sm font-normal text-slate-500">({visibleLobby.length})</span>
              </span>
            }
          >
            <div className="flex flex-wrap gap-2 items-center mb-3">
              <select
                aria-label={t("rated")}
                value={filters.rated}
                onChange={(e) => setFilters({ ...filters, rated: e.target.value })}
                className={selectCls}
              >
                <option value="all">{t("rated_and_casual")}</option>
                <option value="true">{t("rated")}</option>
                <option value="false">{t("casual")}</option>
              </select>
              <select
                aria-label={t("time_control")}
                value={filters.speed}
                onChange={(e) => setFilters({ ...filters, speed: e.target.value })}
                className={selectCls}
              >
                <option value="any">{t("any_tc")}</option>
                {["bullet", "blitz", "rapid", "classical", "unlimited"].map((speed) => (
                  <option key={speed} value={speed}>
                    {t(`speed_${speed}`)}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.compatible}
                  onChange={(e) => setFilters({ ...filters, compatible: e.target.checked })}
                  className="accent-amber-500"
                />
                {t("only_compatible")}
              </label>
            </div>

            {!lobbyLoaded ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-xl shimmer" />
                ))}
              </div>
            ) : visibleLobby.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-4xl mb-3 text-slate-600" aria-hidden="true">
                  ♟
                </div>
                <p>{t("no_open_challenges")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {visibleLobby.map((g) => (
                  <ChallengeRow key={g.id} game={g} userId={user?.id} onAccept={accept} busy={busy} />
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
