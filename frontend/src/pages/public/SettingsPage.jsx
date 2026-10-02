import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError, fieldErrors } from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useDebounced } from "../../hooks/useDebounced";
import { useFetch } from "../../hooks/useFetch";
import { useToast } from "../../components/ui/Toaster";
import { useConfirm } from "../../components/ui/Dialog";
import PasswordInput from "../../components/ui/PasswordInput";
import Avatar from "../../components/Avatar";
import GameRow from "../../components/GameRow";
import { formatDate, nameOf } from "../../lib/format";
import { setSoundEnabled } from "../../lib/sound";

const TABS = ["profile", "security", "notifications", "privacy", "link", "games"];

function Card({ title, description, children, tone }) {
  return (
    <section className={`surface-elev p-6 ${tone === "danger" ? "border border-rose-500/30" : ""}`}>
      <h2 className={`text-lg font-bold ${tone === "danger" ? "text-rose-300" : "text-white"}`}>{title}</h2>
      {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-300 mb-1.5">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-400 mt-1" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ profile

function ProfileTab() {
  const { t } = useTranslation();
  const { user, updateProfile, uploadAvatar } = useUserAuth();
  const { lang, setLanguage } = useLanguage();
  const { toast } = useToast();
  const fileInput = useRef(null);
  const [form, setForm] = useState({ display_name: user.display_name ?? "", country: user.country ?? "" });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await updateProfile(form);
      toast({ tone: "success", title: t("saved") });
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ tone: "error", title: t("image_too_large") });
      return;
    }
    setUploading(true);
    try {
      await uploadAvatar(file);
      toast({ tone: "success", title: t("avatar_updated") });
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    try {
      await updateProfile({ avatar_url: null });
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    }
  };

  return (
    <div className="space-y-6">
      <Card title={t("profile_picture")} description={t("profile_picture_desc")}>
        <div className="flex items-center gap-5">
          <Avatar user={user} size={80} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} />
            <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? t("uploading") : t("upload_photo")}
            </button>
            {user.avatar_url && (
              <button type="button" className="btn btn-ghost" onClick={removeAvatar}>
                {t("remove")}
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card title={t("my_profile")}>
        <form onSubmit={save} className="space-y-4 max-w-lg">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="surface-2 p-3 text-sm">
              <div className="text-slate-400 text-xs uppercase tracking-wider">{t("username")}</div>
              <div className="text-white font-medium"><bdi>@{user.username}</bdi></div>
            </div>
            <div className="surface-2 p-3 text-sm min-w-0">
              <div className="text-slate-400 text-xs uppercase tracking-wider">{t("email")}</div>
              <div className="text-white font-medium truncate" dir="ltr">
                {user.email}
              </div>
            </div>
          </div>
          <Field label={t("display_name")} htmlFor="display_name" hint={t("display_name_hint")}>
            <input
              id="display_name"
              className="input"
              maxLength={120}
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </Field>
          <Field label={t("country")} htmlFor="country">
            <input
              id="country"
              className="input"
              maxLength={100}
              autoComplete="country-name"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </Field>
          <Field label={t("language")} htmlFor="lang" hint={t("language_hint")}>
            <select id="lang" className="input" value={lang} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </Field>
          <div className="flex items-center gap-3">
            <button disabled={busy} className="btn btn-primary">
              {t("save")}
            </button>
            <Link to={`/u/${user.username}`} className="text-sm text-amber-400 hover:text-amber-300">
              {t("view_public_profile")} →
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------- security

function SecurityTab() {
  const { t } = useTranslation();
  const { changePassword, signOutEverywhere, deleteAccount } = useUserAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: "", next: "", repeat: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (form.next !== form.repeat) {
      setErrors({ repeat: t("passwords_dont_match") });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", repeat: "" });
      toast({ tone: "success", title: t("password_changed"), body: t("password_changed_body") });
    } catch (error) {
      const fields = fieldErrors(error);
      setErrors({ current: fields.current_password, next: fields.new_password, general: fields.current_password || fields.new_password ? null : apiError(error) });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    const ok = await confirm({ title: t("sign_out_everywhere"), body: t("sign_out_everywhere_body"), confirmLabel: t("sign_out_everywhere") });
    if (!ok) return;
    try {
      await signOutEverywhere();
      toast({ tone: "success", title: t("signed_out_elsewhere") });
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    }
  };

  const remove = async () => {
    const password = await confirm({
      title: t("delete_account_title"),
      body: t("delete_account_body"),
      tone: "danger",
      confirmLabel: t("delete_account"),
      input: { label: t("password"), type: "password", required: true, autoComplete: "current-password" },
    });
    if (!password) return;
    try {
      await deleteAccount(password);
      navigate("/");
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    }
  };

  return (
    <div className="space-y-6">
      <Card title={t("change_password")} description={t("change_password_desc")}>
        <form onSubmit={submit} className="space-y-4 max-w-md">
          <Field label={t("current_password")} htmlFor="current_password" error={errors.current}>
            <PasswordInput id="current_password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          </Field>
          <Field label={t("new_password")} htmlFor="new_password" error={errors.next} hint={t("password_hint")}>
            <PasswordInput
              id="new_password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })}
            />
          </Field>
          <Field label={t("repeat_password")} htmlFor="repeat_password" error={errors.repeat}>
            <PasswordInput
              id="repeat_password"
              required
              autoComplete="new-password"
              value={form.repeat}
              onChange={(e) => setForm({ ...form, repeat: e.target.value })}
            />
          </Field>
          {errors.general && <p className="text-sm text-rose-400">{errors.general}</p>}
          <button disabled={busy} className="btn btn-primary">
            {t("change_password")}
          </button>
        </form>
      </Card>

      <Card title={t("sessions")} description={t("sessions_desc")}>
        <button type="button" className="btn btn-ghost" onClick={revoke}>
          {t("sign_out_everywhere")}
        </button>
      </Card>

      <Card title={t("delete_account")} description={t("delete_account_desc")} tone="danger">
        <button type="button" className="btn btn-danger" onClick={remove}>
          {t("delete_account")}
        </button>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------ notifications

function Toggle({ label, description, checked, disabled, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer surface-2 px-4 py-3">
      <span>
        <span className="block text-white font-medium text-sm">{label}</span>
        {description && <span className="block text-xs text-slate-400 mt-0.5">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} className="w-5 h-5 accent-amber-500 flex-shrink-0" />
    </label>
  );
}

function NotificationsTab() {
  const { t } = useTranslation();
  const { user, updateProfile } = useUserAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const toggle = async (key) => {
    setBusy(true);
    try {
      const next = !user[key];
      await updateProfile({ [key]: next });
      if (key === "notif_sound") setSoundEnabled(next);
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t("notifications")} description={t("notifications_desc")}>
      <div className="space-y-3 max-w-xl">
        {["notif_sound", "notif_dm", "notif_game_chat", "notif_email"].map((key) => (
          <Toggle
            key={key}
            label={t(key)}
            description={t(`${key}_desc`)}
            checked={Boolean(user[key])}
            disabled={busy}
            onChange={() => toggle(key)}
          />
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ privacy

function PrivacyTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [blocked, setBlocked] = useState(null);

  const load = useCallback(() => {
    api
      .get("/messages/blocks")
      .then((res) => setBlocked(res.data))
      .catch(() => setBlocked([]));
  }, []);
  useEffect(load, [load]);

  const unblock = async (id) => {
    try {
      await api.delete(`/messages/blocks/${id}`);
      load();
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    }
  };

  return (
    <Card title={t("blocked_players")} description={t("blocked_players_desc")}>
      {blocked === null ? (
        <div className="h-16 rounded-xl shimmer" />
      ) : blocked.length === 0 ? (
        <p className="text-sm text-slate-500">{t("no_blocked_players")}</p>
      ) : (
        <ul className="space-y-2 max-w-xl">
          {blocked.map((person) => (
            <li key={person.id} className="surface-2 px-4 py-3 flex items-center gap-3">
              <Avatar user={person} size={32} />
              <span className="flex-1 min-w-0">
                <span className="block text-white text-sm truncate"><bdi>{nameOf(person, t)}</bdi></span>
                <span className="block text-xs text-slate-500"><bdi>@{person.username}</bdi></span>
              </span>
              <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => unblock(person.id)}>
                {t("unblock")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------ profile links

function LinkTab() {
  const { t, i18n } = useTranslation();
  const { lang } = useLanguage();
  const { user } = useUserAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api
      .get(`/links/my-requests?lang=${lang}`)
      .then((r) => setRequests(r.data || []))
      .catch(() => {});
  }, [lang]);
  useEffect(reload, [reload, user.linked_player_id]);

  const term = useDebounced(searchTerm.trim(), 250);
  const { data: found } = useFetch(term ? `/players?lang=${lang}&search=${encodeURIComponent(term)}&per_page=8` : null);
  const results = searchTerm.trim() ? (found?.players ?? []) : [];

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await api.post("/links/request", { player_id: selected.id, message });
      setSelected(null);
      setMessage("");
      setSearchTerm("");
      toast({ tone: "success", title: t("link_request_sent") });
      reload();
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    } finally {
      setBusy(false);
    }
  };

  const pending = requests.find((r) => r.status === "pending");

  return (
    <div className="space-y-6 max-w-2xl">
      {user.linked_player_id ? (
        <Card title={t("link_profile")}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-slate-200">{t("linked_to", { name: user.linked_player_name })}</p>
            <Link to={`/players/${user.linked_player_id}`} className="btn btn-primary">
              {t("view_profile")}
            </Link>
          </div>
          <p className="text-xs text-slate-500 mt-4">{t("link_security_note")}</p>
        </Card>
      ) : (
        <Card title={t("link_profile")} description={t("link_intro")}>
          <p className="text-xs text-amber-200/90 mb-5 surface-2 p-3 border border-amber-400/20">🔒 {t("link_security_note")}</p>
          {pending ? (
            <div className="surface-2 p-4">
              <span className="chip chip-slate mb-1">{t("link_pending")}</span>
              <div className="text-white font-medium mt-1">{pending.player?.name}</div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label={t("search_player")} htmlFor="link-search">
                <input
                  id="link-search"
                  type="search"
                  className="input"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSelected(null);
                  }}
                />
              </Field>
              {results.length > 0 && !selected && (
                <ul className="surface max-h-56 overflow-y-auto p-1">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(p)}
                        className="w-full text-start px-3 py-2 rounded-lg hover:bg-white/5 flex items-center gap-3"
                      >
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">♟</span>
                        )}
                        <span className="text-slate-200">{p.name}</span>
                        {p.title && <span className="chip chip-gold ms-auto">{p.title}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <div className="surface-2 p-3 flex items-center gap-3">
                  <span className="text-slate-200 flex-1">
                    {t("select_a_player")}: <span className="font-bold text-white">{selected.name}</span>
                  </span>
                  <button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-white" aria-label={t("remove")}>
                    ✕
                  </button>
                </div>
              )}
              <Field label={t("evidence_message")} htmlFor="link-message">
                <textarea
                  id="link-message"
                  className="input min-h-[100px]"
                  rows={4}
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Field>
              <button disabled={!selected || busy} className="btn btn-primary">
                {t("request_link")}
              </button>
            </form>
          )}
        </Card>
      )}

      {requests.length > 0 && (
        <Card title={t("review_status")}>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="surface-2 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white font-medium truncate">{r.player?.name}</div>
                  <div className="text-xs text-slate-500">{formatDate(r.created_at, i18n.language)}</div>
                  {r.admin_note && <div className="text-xs text-slate-400 mt-1 italic">“{r.admin_note}”</div>}
                </div>
                <span className={`chip ${r.status === "approved" ? "chip-green" : r.status === "rejected" ? "chip-red" : "chip-slate"}`}>
                  {t(r.status)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- games

function GamesTab() {
  const { t } = useTranslation();
  const { user } = useUserAuth();
  const [filter, setFilter] = useState("finished");
  const [page, setPage] = useState(1);
  const { data: fetched, error } = useFetch(`/games/me/games?status=${filter}&page=${page}&per_page=15`);
  const data = fetched ?? (error ? { games: [], pages: 1 } : null);

  const tab = (value, label) => (
    <button
      type="button"
      onClick={() => {
        setFilter(value);
        setPage(1);
      }}
      aria-pressed={filter === value}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
        filter === value ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card title={t("my_games")}>
      <div className="flex gap-1 mb-4">
        {tab("finished", t("finished_games"))}
        {tab("active", t("active_games"))}
      </div>
      {!data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl shimmer" />
          ))}
        </div>
      ) : data.games.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-slate-400 mb-4">{t("no_games_yet")}</p>
          <Link to="/play" className="btn btn-primary">
            {t("play_now")}
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-white/5">
            {data.games.map((game) =>
              game.status === "open" ? (
                <li key={game.id}>
                  <Link to={`/play/${game.id}`} className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-white/[0.04]">
                    <span className="text-slate-300">{t("open_challenge")}</span>
                    <span className="chip chip-slate">{t("pending")}</span>
                  </Link>
                </li>
              ) : (
                <GameRow key={game.id} game={game} perspectiveId={user.id} />
              ),
            )}
          </ul>
          {data.pages > 1 && (
            <div className="flex items-center justify-between mt-3 text-sm">
              <button type="button" className="btn btn-ghost px-3 py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t("previous")}
              </button>
              <span className="text-slate-400">
                {t("page")} {page} {t("of")} {data.pages}
              </span>
              <button type="button" className="btn btn-ghost px-3 py-1.5" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                {t("next")}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.includes(requested) ? requested : "profile";
  useDocumentTitle(t("settings"));

  const labels = {
    profile: t("profile"),
    security: t("security"),
    notifications: t("notifications"),
    privacy: t("privacy"),
    link: t("link_profile"),
    games: t("my_games"),
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-6">{t("settings")}</h1>
      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <nav aria-label={t("settings")} className="flex lg:flex-col gap-1 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setParams({ tab: key })}
              aria-current={tab === key ? "page" : undefined}
              className={`whitespace-nowrap text-start px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                tab === key ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {labels[key]}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {tab === "profile" && <ProfileTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "privacy" && <PrivacyTab />}
          {tab === "link" && <LinkTab />}
          {tab === "games" && <GamesTab />}
        </div>
      </div>
    </div>
  );
}
