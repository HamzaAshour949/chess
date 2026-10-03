/**
 * Display formatting shared by every page, in the interface language.
 *
 * Arabic uses Latin digits here on purpose: ratings, clocks and move numbers
 * are Latin everywhere else on the page, and mixing the two digit sets in one
 * row reads badly.
 */

function locale(lang) {
  return lang === "ar" ? "ar-u-nu-latn" : "en-GB";
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, lang) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value, lang) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(value, lang) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit" }).format(date);
}

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 minutes ago", "yesterday", "just now". */
export function timeAgo(value, lang) {
  const date = toDate(value);
  if (!date) return "";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "second");
}

/** Same calendar day, for grouping message history. */
export function sameDay(a, b) {
  const x = toDate(a);
  const y = toDate(b);
  return Boolean(x && y && x.toDateString() === y.toDateString());
}

/** "5+3", "10 min", or the translated word for an untimed game. */
export function tcLabel(seconds, increment, t) {
  if (!seconds) return t("tc_unlimited");
  const minutes = seconds / 60;
  const base = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1).replace(/\.0$/, "");
  return increment ? `${base}+${increment}` : `${base} min`;
}

/**
 * Speed category, using the common "estimated game length" rule: base time
 * plus forty moves' worth of increment.
 */
export function speedOf(seconds, increment = 0) {
  if (!seconds) return "unlimited";
  const estimated = seconds + 40 * increment;
  if (estimated < 180) return "bullet";
  if (estimated < 480) return "blitz";
  if (estimated < 1500) return "rapid";
  return "classical";
}

/** A clock face: m:ss, h:mm:ss, and tenths under ten seconds. */
export function clockText(seconds) {
  if (seconds == null) return "—";
  const value = Math.max(0, seconds);
  if (value < 10) return value.toFixed(1);
  const whole = Math.floor(value);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Wrap text from users (names, search terms) in Unicode bidi isolates before
 * it goes into a translated sentence, so "Hikaru N." inside Arabic keeps its
 * full stop where it belongs. The JSX equivalent is <bdi>.
 */
export function isolate(text) {
  return `\u2068${text}\u2069`;
}

/** The name to show for a player, including deleted accounts. */
export function nameOf(user, t) {
  if (!user) return "—";
  if (user.is_deleted) return t("deleted_player");
  return user.display_name || user.username || "—";
}

/** Player-relative outcome of a finished game: "win" | "loss" | "draw" | null. */
export function outcomeFor(game, userId) {
  if (!game || !userId) return null;
  const side = game.white_user?.id === userId ? "white" : game.black_user?.id === userId ? "black" : null;
  if (!side) return null;
  if (game.status === "draw") return "draw";
  if (game.status === "white_wins") return side === "white" ? "win" : "loss";
  if (game.status === "black_wins") return side === "black" ? "win" : "loss";
  return null;
}

/** The key of the translated phrase for how a game ended. */
export function terminationKey(game) {
  if (!game) return null;
  if (game.voided) return "term_voided";
  if (game.termination) return `term_${game.termination}`;
  return game.status === "aborted" ? "term_aborted" : null;
}
