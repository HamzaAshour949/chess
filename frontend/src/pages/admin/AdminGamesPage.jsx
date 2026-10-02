import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";

export default function AdminGamesPage() {
  const { t } = useTranslation();
  const [data, setData] = useState({ games: [], total: 0, page: 1, per_page: 20 });
  const [filters, setFilters] = useState({ status: "all", search: "", page: 1 });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.status !== "all") p.set("status", filters.status);
    if (filters.search) p.set("search", filters.search);
    p.set("page", filters.page);
    p.set("per_page", "20");
    api
      .get(`/games/admin/games?${p.toString()}`)
      .then((r) => setData(r.data || { games: [] }))
      .catch(() => setData({ games: [], total: 0 }));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, path, body, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(id);
    try {
      await api.post(`/games/admin/games/${id}/${path}`, body || {});
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed");
      setTimeout(() => setError(""), 3000);
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("admin_matches")}</h1>
        <p className="text-gray-500 text-sm mt-1">{t("admin_matches_intro")}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-wrap gap-2 items-center text-sm">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="all">{t("all")}</option>
          <option value="open">{t("open")}</option>
          <option value="active">{t("active")}</option>
          <option value="finished">{t("finished")}</option>
          <option value="voided">{t("voided")}</option>
        </select>
        <input placeholder={t("search_username")} value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]" />
        <span className="text-xs text-gray-500">{data.total} total</span>
      </div>

      {error && <div className="bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-start">
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">ID</th>
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">White</th>
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">Black</th>
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">{t("status")}</th>
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">TC</th>
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">Plies</th>
              <th className="px-3 py-2 text-end text-xs font-medium uppercase text-gray-500">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(data.games || []).map((g) => (
              <tr key={g.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                  <Link to={`/play/${g.id}`} className="text-amber-600 hover:underline">#{g.id}</Link>
                </td>
                <td className="px-3 py-2 text-gray-900">{g.white_user?.display_name || "—"}</td>
                <td className="px-3 py-2 text-gray-900">{g.black_user?.display_name || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded ${g.voided ? "bg-rose-100 text-rose-800" : g.status === "active" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                    {g.voided ? t("voided") : g.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-700 text-xs">{g.time_control_seconds || "∞"}{g.increment_seconds ? `+${g.increment_seconds}` : ""}</td>
                <td className="px-3 py-2 text-gray-700 text-xs">{g.move_count}</td>
                <td className="px-3 py-2 text-end space-x-1">
                  {g.status === "active" && (
                    <button disabled={busy === g.id}
                      onClick={() => act(g.id, "abort", null, t("confirm_abort"))}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded disabled:opacity-40">{t("abort")}</button>
                  )}
                  {(g.status === "white_wins" || g.status === "black_wins" || g.status === "draw") && !g.voided && (
                    <button disabled={busy === g.id}
                      onClick={() => {
                        const reason = prompt(t("void_reason_prompt"));
                        if (reason !== null) act(g.id, "void", { reason }, null);
                      }}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded disabled:opacity-40">{t("void")}</button>
                  )}
                  <button disabled={busy === g.id}
                    onClick={() => act(g.id, "chat-toggle", null, null)}
                    className="px-2.5 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold rounded disabled:opacity-40">
                    {g.chat_disabled ? t("enable_chat") : t("disable_chat")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button disabled={data.page <= 1}
          onClick={() => setFilters({ ...filters, page: data.page - 1 })}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">←</button>
        <span className="text-sm text-gray-500">page {data.page} / {Math.max(1, Math.ceil(data.total / data.per_page))}</span>
        <button disabled={data.page * data.per_page >= data.total}
          onClick={() => setFilters({ ...filters, page: data.page + 1 })}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">→</button>
      </div>
    </div>
  );
}
