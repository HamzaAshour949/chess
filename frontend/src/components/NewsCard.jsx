import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NewsCard({ item }) {
  const { t } = useTranslation();

  return (
    <Link
      to={`/news/${item.id}`}
      className="group bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-100 flex flex-col"
    >
      {item.image_url && (
        <div className="aspect-video bg-gray-200 overflow-hidden">
          <img
            src={item.image_url}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-amber-700 transition-colors">
          {item.title}
        </h3>
        {item.content && (
          <p className="text-sm text-gray-500 line-clamp-3 mb-3 flex-1">
            {item.content.replace(/<[^>]*>/g, "").slice(0, 150)}...
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
          <span>
            {item.published_at
              ? new Date(item.published_at).toLocaleDateString()
              : ""}
          </span>
          {item.player_name && (
            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">
              {item.player_name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
