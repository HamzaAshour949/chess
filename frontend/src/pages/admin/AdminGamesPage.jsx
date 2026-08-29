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
        <h1 className="text-3xl font-extrabold text-white">{t("admin_matches")}</h1>
        <p className="text-slate-400 text-sm mt-1">{t("admin_matches_intro")}</p>
      </div>

      <div className="surface p-3 flex flex-wrap gap-2 items-center text-sm">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-slate-200">
          <option value="all">{t("all")}</option>
          <option value="open">{t("open")}</option>
          <option value="active">{t("active")}</option>
          <option value="finished">{t("finished")}</option>
          <option value="voided">{t("voided")}</option>
        </select>
        <input placeholder={t("search_username")} value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-slate-200 flex-1 min-w-[200px]" />
        <span className="text-xs text-slate-500">{data.total} total</span>
      </div>

      {error && <div className="chip chip-red">{error}</div>}

      <div className="surface-elev overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-start">
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">ID</th>
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">White</th>
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">Black</th>
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">{t("status")}</th>
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">TC</th>
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">Plies</th>
              <th className="px-3 py-2 text-end text-xs uppercase text-slate-400">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(data.games || []).map((g) => (
              <tr key={g.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-3 py-2 text-slate-400 font-mono text-xs">
                  <Link to={`/play/${g.id}`} className="text-amber-400 hover:underline">#{g.id}</Link>
                </td>
                <td className="px-3 py-2 text-white">{g.white_user?.display_name || "—"}</td>
                <td className="px-3 py-2 text-white">{g.black_user?.display_name || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`chip ${g.voided ? "chip-red" : g.status === "active" ? "chip-gold" : "chip-slate"}`}>
                    {g.voided ? t("voided") : g.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-300 text-xs">{g.time_control_seconds || "∞"}{g.increment_seconds ? `+${g.increment_seconds}` : ""}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{g.move_count}</td>
                <td className="px-3 py-2 text-end space-x-1">
                  {g.status === "active" && (
                    <button disabled={busy === g.id}
                      onClick={() => act(g.id, "abort", null, t("confirm_abort"))}
                      className="btn btn-ghost text-xs">{t("abort")}</button>
                  )}
                  {(g.status === "white_wins" || g.status === "black_wins" || g.status === "draw") && !g.voided && (
                    <button disabled={busy === g.id}
                      onClick={() => {
                        const reason = prompt(t("void_reason_prompt"));
                        if (reason !== null) act(g.id, "void", { reason }, null);
                      }}
                      className="btn btn-ghost text-xs">{t("void")}</button>
                  )}
                  <button disabled={busy === g.id}
                    onClick={() => act(g.id, "chat-toggle", null, null)}
                    className="btn btn-ghost text-xs">
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
          className="btn btn-ghost">←</button>
        <span className="text-sm text-slate-400">page {data.page} / {Math.max(1, Math.ceil(data.total / data.per_page))}</span>
        <button disabled={data.page * data.per_page >= data.total}
          onClick={() => setFilters({ ...filters, page: data.page + 1 })}
          className="btn btn-ghost">→</button>
      </div>
    </div>
  );
}
