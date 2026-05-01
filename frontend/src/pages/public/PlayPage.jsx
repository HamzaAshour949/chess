import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";

const TIME_CONTROLS = [
  { value: 0, key: "tc_unlimited" },
  { value: 60, key: "tc_1_min" },
  { value: 180, key: "tc_3_min" },
  { value: 300, key: "tc_5_min" },
  { value: 600, key: "tc_10_min" },
  { value: 900, key: "tc_15_min" },
  { value: 1800, key: "tc_30_min" },
];

function tcLabel(sec, t) {
  if (sec === 0) return t("tc_unlimited");
  if (sec >= 60) return `${Math.round(sec / 60)} min`;
  return `${sec}s`;
}

function ChallengeCard({ g, currentUserId, onAccept, onCancel, t }) {
  const isMine = g.creator_user_id === currentUserId;
  const creator = g.creator_user || (
    g.white_user_id === g.creator_user_id ? g.white_user :
    g.black_user_id === g.creator_user_id ? g.black_user :
    g.white_user || g.black_user);
  return (
    <div className="surface p-4 flex items-center gap-4 hover:border-amber-500/30 transition">
      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-slate-200">
        {(creator?.display_name || "?").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold truncate">{creator?.display_name || t("user")}</div>
        <div className="text-xs text-slate-400 flex flex-wrap gap-1.5 mt-0.5">
          <span className="chip chip-slate">{creator?.online_rating || "—"}</span>
          <span className="chip chip-slate">
            {tcLabel(g.time_control_seconds, t)}
            {g.increment_seconds > 0 && ` +${g.increment_seconds}`}
          </span>
          <span className={`chip ${g.rated ? "chip-gold" : "chip-slate"}`}>{g.rated ? t("rated") : t("casual")}</span>
          <span className="chip chip-slate">
            {g.creator_color === "white" ? "♔" : g.creator_color === "black" ? "♚" : "♔/♚"}
          </span>
          {(g.min_opp_rating || g.max_opp_rating) && (
            <span className="chip chip-blue">
              {g.min_opp_rating || "?"}–{g.max_opp_rating || "?"}
            </span>
          )}
        </div>
      </div>
      {isMine ? (
        <button onClick={() => onCancel(g.id)} className="btn btn-ghost">{t("cancel_challenge")}</button>
      ) : (
        <button onClick={() => onAccept(g.id)} className="btn btn-primary">{t("accept")}</button>
      )}
    </div>
  );
}

export default function PlayPage() {
  const { t } = useTranslation();
  const { user } = useUserAuth();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState([]);
  const [myActive, setMyActive] = useState([]);
  const [myOpen, setMyOpen] = useState(null);
  const [form, setForm] = useState({
    color: "random", tc: 300, increment: 0, rated: true,
    min_opp_rating: "", max_opp_rating: "",
  });
  const [filters, setFilters] = useState({
    rated: "all", color: "any", tc_bucket: "any", compatible: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadLobby = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.rated !== "all") params.set("rated", filters.rated);
    if (filters.color !== "any") params.set("color", filters.color);
    if (filters.tc_bucket === "bullet") { params.set("max_tc", 60); }
    else if (filters.tc_bucket === "blitz") { params.set("min_tc", 60); params.set("max_tc", 600); }
    else if (filters.tc_bucket === "rapid") { params.set("min_tc", 600); params.set("max_tc", 1800); }
    else if (filters.tc_bucket === "classical") { params.set("min_tc", 1800); }
    if (filters.compatible && user?.online_rating) params.set("viewer_rating", user.online_rating);

    api.get(`/games/lobby?${params.toString()}`).then((r) => {
      const list = r.data || [];
      setLobby(list);
      const mine = list.find((g) => g.creator_user_id === user?.id);
      setMyOpen(mine || null);
    });
  }, [user?.id, user?.online_rating, filters]);

  const loadActive = useCallback(() => {
    api.get("/games/me/games?status=active").then((r) =>
      setMyActive((r.data || []).filter((g) => g.status === "active"))
    );
  }, []);

  useEffect(() => {
    loadLobby();
    loadActive();
    const id = setInterval(() => { loadLobby(); loadActive(); }, 4000);
    return () => clearInterval(id);
  }, [loadLobby, loadActive]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api.post("/games", {
        color: form.color,
        time_control_seconds: form.tc,
        increment_seconds: form.increment,
        rated: form.rated,
        min_opp_rating: form.min_opp_rating || null,
        max_opp_rating: form.max_opp_rating || null,
      });
      setMyOpen(r.data);
      loadLobby();
    } catch (err) { setError(err.response?.data?.error || "Failed"); }
    finally { setBusy(false); }
  };

  const accept = async (id) => {
    try {
      const r = await api.post(`/games/${id}/accept`);
      navigate(`/play/${r.data.id}`);
    } catch (err) { setError(err.response?.data?.error || "Failed"); }
  };

  const cancel = async (id) => {
    try { await api.post(`/games/${id}/cancel`); setMyOpen(null); loadLobby(); }
    catch (err) { setError(err.response?.data?.error || "Failed"); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{t("play")}</h1>
          <p className="text-slate-400 mt-1">{t("play_intro")}</p>
        </div>
        <Link to="/watch" className="btn btn-ghost">👁 {t("watch_live")}</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="surface-elev p-6">
            <h2 className="text-lg font-bold text-white mb-4">{t("challenge_form_title")}</h2>
            <form onSubmit={create} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("color")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: "white", icon: "♔" },
                    { v: "random", icon: "♔/♚" },
                    { v: "black", icon: "♚" },
                  ].map((opt) => (
                    <button type="button" key={opt.v}
                      onClick={() => setForm({ ...form, color: opt.v })}
                      className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition border ${
                        form.color === opt.v
                          ? "bg-amber-500 text-slate-900 border-amber-400"
                          : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                      }`}>
                      <span className="text-lg block">{opt.icon}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("time_control")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_CONTROLS.map((tc) => (
                    <button key={tc.value} type="button"
                      onClick={() => setForm({ ...form, tc: tc.value })}
                      className={`px-2 py-2 rounded-lg text-xs font-semibold transition border ${
                        form.tc === tc.value
                          ? "bg-amber-500 text-slate-900 border-amber-400"
                          : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                      }`}>{t(tc.key)}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("increment_seconds")}</label>
                <input type="number" min="0" max="60" value={form.increment}
                  onChange={(e) => setForm({ ...form, increment: parseInt(e.target.value || "0", 10) })}
                  className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-2 text-sm text-white" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("min_rating")}</label>
                  <input type="number" min="0" max="3500" placeholder={t("any")} value={form.min_opp_rating}
                    onChange={(e) => setForm({ ...form, min_opp_rating: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">{t("max_rating")}</label>
                  <input type="number" min="0" max="3500" placeholder={t("any")} value={form.max_opp_rating}
                    onChange={(e) => setForm({ ...form, max_opp_rating: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-2 text-sm text-white" />
                </div>
              </div>

              <label className="flex items-center justify-between cursor-pointer surface-2 px-3 py-2.5">
                <span className="text-sm text-slate-200 font-medium">{t("rated")}</span>
                <input type="checkbox" checked={form.rated}
                  onChange={(e) => setForm({ ...form, rated: e.target.checked })}
                  className="w-5 h-5 accent-amber-500" />
              </label>

              {error && <div className="chip chip-red w-full justify-center py-2">{error}</div>}

              <button type="submit" disabled={busy || !!myOpen} className="btn btn-primary btn-lg w-full">
                {busy ? "…" : t("create_challenge")}
              </button>
              {myOpen && (
                <p className="text-xs text-slate-400 text-center">
                  {t("link_pending")} —
                  <button type="button" onClick={() => cancel(myOpen.id)} className="text-amber-400 hover:text-amber-300 ms-1">
                    {t("cancel_challenge")}
                  </button>
                </p>
              )}
            </form>
          </div>

          {myActive.length > 0 && (
            <div className="surface-elev p-6">
              <h2 className="text-lg font-bold text-white mb-4">{t("active_games")}</h2>
              <ul className="space-y-2">
                {myActive.map((g) => {
                  const opp = g.white_user_id === user.id ? g.black_user : g.white_user;
                  return (
                    <li key={g.id}>
                      <Link to={`/play/${g.id}`} className="flex items-center gap-3 surface-2 px-3 py-2.5 hover:border-amber-500/30 transition">
                        <span className="text-slate-400 text-sm">vs</span>
                        <span className="text-white font-medium flex-1 truncate">{opp?.display_name || "—"}</span>
                        <span className="chip chip-slate">{g.move_count} ply</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>

        {/* Lobby */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {t("open_challenges")}
            </h2>
            <span className="text-xs text-slate-500">{lobby.length}</span>
          </div>

          {/* Filter bar */}
          <div className="surface p-3 mb-4 flex flex-wrap gap-2 items-center text-xs">
            <select value={filters.rated} onChange={(e) => setFilters({ ...filters, rated: e.target.value })}
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-slate-200">
              <option value="all">{t("all")}</option>
              <option value="true">{t("rated")}</option>
              <option value="false">{t("casual")}</option>
            </select>
            <select value={filters.color} onChange={(e) => setFilters({ ...filters, color: e.target.value })}
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-slate-200">
              <option value="any">{t("any_color")}</option>
              <option value="white">♔ {t("color_white")}</option>
              <option value="black">♚ {t("color_black")}</option>
              <option value="random">♔/♚ {t("color_random")}</option>
            </select>
            <select value={filters.tc_bucket} onChange={(e) => setFilters({ ...filters, tc_bucket: e.target.value })}
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-slate-200">
              <option value="any">{t("any_tc")}</option>
              <option value="bullet">{t("bullet")}</option>
              <option value="blitz">{t("blitz")}</option>
              <option value="rapid">{t("rapid")}</option>
              <option value="classical">{t("classical")}</option>
            </select>
            <label className="flex items-center gap-1.5 text-slate-300">
              <input type="checkbox" checked={filters.compatible}
                onChange={(e) => setFilters({ ...filters, compatible: e.target.checked })}
                className="accent-amber-500" />
              {t("only_compatible")}
            </label>
          </div>

          {lobby.length === 0 ? (
            <div className="surface-elev p-12 text-center text-slate-400">{t("no_open_challenges")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lobby.map((g) => (
                <ChallengeCard key={g.id} g={g} currentUserId={user?.id}
                  onAccept={accept} onCancel={cancel} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
