import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectFade, Navigation, Pagination } from "swiper/modules";

import { useLanguage } from "../../context/LanguageContext";
import { useUserAuth } from "../../context/UserAuthContext";
import api from "../../api";
import PlayerCard from "../../components/PlayerCard";
import NewsCard from "../../components/NewsCard";

function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function HeroCarousel({ items }) {
  const { t } = useTranslation();
  if (!items.length) {
    return (
      <div className="relative h-[480px] sm:h-[560px] lg:h-[640px] surface-2 overflow-hidden flex items-center justify-center">
        <span className="shimmer absolute inset-0" />
      </div>
    );
  }
  return (
    <Swiper
      className="news-swiper rounded-3xl overflow-hidden"
      modules={[Autoplay, EffectFade, Navigation, Pagination]}
      effect="fade"
      fadeEffect={{ crossFade: true }}
      autoplay={{ delay: 5500, disableOnInteraction: false }}
      loop={items.length > 1}
      navigation
      pagination={{ clickable: true }}
      speed={700}
    >
      {items.map((n) => (
        <SwiperSlide key={n.id}>
          <Link
            to={`/news/${n.id}`}
            className="relative block h-[480px] sm:h-[560px] lg:h-[640px] group"
          >
            {n.image_url ? (
              <img
                src={n.image_url}
                alt={n.title}
                className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-[1.2s]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />

            <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 flex items-end pb-12 sm:pb-16">
              <div className="max-w-3xl">
                <span className="chip chip-gold mb-4 animate-fade-up">★ {t("featured")}</span>
                <motion.h2
                  key={n.id + "-t"}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.05 }}
                  className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-4 [text-wrap:balance]"
                >
                  {n.title}
                </motion.h2>
                {n.content && (
                  <motion.p
                    key={n.id + "-c"}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                    className="text-slate-300 text-base sm:text-lg max-w-2xl line-clamp-2 mb-6"
                  >
                    {stripHtml(n.content).slice(0, 240)}
                  </motion.p>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.25 }}
                  className="flex items-center gap-3 text-sm text-slate-400"
                >
                  {n.published_at && <span>{new Date(n.published_at).toLocaleDateString()}</span>}
                  {n.player_name && (
                    <>
                      <span>•</span>
                      <span className="text-slate-300">{n.player_name}</span>
                    </>
                  )}
                </motion.div>
              </div>
            </div>
          </Link>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { user } = useUserAuth();

  const [players, setPlayers] = useState([]);
  const [news, setNews] = useState([]);
  const [carouselItems, setCarouselItems] = useState([]);
  const [playerOfMonth, setPlayerOfMonth] = useState(null);
  const [tournamentWinner, setTournamentWinner] = useState(null);
  const [topRated, setTopRated] = useState([]);

  useEffect(() => {
    api.get(`/players?lang=${lang}&per_page=8`).then((r) => setPlayers(r.data.players || []));
    api.get(`/news?lang=${lang}&per_page=12`).then((r) => {
      const items = r.data.news || [];
      // Carousel: featured first, then rest with images, capped at 6
      const featured = items.filter((n) => n.is_featured);
      const others = items.filter((n) => !n.is_featured && n.image_url);
      setCarouselItems([...featured, ...others].slice(0, 6));
      setNews(items);
    });
    api.get(`/players/homepage?lang=${lang}`).then((r) => {
      setPlayerOfMonth(r.data.player_of_month);
      setTournamentWinner(r.data.tournament_winner);
    }).catch(() => {});
    api.get(`/games/leaderboard`).then((r) => setTopRated((r.data || []).slice(0, 5))).catch(() => {});
  }, [lang]);

  const moreNews = useMemo(() => news.filter((n) => !carouselItems.find((c) => c.id === n.id)).slice(0, 6), [news, carouselItems]);

  return (
    <div className="space-y-16 lg:space-y-24">
      {/* Hero with carousel */}
      <section className="relative pt-6 sm:pt-8">
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-8">
              <HeroCarousel items={carouselItems} />
            </div>
            <aside className="lg:col-span-4 flex flex-col gap-4">
              <div className="surface-elev p-6 relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-amber-500/20 blur-3xl" />
                <span className="chip chip-gold mb-4">♔ {t("hero_badge")}</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-2 [text-wrap:balance]">
                  {t("welcome")}
                </h1>
                <p className="text-slate-300 text-sm leading-relaxed mb-5">{t("welcome_desc")}</p>
                <div className="flex flex-wrap gap-2">
                  <Link to={user ? "/play" : "/register"} className="btn btn-primary">
                    {user ? t("play_now") : t("get_started")}
                  </Link>
                  <Link to="/players" className="btn btn-outline">{t("browse_players")}</Link>
                </div>
              </div>

              <div className="surface p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white tracking-wide uppercase">{t("leaderboard_title")}</h3>
                  <Link to="/leaderboard" className="text-xs text-amber-400 hover:text-amber-300">{t("see_all_players")} →</Link>
                </div>
                {topRated.length === 0 ? (
                  <div className="space-y-2">
                    {[0,1,2,3].map(i => <div key={i} className="h-9 rounded-lg shimmer" />)}
                  </div>
                ) : (
                  <ol className="space-y-1.5">
                    {topRated.map((u, i) => (
                      <li key={u.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 transition">
                        <span className={`w-6 text-center text-xs font-bold ${i === 0 ? "text-amber-400" : "text-slate-500"}`}>{i + 1}</span>
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-xs text-slate-300 font-bold">
                          {(u.display_name || u.username || "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 text-sm text-slate-200 truncate">{u.display_name || u.username}</span>
                        <span className="text-sm font-bold text-amber-400">{u.online_rating}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Play CTA strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="surface-elev relative overflow-hidden p-8 sm:p-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="absolute inset-0 bg-grid opacity-20" />
          <div className="absolute -left-20 -top-20 w-72 h-72 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="absolute -right-20 -bottom-20 w-72 h-72 rounded-full bg-blue-500/15 blur-3xl" />

          <div className="relative flex-shrink-0">
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-2xl shadow-amber-500/30 animate-float">
              <span className="text-6xl sm:text-7xl text-slate-900">♞</span>
            </div>
          </div>
          <div className="relative flex-1 text-center md:text-start">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">{t("play_against_world")}</h2>
            <p className="text-slate-300 mb-5">{t("play_cta_sub")}</p>
            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
              <Link to={user ? "/play" : "/register"} className="btn btn-primary btn-lg">
                {user ? t("play_now") : t("get_started")} →
              </Link>
              <Link to="/leaderboard" className="btn btn-outline btn-lg">{t("leaderboard")}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights */}
      {(playerOfMonth || tournamentWinner) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {playerOfMonth && (
              <Link to={`/players/${playerOfMonth.id}`} className="group surface-elev relative overflow-hidden p-6 sm:p-8 glow-gold">
                <div className="relative z-[1] flex items-center gap-2 mb-5">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="text-amber-400 text-xs font-bold uppercase tracking-widest">{t("player_of_month")}</div>
                    <div className="text-slate-500 text-xs">{t("player_of_month_sub")}</div>
                  </div>
                </div>
                <div className="relative z-[1] flex items-center gap-5">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-4 ring-amber-400/40 flex-shrink-0 bg-slate-800">
                    {playerOfMonth.image_url
                      ? <img src={playerOfMonth.image_url} alt={playerOfMonth.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-4xl text-slate-600">♟</div>}
                  </div>
                  <div className="min-w-0">
                    {playerOfMonth.title && <span className="chip chip-gold mb-2">{playerOfMonth.title}</span>}
                    <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-amber-400 transition truncate">{playerOfMonth.name}</h3>
                    {playerOfMonth.country && <p className="text-slate-400 text-sm">{playerOfMonth.country}</p>}
                    {playerOfMonth.rating && (
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-lg">
                        <span className="text-slate-500 text-xs">{t("rating")}</span>
                        <span className="text-white font-bold">{playerOfMonth.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )}
            {tournamentWinner && (
              <Link to={`/players/${tournamentWinner.id}`} className="group surface-elev relative overflow-hidden p-6 sm:p-8 glow-blue">
                <div className="relative z-[1] flex items-center gap-2 mb-5">
                  <span className="text-2xl">👑</span>
                  <div>
                    <div className="text-sky-400 text-xs font-bold uppercase tracking-widest">{t("tournament_winner")}</div>
                    <div className="text-slate-500 text-xs">{t("tournament_winner_sub")}</div>
                  </div>
                </div>
                <div className="relative z-[1] flex items-center gap-5">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-4 ring-sky-400/40 flex-shrink-0 bg-slate-800">
                    {tournamentWinner.image_url
                      ? <img src={tournamentWinner.image_url} alt={tournamentWinner.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-4xl text-slate-600">♟</div>}
                  </div>
                  <div className="min-w-0">
                    {tournamentWinner.title && <span className="chip chip-blue mb-2">{tournamentWinner.title}</span>}
                    <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-sky-400 transition truncate">{tournamentWinner.name}</h3>
                    {tournamentWinner.country && <p className="text-slate-400 text-sm">{tournamentWinner.country}</p>}
                    {tournamentWinner.rating && (
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-lg">
                        <span className="text-slate-500 text-xs">{t("rating")}</span>
                        <span className="text-white font-bold">{tournamentWinner.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Latest news grid */}
      {moreNews.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-7 w-1 bg-amber-500 rounded-full" />
              <h2 className="text-2xl sm:text-3xl font-bold text-white">{t("latest_news")}</h2>
            </div>
            <Link to="/news" className="text-amber-400 hover:text-amber-300 font-medium text-sm flex items-center gap-1">
              {t("see_all_news")} →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {moreNews.map((n) => <NewsCard key={n.id} item={n} />)}
          </div>
        </section>
      )}

      {/* Featured Players */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-7 w-1 bg-amber-500 rounded-full" />
            <h2 className="text-2xl sm:text-3xl font-bold text-white">{t("featured_players")}</h2>
          </div>
          <Link to="/players" className="text-amber-400 hover:text-amber-300 font-medium text-sm flex items-center gap-1">
            {t("see_all_players")} →
          </Link>
        </div>
        {players.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {players.slice(0, 8).map((p) => <PlayerCard key={p.id} player={p} />)}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-8">{t("no_results")}</p>
        )}
      </section>
    </div>
  );
}
