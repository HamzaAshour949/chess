import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format";

function excerpt(content, length = 150) {
  const text = (content || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

export default function NewsCard({ item }) {
  const { i18n } = useTranslation();
  return (
    <Link
      to={`/news/${item.id}`}
      className="group surface overflow-hidden hover:border-amber-500/40 hover:-translate-y-0.5 transition-all duration-300 flex flex-col"
    >
      <div className="aspect-video bg-slate-800 overflow-hidden relative">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl text-slate-700" aria-hidden="true">
            ♟
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-white mb-2 line-clamp-2 group-hover:text-amber-400 transition">{item.title}</h3>
        {item.content && <p className="text-sm text-slate-400 line-clamp-3 mb-3 flex-1">{excerpt(item.content)}</p>}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mt-auto pt-2 border-t border-white/5">
          <span>{formatDate(item.published_at, i18n.language)}</span>
          {item.player_name && <span className="chip chip-slate truncate max-w-[60%]">{item.player_name}</span>}
        </div>
      </div>
    </Link>
  );
}
