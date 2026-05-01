import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api";

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
        active
          ? "bg-amber-500 text-slate-900"
          : "bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >{children}</button>
  );
}

function ProfileTab() {
  const { t } = useTranslation();
  const { user, updateProfile } = useUserAuth();
  const [form, setForm] = useState({
    display_name: user?.display_name || "",
    country: user?.country || "",
    avatar_url: user?.avatar_url || "",
  });
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setInfo(""); setError("");
    try {
      await updateProfile(form);
      setInfo(t("save") + " ✓");
    } catch (err) { setError(err.response?.data?.error || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="surface-elev p-6 max-w-xl">
      <h2 className="text-lg font-bold text-white mb-4">{t("my_profile")}</h2>
      <form onSubmit={submit} className="space-y-4">
        <div className="surface-2 p-3 text-sm">
          <div className="text-slate-400 text-xs uppercase tracking-wider">{t("username")}</div>
          <div className="text-white font-medium">@{user?.username}</div>
        </div>
        <div className="surface-2 p-3 text-sm">
          <div className="text-slate-400 text-xs uppercase tracking-wider">{t("email")}</div>
          <div className="text-white font-medium">{user?.email}</div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("display_name")}</label>
          <input className="input" maxLength={120}
            value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("country")}</label>
          <input className="input" maxLength={100}
            value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("image")}</label>
          <input className="input" placeholder="https://…"
            value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} />
        </div>
        {error && <div className="chip chip-red w-full justify-center py-2">{error}</div>}
        {info && <div className="chip chip-green w-full justify-center py-2">{info}</div>}
        <button disabled={busy} className="btn btn-primary">{t("save")}</button>
      </form>
    </div>
  );
}

