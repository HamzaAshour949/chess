import { useState } from "react";

/** A stable pair of colours per name, so a player is recognisable without a photo. */
const PALETTES = [
  ["#f59e0b", "#b45309"],
  ["#38bdf8", "#0369a1"],
  ["#34d399", "#047857"],
  ["#f472b6", "#be185d"],
  ["#a78bfa", "#6d28d9"],
  ["#fb7185", "#be123c"],
  ["#facc15", "#a16207"],
  ["#2dd4bf", "#0f766e"],
];

function paletteFor(seed = "") {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

/**
 * A player's picture, or their initial on a colour of their own.
 * `online` adds a presence dot; pass undefined to show none.
 */
export default function Avatar({ user, size = 40, online, className = "" }) {
  const [broken, setBroken] = useState(false);
  const name = user?.is_deleted ? "?" : user?.display_name || user?.username || "?";
  const [from, to] = paletteFor(user?.username || name);
  const src = !broken && !user?.is_deleted ? user?.avatar_url : null;

  return (
    <span
      className={`relative inline-flex flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="w-full h-full rounded-full object-cover ring-1 ring-white/10"
        />
      ) : (
        <span
          className="w-full h-full rounded-full flex items-center justify-center font-bold text-slate-950 ring-1 ring-white/10"
          style={{ background: `linear-gradient(135deg, ${from}, ${to})`, fontSize: Math.max(10, size * 0.42) }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 end-0 rounded-full ring-2 ring-[#0b1020] ${online ? "bg-emerald-400" : "bg-slate-600"}`}
          style={{ width: Math.max(8, size * 0.26), height: Math.max(8, size * 0.26) }}
        />
      )}
    </span>
  );
}
