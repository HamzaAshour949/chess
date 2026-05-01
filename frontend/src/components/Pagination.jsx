import { useTranslation } from "react-i18next";

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  const cls = (active) =>
    `px-3 py-2 text-sm rounded-lg transition border ${
      active
        ? "bg-amber-500 text-slate-900 border-amber-400 font-bold"
        : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
    }`;

  return (
    <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-3 py-2 text-sm rounded-lg bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("previous")}
      </button>
      {start > 1 && (
        <>
          <button onClick={() => onPageChange(1)} className={cls(false)}>1</button>
          {start > 2 && <span className="text-slate-500">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button key={p} onClick={() => onPageChange(p)} className={cls(p === currentPage)}>{p}</button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-slate-500">…</span>}
          <button onClick={() => onPageChange(totalPages)} className={cls(false)}>{totalPages}</button>
        </>
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-3 py-2 text-sm rounded-lg bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("next")}
      </button>
    </div>
  );
}
