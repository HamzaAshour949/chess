import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";
import Pagination from "../../components/Pagination";

export default function AdminNewsPage() {
  const { t } = useTranslation();
  const [news, setNews] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchNews = () => {
    api.get(`/news/admin?page=${page}&per_page=10`).then((r) => {
      setNews(r.data.news);
      setTotalPages(r.data.pages);
    });
  };

  useEffect(fetchNews, [page]);

  const handleDelete = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    await api.delete(`/news/${id}`);
    fetchNews();
  };

  const togglePublish = async (item) => {
    await api.put(`/news/${item.id}`, { published: !item.published });
    fetchNews();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("manage_news")}</h1>
        <Link
          to="/admin/news/new"
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors text-sm"
        >
          + {t("add_news")}
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("title_en")}</th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("region")}</th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">Player</th>
                <th className="px-6 py-3 text-end text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {news.map((n) => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-xs truncate">
                    {n.is_featured && <span className="mr-1">⭐</span>}
                    {n.title_en || n.title_ar || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-600">
                      {n.region === "both" ? t("region_both") : n.region === "en" ? t("region_en") : t("region_ar")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => togglePublish(n)}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        n.published
                          ? "bg-green-100 text-green-800 hover:bg-green-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {n.published ? t("published") : t("unpublished")}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{n.player_name || "—"}</td>
                  <td className="px-6 py-4 text-end space-x-2">
                    <Link
                      to={`/admin/news/${n.id}/edit`}
                      className="text-amber-600 hover:text-amber-800 text-sm font-medium"
                    >
                      {t("edit_news")}
                    </Link>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      {t("delete_news")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {news.map((n) => (
            <div key={n.id} className="p-4 space-y-2">
              <p className="font-medium text-gray-900 truncate">{n.title_en || n.title_ar || "—"}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-600">
                  {n.region === "both" ? t("region_both") : n.region === "en" ? t("region_en") : t("region_ar")}
                </span>
                <button
                  onClick={() => togglePublish(n)}
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    n.published
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {n.published ? t("published") : t("unpublished")}
                </button>
                {n.player_name && (
                  <span className="text-xs text-gray-500">{n.player_name}</span>
                )}
              </div>
              <div className="flex gap-4 pt-1">
                <Link to={`/admin/news/${n.id}/edit`} className="text-amber-600 text-sm font-medium">
                  {t("edit_news")}
                </Link>
                <button onClick={() => handleDelete(n.id)} className="text-red-600 text-sm font-medium">
                  {t("delete_news")}
                </button>
              </div>
            </div>
          ))}
        </div>

        {news.length === 0 && (
          <p className="text-center text-gray-500 py-8">{t("no_results")}</p>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
