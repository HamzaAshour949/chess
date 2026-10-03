import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format";

const WIDTH = 600;
const HEIGHT = 160;
const PAD = { top: 12, right: 12, bottom: 20, left: 40 };

/**
 * Rating after each rated game, as a line. Hover or tap a point for its
 * value and date; the range is labelled on the axis so the shape is honest.
 */
export default function RatingChart({ points }) {
  const { t, i18n } = useTranslation();
  const gradientId = useId();
  const [hover, setHover] = useState(null);

  const model = useMemo(() => {
    if (!points || points.length < 2) return null;
    const ratings = points.map((p) => p.rating);
    let min = Math.min(...ratings);
    let max = Math.max(...ratings);
    if (max - min < 40) {
      const mid = (max + min) / 2;
      min = mid - 20;
      max = mid + 20;
    }
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i) => PAD.left + (i / (points.length - 1)) * innerW;
    const y = (r) => PAD.top + (1 - (r - min) / (max - min)) * innerH;
    const coords = points.map((p, i) => [x(i), y(p.rating)]);
    const line = coords.map(([cx, cy], i) => `${i ? "L" : "M"}${cx.toFixed(1)},${cy.toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1)},${HEIGHT - PAD.bottom} L${PAD.left},${HEIGHT - PAD.bottom} Z`;
    return { min: Math.round(min), max: Math.round(max), coords, line, area };
  }, [points]);

  if (!model) {
    return <p className="text-sm text-slate-500 py-6 text-center">{t("rating_history_empty")}</p>;
  }

  const active = hover !== null ? points[hover] : points[points.length - 1];
  const [ax, ay] = model.coords[hover ?? points.length - 1];

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between text-sm mb-2">
        <span className="text-slate-400">{t("rating_history")}</span>
        <span className="text-white font-semibold tabular-nums">
          {active.rating} <span className="text-slate-500 font-normal text-xs">{formatDate(active.at, i18n.language)}</span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={t("rating_history_label", { from: points[0].rating, to: points[points.length - 1].rating, count: points.length })}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const relative = ((event.clientX - box.left) / box.width) * WIDTH;
          const ratio = (relative - PAD.left) / (WIDTH - PAD.left - PAD.right);
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f5b84a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#f5b84a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[model.max, model.min].map((value, i) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={i ? HEIGHT - PAD.bottom : PAD.top}
              y2={i ? HEIGHT - PAD.bottom : PAD.top}
              stroke="rgba(255,255,255,0.08)"
            />
            <text x={PAD.left - 6} y={(i ? HEIGHT - PAD.bottom : PAD.top) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {value}
            </text>
          </g>
        ))}
        <path d={model.area} fill={`url(#${gradientId})`} />
        <path d={model.line} fill="none" stroke="#f5b84a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={ax} cy={ay} r="4.5" fill="#f5b84a" stroke="#0b1020" strokeWidth="2" />
      </svg>
    </figure>
  );
}
