import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFetch } from "../../hooks/useFetch";
import { isolate } from "../../lib/format";
import PlayerCard from "../../components/PlayerCard";
import Pagination from "../../components/Pagination";

/**
 * The player catalogue. Page and search live in the URL, so a filtered view
 * can be shared or bookmarked and the Back button returns to the same page.
 */
export default function PlayersPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const search = params.get("q") ?? "";
  // What the box shows: the text being typed, until the URL catches up. When
  // Back or Forward changes the URL, the box follows it.
  const [draftState, setDraftState] = useState({ for: search, value: search });
  const draft = draftState.for === search ? draftState.value : search;
  const setDraft = (value) => setDraftState({ for: search, value });
  const { data: fetched, error } = useFetch(
    `/players?lang=${lang}&page=${page}&per_page=12&search=${encodeURIComponent(search)}`,
  );
  const data = fetched ?? (error ? { players: [], pages: 1, total: 0 } : null);
  useDocumentTitle(t("players"));

  // Typing updates the URL after a pause, not on every keystroke.
  useEffect(() => {
    if (draft === search) return undefined;
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (draft.trim()) next.set("q", draft);
      else next.delete("q");
      next.delete("page");
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(handle);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (next) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("page", String(next));
    setParams(nextParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{t("players")}</h1>
          <p className="text-slate-400 mt-1">{t("players_intro")}</p>
        </div>
        <div className="relative w-full sm:w-80">
          <label htmlFor="player-search" className="sr-only">
            {t("search")}
          </label>
          <input
            id="player-search"
            type="search"
            placeholder={t("search_players_placeholder")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="input pe-10"
          />
          <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" aria-hidden="true">
            ⌕
          </span>
        </div>
      </div>

      {data === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="surface aspect-[4/5] shimmer" />
          ))}
        </div>
      ) : data.players.length > 0 ? (
        <>
          {search && <p className="text-sm text-slate-400 mb-4">{t("n_results", { count: data.total })}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {data.players.map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={data.pages || 1} onPageChange={goTo} />
        </>
      ) : (
        <div className="text-center py-16">
          <p className="text-slate-400 mb-4">{search ? t("no_results_for", { q: isolate(search) }) : t("no_results")}</p>
          {search && (
            <button type="button" className="btn btn-ghost" onClick={() => setDraft("")}>
              {t("clear_search")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
