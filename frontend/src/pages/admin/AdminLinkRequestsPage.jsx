import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api";

export default function AdminLinkRequestsPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [filter, setFilter] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.get(`/links/admin/requests?status=${filter}&lang=${lang}`)
      .then((r) => setItems(r.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter, lang]);

  const review = async (id, action) => {
    const note = prompt(t("admin_note") + " (optional):") || "";
    setBusy(id); setError("");
    try {
      await api.post(`/links/admin/requests/${id}/${action}`, { admin_note: note });
      load();
    } catch (err) { setError(err.response?.data?.error || "Failed"); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">{t("manage_link_requests")}</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="all">{t("all")}</option>
          <option value="pending">{t("pending")}</option>
          <option value="approved">{t("approved")}</option>
          <option value="rejected">{t("rejected")}</option>
        </select>
      </div>

      {error && <div className="bg-red-100 text-red-700 rounded-lg px-4 py-2 mb-4 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">{t("loading")}</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">{t("no_link_requests")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-start">{t("user")}</th>
                <th className="px-4 py-3 text-start">{t("requested_player")}</th>
                <th className="px-4 py-3 text-start">{t("evidence")}</th>
                <th className="px-4 py-3 text-start">{t("review_status")}</th>
                <th className="px-4 py-3 text-end" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{r.user?.display_name}</div>
                    <div className="text-xs text-gray-500">@{r.user?.username}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800 flex items-center gap-2">
                      {r.player?.title && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">{r.player.title}</span>}
                      {r.player?.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.player?.country} · {r.player?.rating || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-sm">
                    {r.message || <span className="text-gray-400 italic">{t("evidence")}: —</span>}
                    {r.admin_note && <div className="mt-1 italic text-gray-500">"{r.admin_note}"</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      r.status === "pending" ? "bg-amber-100 text-amber-800" :
                      r.status === "approved" ? "bg-emerald-100 text-emerald-800" :
                      "bg-rose-100 text-rose-800"
                    }`}>{t(r.status)}</span>
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    {r.status === "pending" && (
                      <div className="inline-flex gap-2">
                        <button disabled={busy === r.id} onClick={() => review(r.id, "approve")}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded">
                          {t("approve")}
                        </button>
                        <button disabled={busy === r.id} onClick={() => review(r.id, "reject")}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded">
                          {t("reject")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
