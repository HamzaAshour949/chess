import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function PlayerCard({ player }) {
  const { t } = useTranslation();

  return (
    <Link
      to={`/players/${player.id}`}
      className="group bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-100"
    >
      <div className="aspect-[4/3] bg-gray-200 overflow-hidden">
        {player.image_url ? (
          <img
            src={player.image_url}
            alt={player.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl text-gray-400 bg-gray-100">
            ♟
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {player.title && (
            <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
              {player.title}
            </span>
          )}
          <h3 className="font-semibold text-gray-900 truncate">{player.name}</h3>
        </div>
        {player.country && (
          <p className="text-sm text-gray-500 mb-2">{player.country}</p>
        )}
        {player.rating && (
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500">{t("rating")}:</span>
            <span className="font-bold text-gray-800">{player.rating}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
