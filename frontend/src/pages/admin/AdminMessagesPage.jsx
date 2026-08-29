import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";

export default function AdminMessagesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("game");
  const [data, setData] = useState({ messages: [], total: 0, page: 1, per_page: 30 });
  const [filters, setFilters] = useState({ search: "", show_deleted: false, page: 1 });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("search", filters.search);
    p.set("only", filters.show_deleted ? "all" : "active");
    p.set("page", filters.page);
    p.set("per_page", "30");
    const url = tab === "game"
      ? `/games/admin/messages?${p.toString()}`
      : `/messages/admin/dms?${p.toString()}`;
    api
      .get(url)
      .then((r) => setData(r.data || { messages: [] }))
      .catch(() => setData({ messages: [], total: 0 }));
  }, [tab, filters]);

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!confirm(t("confirm_delete_message"))) return;
    try {
      const url = tab === "game"
        ? `/games/admin/messages/${id}`
        : `/messages/admin/dms/${id}`;
      await api.delete(url);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed");
      setTimeout(() => setError(""), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-white">{t("admin_chat_moderation")}</h1>
        <p className="text-slate-400 text-sm mt-1">{t("admin_chat_intro")}</p>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        <button onClick={() => { setTab("game"); setFilters({ ...filters, page: 1 }); }}
          className={`px-4 py-2 text-sm font-semibold ${tab === "game" ? "text-amber-400 border-b-2 border-amber-400" : "text-slate-400"}`}>
          {t("game_chat")}
        </button>
        <button onClick={() => { setTab("dm"); setFilters({ ...filters, page: 1 }); }}
          className={`px-4 py-2 text-sm font-semibold ${tab === "dm" ? "text-amber-400 border-b-2 border-amber-400" : "text-slate-400"}`}>
          {t("direct_messages")}
        </button>
      </div>

      <div className="surface p-3 flex flex-wrap gap-2 items-center text-sm">
        <input placeholder={t("search")} value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-slate-200 flex-1 min-w-[200px]" />
        <label className="flex items-center gap-1.5 text-slate-300 text-xs">
          <input type="checkbox" checked={filters.show_deleted}
            onChange={(e) => setFilters({ ...filters, show_deleted: e.target.checked, page: 1 })}
            className="accent-amber-500" />
          {t("show_deleted")}
        </label>
        <span className="text-xs text-slate-500">{data.total} total</span>
      </div>

      {error && <div className="chip chip-red">{error}</div>}

      <div className="surface-elev overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">{t("when")}</th>
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">{t("from")}</th>
              {tab === "game" ? (
                <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">{t("game")}</th>
              ) : (
                <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">{t("to")}</th>
              )}
              <th className="px-3 py-2 text-start text-xs uppercase text-slate-400">{t("content")}</th>
              <th className="px-3 py-2 text-end text-xs uppercase text-slate-400">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(data.messages || []).map((m) => (
              <tr key={m.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-3 py-2 text-slate-500 font-mono text-xs whitespace-nowrap">
                  {m.created_at ? new Date(m.created_at + "Z").toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-white text-xs">
                  {m.sender?.display_name || m.sender?.username || m.user?.display_name || m.user?.username || "—"}
                </td>
                {tab === "game" ? (
                  <td className="px-3 py-2">
                    <Link to={`/play/${m.game_id}`} className="text-amber-400 hover:underline text-xs">#{m.game_id}</Link>
                  </td>
                ) : (
                  <td className="px-3 py-2 text-white text-xs">{m.recipient?.display_name || m.recipient?.username || "—"}</td>
                )}
                <td className="px-3 py-2 text-slate-200 max-w-md truncate">
                  {m.is_deleted ? <i className="text-slate-500">[{t("deleted")}]</i> : m.content}
                </td>
                <td className="px-3 py-2 text-end">
                  {!m.is_deleted && (
                    <button onClick={() => del(m.id)} className="btn btn-ghost text-xs">{t("delete")}</button>
                  )}
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
