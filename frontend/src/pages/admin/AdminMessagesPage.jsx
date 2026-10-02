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
        <h1 className="text-2xl font-bold text-gray-900">{t("admin_chat_moderation")}</h1>
        <p className="text-gray-500 text-sm mt-1">{t("admin_chat_intro")}</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button onClick={() => { setTab("game"); setFilters({ ...filters, page: 1 }); }}
          className={`px-4 py-2 text-sm font-semibold ${tab === "game" ? "text-amber-600 border-b-2 border-amber-600" : "text-gray-500 hover:text-gray-700"}`}>
          {t("game_chat")}
        </button>
        <button onClick={() => { setTab("dm"); setFilters({ ...filters, page: 1 }); }}
          className={`px-4 py-2 text-sm font-semibold ${tab === "dm" ? "text-amber-600 border-b-2 border-amber-600" : "text-gray-500 hover:text-gray-700"}`}>
          {t("direct_messages")}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-wrap gap-2 items-center text-sm">
        <input placeholder={t("search")} value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]" />
        <label className="flex items-center gap-1.5 text-gray-600 text-xs">
          <input type="checkbox" checked={filters.show_deleted}
            onChange={(e) => setFilters({ ...filters, show_deleted: e.target.checked, page: 1 })}
            className="accent-amber-500" />
          {t("show_deleted")}
        </label>
        <span className="text-xs text-gray-500">{data.total} total</span>
      </div>

      {error && <div className="bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">{t("when")}</th>
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">{t("from")}</th>
              {tab === "game" ? (
                <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">{t("game")}</th>
              ) : (
                <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">{t("to")}</th>
              )}
              <th className="px-3 py-2 text-start text-xs font-medium uppercase text-gray-500">{t("content")}</th>
              <th className="px-3 py-2 text-end text-xs font-medium uppercase text-gray-500">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(data.messages || []).map((m) => (
              <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-500 font-mono text-xs whitespace-nowrap">
                  {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-gray-900 text-xs">
                  {m.sender?.display_name || m.sender?.username || m.display_name || m.username || "—"}
                </td>
                {tab === "game" ? (
                  <td className="px-3 py-2">
                    <Link to={`/play/${m.game_id}`} className="text-amber-600 hover:underline text-xs">#{m.game_id}</Link>
                  </td>
                ) : (
                  <td className="px-3 py-2 text-gray-900 text-xs">{m.recipient?.display_name || m.recipient?.username || "—"}</td>
                )}
                <td className="px-3 py-2 text-gray-700 max-w-md truncate">
                  {m.is_deleted ? <i className="text-gray-400">[{t("deleted")}]</i> : m.content}
                </td>
                <td className="px-3 py-2 text-end">
                  {!m.is_deleted && (
                    <button onClick={() => del(m.id)} className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded">{t("delete")}</button>
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
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">←</button>
        <span className="text-sm text-gray-500">page {data.page} / {Math.max(1, Math.ceil(data.total / data.per_page))}</span>
        <button disabled={data.page * data.per_page >= data.total}
          onClick={() => setFilters({ ...filters, page: data.page + 1 })}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">→</button>
      </div>
    </div>
  );
}
