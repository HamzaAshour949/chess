import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api";
import PlayerCard from "../../components/PlayerCard";
import Pagination from "../../components/Pagination";

export default function PlayersPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [players, setPlayers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/players?lang=${lang}&page=${page}&per_page=12&search=${search}`)
      .then((r) => {
        setPlayers(r.data.players);
        setTotalPages(r.data.pages);
      })
      .finally(() => setLoading(false));
  }, [lang, page, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t("players")}</h1>
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

      {loading ? (
        <p className="text-center text-gray-500 py-12">{t("loading")}</p>
      ) : players.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {players.map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <p className="text-center text-gray-500 py-12">{t("no_results")}</p>
      )}
    </div>
  );
}