function LinkTab() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { user, refresh } = useUserAuth();

  const [requests, setRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = () => api.get("/links/my-requests?lang=" + lang).then((r) => setRequests(r.data || []));

  useEffect(() => { reload(); }, [lang]);

  useEffect(() => {
    if (!searchTerm) { setResults([]); return; }
    const id = setTimeout(() => {
      api.get(`/players?lang=${lang}&search=${encodeURIComponent(searchTerm)}&per_page=8`)
        .then((r) => setResults(r.data.players || []));
    }, 250);
    return () => clearTimeout(id);
  }, [searchTerm, lang]);

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await api.post("/links/request", { player_id: selected.id, message });
      setSelected(null); setMessage(""); setSearchTerm(""); setResults([]);
      reload();
    } catch (err) { setError(err.response?.data?.error || "Failed"); }
    finally { setBusy(false); }
  };

  if (user?.linked_player_id) {
    return (
      <div className="surface-elev p-6 max-w-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">{t("link_profile")}</h2>
          <span className="chip chip-gold">{t("link_approved")}</span>
        </div>
        <p className="text-slate-300 mb-4">
          {t("linked_to", { name: user.linked_player_name })}
        </p>
        <Link to={`/players/${user.linked_player_id}`} className="btn btn-primary">{t("view_profile")}</Link>
        <p className="text-xs text-slate-500 mt-4">{t("link_security_note")}</p>
      </div>
    );
  }

  const pending = requests.find((r) => r.status === "pending");

  return (
    <div className="space-y-6 max-w-xl">
      <div className="surface-elev p-6">
        <h2 className="text-lg font-bold text-white mb-2">{t("link_profile")}</h2>
        <p className="text-sm text-slate-300 mb-2">{t("link_intro")}</p>
        <p className="text-xs text-amber-300/90 mb-5 surface-2 p-3 border border-amber-400/20">
          🔒 {t("link_security_note")}
        </p>

        {pending ? (
          <div className="surface-2 p-4 flex items-center justify-between">
            <div>
              <div className="chip chip-slate mb-1">{t("link_pending")}</div>
              <div className="text-white font-medium">{pending.player?.name}</div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("search_player")}</label>
              <input className="input" value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSelected(null); }} />
              {results.length > 0 && !selected && (
                <ul className="mt-2 surface max-h-56 overflow-y-auto">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setSelected(p)}
                        className="w-full text-start px-3 py-2 hover:bg-white/5 flex items-center gap-3">
                        {p.image_url
                          ? <img src={p.image_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          : <span className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">♟</span>}
                        <span className="text-slate-200">{p.name}</span>
                        {p.title && <span className="chip chip-gold ms-auto">{p.title}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selected && (
              <div className="surface-2 p-3 flex items-center gap-3">
                <span className="text-slate-200 flex-1">{t("select_a_player")}: <span className="font-bold text-white">{selected.name}</span></span>
                <button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("evidence_message")}</label>
              <textarea className="input min-h-[100px]" rows={4} maxLength={1000}
                value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {error && <div className="chip chip-red w-full justify-center py-2">{error}</div>}
            <button disabled={!selected || busy} className="btn btn-primary">{t("request_link")}</button>
          </form>
        )}
      </div>

      {requests.length > 0 && (
        <div className="surface-elev p-6">
          <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">{t("review_status")}</h3>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="surface-2 p-3 flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">{r.player?.name}</div>
                  <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</div>
                  {r.admin_note && <div className="text-xs text-slate-400 mt-1 italic">"{r.admin_note}"</div>}
                </div>
                <span className={`chip ${
                  r.status === "approved" ? "chip-green" :
                  r.status === "rejected" ? "chip-red" : "chip-slate"
                }`}>{t(r.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GamesTab() {
  const { t } = useTranslation();
  const { user } = useUserAuth();
  const [games, setGames] = useState([]);
  const [filter, setFilter] = useState("active");

  useEffect(() => {
    api.get(`/games/me/games?status=${filter}`).then((r) => setGames(r.data || []));
  }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <TabButton active={filter === "active"} onClick={() => setFilter("active")}>{t("active_games")}</TabButton>
        <TabButton active={filter === "finished"} onClick={() => setFilter("finished")}>{t("finished_games")}</TabButton>
      </div>

      {games.length === 0 ? (
        <div className="surface-elev p-12 text-center text-slate-400">{t("no_games_yet")}</div>
      ) : (
        <ul className="space-y-2">
          {games.map((g) => {
            const opp = g.white_user?.id === user.id ? g.black_user : g.white_user;
            const youWon =
              (g.status === "white_wins" && g.white_user?.id === user.id) ||
              (g.status === "black_wins" && g.black_user?.id === user.id);
            const youLost = ["white_wins", "black_wins"].includes(g.status) && !youWon &&
              (g.white_user?.id === user.id || g.black_user?.id === user.id);
            return (
              <li key={g.id}>
                <Link to={`/play/${g.id}`} className="surface-elev p-4 flex items-center gap-4 hover:border-amber-500/30 transition">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold truncate">vs {opp?.display_name || "—"}</div>
                    <div className="text-xs text-slate-500">{new Date(g.created_at).toLocaleString()} · {g.move_count} ply</div>
                  </div>
                  <span className={`chip ${
                    g.status === "active" || g.status === "open" ? "chip-green" :
                    youWon ? "chip-gold" : youLost ? "chip-red" : "chip-slate"
                  }`}>
                    {g.status === "active" ? t("live_now") :
                     g.status === "open" ? t("pending") :
                     g.status === "draw" ? t("draws") :
                     youWon ? t("wins") : youLost ? t("losses") : g.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NotificationsTab() {
  const { t } = useTranslation();
  const { user, updateProfile } = useUserAuth();
  const [prefs, setPrefs] = useState({
    notif_email: user?.notif_email ?? true,
    notif_dm: user?.notif_dm ?? true,
    notif_game_chat: user?.notif_game_chat ?? true,
    notif_sound: user?.notif_sound ?? true,
  });
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPrefs({
      notif_email: user.notif_email ?? true,
      notif_dm: user.notif_dm ?? true,
      notif_game_chat: user.notif_game_chat ?? true,
      notif_sound: user.notif_sound ?? true,
    });
  }, [user]);

  const toggle = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setBusy(true);
    try {
      await updateProfile(next);
      setInfo(t("save") + " ✓");
      setTimeout(() => setInfo(""), 1500);
    } catch (e) { /* keep local */ }
    finally { setBusy(false); }
  };

  const Row = ({ k, label, desc }) => (
    <label className="flex items-center justify-between cursor-pointer surface-2 px-4 py-3">
      <div>
        <div className="text-white font-medium text-sm">{label}</div>
        {desc && <div className="text-xs text-slate-400 mt-0.5">{desc}</div>}
      </div>
      <input type="checkbox" checked={prefs[k]} onChange={() => toggle(k)} disabled={busy}
        className="w-5 h-5 accent-amber-500" />
    </label>
  );

  return (
    <div className="surface-elev p-6 max-w-xl space-y-3">
      <h2 className="text-lg font-bold text-white mb-2">{t("notifications")}</h2>
      <Row k="notif_email" label={t("notif_email")} desc={t("notif_email_desc")} />
      <Row k="notif_dm" label={t("notif_dm")} desc={t("notif_dm_desc")} />
      <Row k="notif_game_chat" label={t("notif_game_chat")} desc={t("notif_game_chat_desc")} />
      <Row k="notif_sound" label={t("notif_sound")} desc={t("notif_sound_desc")} />
      {info && <p className="text-xs text-emerald-400">{info}</p>}
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "profile";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">{t("my_profile")}</h1>
      <div className="flex gap-2 mb-6 flex-wrap">
        <TabButton active={tab === "profile"} onClick={() => setParams({ tab: "profile" })}>{t("profile")}</TabButton>
        <TabButton active={tab === "notifications"} onClick={() => setParams({ tab: "notifications" })}>{t("notifications")}</TabButton>
        <TabButton active={tab === "link"} onClick={() => setParams({ tab: "link" })}>{t("link_profile")}</TabButton>
        <TabButton active={tab === "games"} onClick={() => setParams({ tab: "games" })}>{t("my_games")}</TabButton>
      </div>

      {tab === "profile" && <ProfileTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "link" && <LinkTab />}
      {tab === "games" && <GamesTab />}
    </div>
  );
}
