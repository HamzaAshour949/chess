import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function PlayerCard({ player }) {
  const { t } = useTranslation();

  return (
    <Link
      to={`/players/${player.id}`}
      className="group surface overflow-hidden hover:border-amber-500/40 hover:-translate-y-0.5 transition-all duration-300 flex flex-col"
    >
      <div className="aspect-[4/3] bg-slate-800 overflow-hidden relative">
        {player.image_url ? (
          <img
            src={player.image_url}
            alt={player.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-7xl text-slate-700">♟</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        {player.title && (
          <span className="chip chip-gold absolute top-3 start-3">{player.title}</span>
        )}
        {player.rating && (
          <span className="absolute bottom-3 end-3 chip chip-slate backdrop-blur">
            <span className="text-slate-400">{t("rating")}</span>
            <span className="font-bold text-white">{player.rating}</span>
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-white truncate group-hover:text-amber-400 transition-colors">{player.name}</h3>
        {player.country && <p className="text-sm text-slate-400 mt-0.5">{player.country}</p>}
      </div>
    </Link>
  );
}
