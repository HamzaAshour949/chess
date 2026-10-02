import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, Autoplay, EffectFade, Keyboard, Navigation, Pagination } from "swiper/modules";

import { useLanguage } from "../../context/LanguageContext";
import { useUserAuth } from "../../context/UserAuthContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFetch } from "../../hooks/useFetch";
import Avatar from "../../components/Avatar";
import MiniBoard from "../../components/MiniBoard";
import PlayerCard from "../../components/PlayerCard";
import NewsCard from "../../components/NewsCard";
import { formatDate, nameOf, tcLabel } from "../../lib/format";

function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** A section heading with its "see all" link. */
function SectionHeading({ icon, title, to, linkLabel }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center text-amber-300 text-lg"
          aria-hidden="true"
        >
          {icon}
        </span>
        {title}
      </h2>
      {to && (
        <Link to={to} className="text-amber-400 hover:text-amber-300 font-medium text-sm whitespace-nowrap">
          {linkLabel} <span className="rtl:hidden">→</span>
          <span className="hidden rtl:inline">←</span>
        </Link>
      )}
    </div>
  );
}

function HeroCarousel({ items, loading }) {
  const { t, i18n } = useTranslation();
  const height = "h-[420px] sm:h-[520px] lg:h-[600px]";

  if (loading) return <div className={`${height} rounded-3xl surface-2 shimmer`} />;
  if (!items.length) {
    return (
      <div className={`${height} rounded-3xl surface-elev flex flex-col items-center justify-center text-center p-8`}>
        <span className="text-7xl text-slate-600 mb-4" aria-hidden="true">
          ♞
        </span>
        <p className="text-slate-400">{t("no_news_yet")}</p>
      </div>
    );
  }

  return (
    <Swiper
      className="news-swiper rounded-3xl overflow-hidden"
      modules={[A11y, Autoplay, EffectFade, Keyboard, Navigation, Pagination]}
      effect="fade"
      fadeEffect={{ crossFade: true }}
      autoplay={{ delay: 6000, disableOnInteraction: false, pauseOnMouseEnter: true }}
      keyboard={{ enabled: true, onlyInViewport: true }}
      loop={items.length > 1}
      navigation
      pagination={{ clickable: true }}
      speed={700}
      dir={i18n.dir()}
      key={i18n.language}
    >
      {items.map((n) => (
        <SwiperSlide key={n.id}>
          <Link to={`/news/${n.id}`} className={`relative block ${height} group`}>
            {n.image_url ? (
              <img
                src={n.image_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-[1.2s]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/10" />
            <div className="relative h-full px-6 sm:px-10 lg:px-12 flex items-end pb-14 sm:pb-16">
              <div className="max-w-3xl">
                {n.is_featured && <span className="chip chip-gold mb-4">★ {t("featured")}</span>}
                <h2 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight tracking-tight mb-4 [text-wrap:balance] animate-fade-up">
                  {n.title}
                </h2>
                {n.content && (
                  <p className="text-slate-300 text-base sm:text-lg max-w-2xl line-clamp-2 mb-5 animate-fade-up [animation-delay:120ms]">
                    {stripHtml(n.content).slice(0, 240)}
                  </p>
                )}
                <div className="flex items-center gap-3 text-sm text-slate-400 animate-fade-up [animation-delay:220ms]">
                  {n.published_at && <span>{formatDate(n.published_at, i18n.language)}</span>}
                  {n.player_name && (
                    <>
                      <span aria-hidden="true">•</span>
                      <span className="text-slate-300">{n.player_name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Link>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}

function Spotlight({ player, label, sub, icon, tone }) {
  const { t } = useTranslation();
  const ring = tone === "gold" ? "ring-amber-400/40" : "ring-sky-400/40";
  const text = tone === "gold" ? "text-amber-400" : "text-sky-400";
  return (
    <Link to={`/players/${player.id}`} className="group surface-elev relative overflow-hidden p-6 sm:p-8 hover:border-white/20 transition">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-2xl" aria-hidden="true">
          {icon}
        </span>
        <div>
          <div className={`${text} text-xs font-bold uppercase tracking-widest`}>{label}</div>
          <div className="text-slate-500 text-xs">{sub}</div>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-4 ${ring} flex-shrink-0 bg-slate-800`}>
          {player.image_url ? (
            <img src={player.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl text-slate-600">♟</div>
          )}
        </div>
        <div className="min-w-0">
          {player.title && <span className={`chip ${tone === "gold" ? "chip-gold" : "chip-blue"} mb-2`}>{player.title}</span>}
          <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-amber-300 transition truncate">{player.name}</h3>
          {player.country && <p className="text-slate-400 text-sm">{player.country}</p>}
          {player.rating && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-lg">
              <span className="text-slate-500 text-xs">{t("rating")}</span>
              <span className="text-white font-bold tabular-nums">{player.rating}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { user } = useUserAuth();
  useDocumentTitle(null);

  const { data: playersData } = useFetch(`/players?lang=${lang}&per_page=8`);
  const { data: newsData, error: newsError } = useFetch(`/news?lang=${lang}&per_page=12`);
  const { data: spotlightData } = useFetch(`/players/homepage?lang=${lang}`);
  const { data: topRatedData, error: topRatedError } = useFetch("/games/leaderboard?limit=5");
  const { data: liveData } = useFetch("/games/live");

  const players = playersData?.players ?? [];
  const news = useMemo(() => newsData?.news ?? [], [newsData]);
  const newsLoading = !newsData && !newsError;
  const spotlight = spotlightData ?? { player_of_month: null, tournament_winner: null };
  const topRated = topRatedData ?? (topRatedError ? [] : null);
  const live = (liveData ?? []).slice(0, 4);

  // Carousel: the featured article first, then others with pictures.
  const carouselItems = useMemo(() => {
    const featured = news.filter((n) => n.is_featured);
    const others = news.filter((n) => !n.is_featured && n.image_url);
    return [...featured, ...others].slice(0, 6);
  }, [news]);
  const moreNews = useMemo(
    () => news.filter((n) => !carouselItems.some((c) => c.id === n.id)).slice(0, 6),
    [news, carouselItems],
  );

  return (
    <div className="space-y-16 lg:space-y-24">
      <section className="relative pt-6 sm:pt-8">
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-8">
              <HeroCarousel items={carouselItems} loading={newsLoading} />
            </div>
            <aside className="lg:col-span-4 flex flex-col gap-4">
              <div className="surface-elev p-6 relative overflow-hidden">
                <div className="absolute -end-10 -top-10 w-40 h-40 rounded-full bg-amber-500/20 blur-3xl" aria-hidden="true" />
                <span className="chip chip-gold mb-4">♔ {t("hero_badge")}</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-2 [text-wrap:balance]">{t("welcome")}</h1>
                <p className="text-slate-300 text-sm leading-relaxed mb-5">{t("welcome_desc")}</p>
                <div className="flex flex-wrap gap-2">
                  <Link to={user ? "/play" : "/register"} className="btn btn-primary">
                    {user ? t("play_now") : t("get_started")}
                  </Link>
                  <Link to="/players" className="btn btn-outline">
                    {t("browse_players")}
                  </Link>
                </div>
              </div>

              <div className="surface p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-white tracking-wide uppercase">{t("leaderboard_title")}</h2>
                  <Link to="/leaderboard" className="text-xs text-amber-400 hover:text-amber-300">
                    {t("see_all")}
                  </Link>
                </div>
                {topRated === null ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-9 rounded-lg shimmer" />
                    ))}
                  </div>
                ) : topRated.length === 0 ? (
                  <p className="text-sm text-slate-500 py-2">{t("leaderboard_empty")}</p>
                ) : (
                  <ol className="space-y-1">
                    {topRated.map((u, i) => (
                      <li key={u.id}>
                        <Link to={`/u/${u.username}`} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 transition">
                          <span className={`w-5 text-center text-xs font-bold ${i === 0 ? "text-amber-400" : "text-slate-500"}`}>{i + 1}</span>
                          <Avatar user={u} size={28} />
                          <span className="flex-1 text-sm text-slate-200 truncate"><bdi>{nameOf(u, t)}</bdi></span>
                          <span className="text-sm font-bold text-amber-400 tabular-nums">{u.online_rating}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading icon="●" title={t("live_now")} to="/watch" linkLabel={t("watch_live")} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {live.map((game) => (
              <Link key={game.id} to={`/play/${game.id}`} className="surface p-3 hover:border-amber-500/30 transition group">
                <MiniBoard fen={game.fen} lastMove={game.moves?.split(" ").at(-1)} />
                <div className="mt-2 text-xs text-slate-300 truncate">
                  <bdi>{nameOf(game.white_user, t)}</bdi> <span className="text-slate-500">{t("vs")}</span> <bdi>{nameOf(game.black_user, t)}</bdi>
                </div>
                <div className="text-[11px] text-slate-500">{tcLabel(game.time_control_seconds, game.increment_seconds, t)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="surface-elev relative overflow-hidden p-8 sm:p-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
          <div className="absolute -start-20 -top-20 w-72 h-72 rounded-full bg-amber-500/15 blur-3xl" aria-hidden="true" />
          <div className="absolute -end-20 -bottom-20 w-72 h-72 rounded-full bg-blue-500/15 blur-3xl" aria-hidden="true" />

          <div className="relative flex-shrink-0">
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-2xl shadow-amber-500/30 animate-float">
              <span className="text-6xl sm:text-7xl text-slate-900" aria-hidden="true">
                ♞
              </span>
            </div>
          </div>
          <div className="relative flex-1 text-center md:text-start">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">{t("play_against_world")}</h2>
            <p className="text-slate-300 mb-5">{t("play_cta_sub")}</p>
            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
              <Link to={user ? "/play" : "/register"} className="btn btn-primary btn-lg">
                {user ? t("play_now") : t("get_started")}
              </Link>
              <Link to="/leaderboard" className="btn btn-outline btn-lg">
                {t("leaderboard")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {(spotlight.player_of_month || spotlight.tournament_winner) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {spotlight.player_of_month && (
              <Spotlight player={spotlight.player_of_month} label={t("player_of_month")} sub={t("player_of_month_sub")} icon="🏆" tone="gold" />
            )}
            {spotlight.tournament_winner && (
              <Spotlight player={spotlight.tournament_winner} label={t("tournament_winner")} sub={t("tournament_winner_sub")} icon="👑" tone="blue" />
            )}
          </div>
        </section>
      )}

      {moreNews.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading icon="📰" title={t("latest_news")} to="/news" linkLabel={t("see_all_news")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {moreNews.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <SectionHeading icon="♟" title={t("featured_players")} to="/players" linkLabel={t("see_all_players")} />
        {players.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {players.slice(0, 8).map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-8">{t("no_results")}</p>
        )}
      </section>
    </div>
  );
}
