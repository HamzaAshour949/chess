import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../context/LanguageContext";

const LANGUAGES = [
  { code: "en", label: "English", short: "EN" },
  { code: "ar", label: "العربية", short: "ع" },
];

/**
 * Interface language picker. `tone="light"` for the light admin sidebar
 * footer, the default for the dark public header.
 */
export default function LanguageDropdown({ tone = "dark" }) {
  const { t } = useTranslation();
  const { lang, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const button =
    tone === "light"
      ? "bg-white/10 hover:bg-white/15 text-white border border-white/10"
      : "bg-white/5 hover:bg-white/10 text-white border border-white/10";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${button}`}
      >
        <span aria-hidden="true">🌐</span>
        <span className="hidden sm:inline">{current.label}</span>
        <span className="sm:hidden">{current.short}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("language")}
          className="absolute top-full mt-2 end-0 min-w-[10rem] rounded-xl overflow-hidden z-50 border border-white/10 shadow-2xl p-1"
          style={{ background: "#111827" }}
        >
          {LANGUAGES.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === lang}>
              <button
                type="button"
                lang={l.code}
                onClick={() => {
                  setLanguage(l.code);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  l.code === lang ? "bg-amber-500/15 text-amber-300" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
                {l.code === lang && <span className="ms-auto">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
