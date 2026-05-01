import { Link } from "react-router-dom";

export default function NewsCard({ item }) {
  return (
    <Link
      to={`/news/${item.id}`}
      className="group surface overflow-hidden hover:border-amber-500/40 hover:-translate-y-0.5 transition-all duration-300 flex flex-col"
    >
      <div className="aspect-video bg-slate-800 overflow-hidden relative">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl text-slate-700">♟</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-white mb-2 line-clamp-2 group-hover:text-amber-400 transition">
          {item.title}
        </h3>
        {item.content && (
          <p className="text-sm text-slate-400 line-clamp-3 mb-3 flex-1">
            {item.content.replace(/<[^>]*>/g, "").slice(0, 150)}…
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-slate-500 mt-auto pt-2 border-t border-white/5">
          <span>{item.published_at ? new Date(item.published_at).toLocaleDateString() : ""}</span>
          {item.player_name && <span className="chip chip-slate">{item.player_name}</span>}
        </div>
      </div>
    </Link>
  );
}
