import { useTranslation } from "react-i18next";

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("previous")}
      </button>
      {start > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            1
          </button>
          {start > 2 && <span className="text-gray-400">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-3 py-2 text-sm rounded-lg border ${
            p === currentPage
              ? "bg-amber-600 text-white border-amber-600"
              : "border-gray-300 text-gray-700 hover:bg-gray-100"
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-gray-400">…</span>}
          <button
            onClick={() => onPageChange(totalPages)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("next")}
      </button>
    </div>
  );
}
