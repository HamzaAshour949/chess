import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";
import Pagination from "../../components/Pagination";

export default function AdminPlayersPage() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");

  const fetchPlayers = () => {
    api.get(`/players?page=${page}&per_page=10&search=${search}`).then((r) => {
      setPlayers(r.data.players);
      setTotalPages(r.data.pages);
    });
  };

  useEffect(fetchPlayers, [page, search]);

  const handleDelete = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    await api.delete(`/players/${id}`);
    fetchPlayers();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("manage_players")}</h1>
        <Link
          to="/admin/players/new"
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors text-sm"
        >
          + {t("add_player")}
        </Link>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder={t("search")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-72 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("name_en")}</th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("name_ar")}</th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("title")}</th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("rating")}</th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("country")}</th>
                <th className="px-6 py-3 text-end text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {players.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {p.name_en}
                    {p.is_player_of_month && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">🏆</span>}
                    {p.is_tournament_winner && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">👑</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{p.name_ar}</td>
                  <td className="px-6 py-4 text-sm">
                    {p.title && (
                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-bold">
                        {p.title}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{p.rating || "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{p.country || "—"}</td>
                  <td className="px-6 py-4 text-end space-x-2">
                    <Link
                      to={`/admin/players/${p.id}/edit`}
                      className="text-amber-600 hover:text-amber-800 text-sm font-medium"
                    >
                      {t("edit_player")}
                    </Link>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      {t("delete_player")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {players.map((p) => (
            <div key={p.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{p.name_en}</p>
                  <p className="text-sm text-gray-500">{p.name_ar}</p>
                </div>
                {p.title && (
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-bold">
                    {p.title}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {p.rating && <span>{t("rating")}: {p.rating}</span>}
                {p.country && <span>{p.country}</span>}
              </div>
              <div className="flex gap-4 pt-1">
                <Link to={`/admin/players/${p.id}/edit`} className="text-amber-600 text-sm font-medium">
                  {t("edit_player")}
                </Link>
                <button onClick={() => handleDelete(p.id)} className="text-red-600 text-sm font-medium">
                  {t("delete_player")}
                </button>
              </div>
            </div>
          ))}
        </div>

        {players.length === 0 && (
          <p className="text-center text-gray-500 py-8">{t("no_results")}</p>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
