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
    const handle = setTimeout(() => {
      api
        .get(`/players?lang=${lang}&page=${page}&per_page=12&search=${encodeURIComponent(search)}`)
        .then((r) => {
          setPlayers(r.data.players || []);
          setTotalPages(r.data.pages || 1);
        })
        .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => clearTimeout(handle);
  }, [lang, page, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{t("players")}</h1>
          <p className="text-slate-400 mt-1">{t("welcome_desc")}</p>
        </div>
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder={t("search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pe-10"
          />
          <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="surface aspect-[4/5] shimmer" />
          ))}
        </div>
      ) : players.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {players.map((p) => <PlayerCard key={p.id} player={p} />)}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <p className="text-center text-slate-500 py-16">{t("no_results")}</p>
      )}
    </div>
  );
}
