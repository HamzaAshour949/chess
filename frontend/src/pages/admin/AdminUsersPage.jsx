import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";

const STATUS_FILTERS = [
  { value: "all", key: "all" },
  { value: "active", key: "active" },
  { value: "banned", key: "banned" },
  { value: "unverified", key: "unverified" },
];

function StatusBadge({ user, t }) {
  if (user.is_banned)
    return <span className="text-xs font-bold px-2 py-1 rounded bg-rose-100 text-rose-800">{t("banned")}</span>;
  if (!user.is_verified)
    return <span className="text-xs font-bold px-2 py-1 rounded bg-amber-100 text-amber-800">{t("unverified")}</span>;
  return <span className="text-xs font-bold px-2 py-1 rounded bg-emerald-100 text-emerald-800">{t("active")}</span>;
}

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ users: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/links/admin/users?status=${filter}&search=${encodeURIComponent(search)}&page=${page}&per_page=25`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || "Failed"))
      .finally(() => setLoading(false));
  }, [filter, search, page]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const ban = async (u) => {
    const reason = prompt(`${t("ban_reason")} (${t("ban")} @${u.username}):`);
    if (reason === null) return;
    setBusy(u.id); setError("");
    try {
      await api.post(`/links/admin/users/${u.id}/ban`, { reason });
      load();
    } catch (e) { setError(e.response?.data?.error || "Failed"); }
    finally { setBusy(null); }
  };

  const unban = async (u) => {
    if (!confirm(`${t("unban")} @${u.username}?`)) return;
    setBusy(u.id);
    try { await api.post(`/links/admin/users/${u.id}/unban`); load(); }
    catch (e) { setError(e.response?.data?.error || "Failed"); }
    finally { setBusy(null); }
  };

  const verify = async (u) => {
    if (!confirm(`${t("mark_verified")} @${u.username}?`)) return;
    setBusy(u.id);
    try { await api.post(`/links/admin/users/${u.id}/verify`); load(); }
    catch (e) { setError(e.response?.data?.error || "Failed"); }
    finally { setBusy(null); }
  };

  const unlink = async (u) => {
    if (!confirm(`${t("unlink")} @${u.username}?`)) return;
    setBusy(u.id);
    try { await api.post(`/links/admin/users/${u.id}/unlink`); load(); }
    catch (e) { setError(e.response?.data?.error || "Failed"); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t("manage_users")}</h1>
          <p className="text-sm text-gray-500">{t("manage_users_sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t("search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56"
          />
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{t(s.key)}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="bg-red-100 text-red-700 rounded-lg px-4 py-2 mb-4 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">{t("loading")}</div>
        ) : data.users.length === 0 ? (
          <div className="p-12 text-center text-gray-400">{t("no_results")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-start">{t("user")}</th>
                <th className="px-4 py-3 text-start">{t("email")}</th>
                <th className="px-4 py-3 text-start">{t("rating")}</th>
                <th className="px-4 py-3 text-start">{t("games_played")}</th>
                <th className="px-4 py-3 text-start">{t("link_profile")}</th>
                <th className="px-4 py-3 text-start">{t("review_status")}</th>
                <th className="px-4 py-3 text-end" />
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{u.display_name}</div>
                    <div className="text-xs text-gray-500">@{u.username}</div>
                    {u.country && <div className="text-xs text-gray-400">{u.country}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-800">{u.online_rating}</div>
                    {u.is_provisional && <div className="text-[10px] text-gray-400">provisional</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {u.games_played} · {u.games_won}W/{u.games_lost}L/{u.games_drawn}D
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.linked_player_id ? (
                      <Link to={`/players/${u.linked_player_id}`}
                        className="text-amber-700 hover:underline font-medium">
                        {u.linked_player_title ? `${u.linked_player_title} ` : ""}{u.linked_player_name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge user={u} t={t} />
                    {u.is_banned && u.ban_reason && (
                      <div className="text-[11px] text-rose-600 mt-1 italic max-w-[180px]">"{u.ban_reason}"</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    <div className="inline-flex flex-wrap gap-1.5 justify-end">
                      {!u.is_verified && (
                        <button disabled={busy === u.id} onClick={() => verify(u)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded">
                          {t("mark_verified")}
                        </button>
                      )}
                      {u.linked_player_id && (
                        <button disabled={busy === u.id} onClick={() => unlink(u)}
                          className="px-2.5 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold rounded">
                          {t("unlink")}
                        </button>
                      )}
                      {u.is_banned ? (
                        <button disabled={busy === u.id} onClick={() => unban(u)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded">
                          {t("unban")}
                        </button>
                      ) : (
                        <button disabled={busy === u.id} onClick={() => ban(u)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded">
                          {t("ban")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">
            {t("previous")}
          </button>
          <span className="text-sm text-gray-600">
            {t("page")} {page} {t("of")} {data.pages} ({data.total})
          </span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">
            {t("next")}
          </button>
        </div>
      )}
    </div>
  );
}
