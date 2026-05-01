import { useState, useRef, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";

const languages = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
];

export default function LanguageDropdown({ variant = "light" }) {
  const { lang, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = languages.find((l) => l.code === lang) || languages[0];

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isDark = variant !== "light"; // default = dark on public pages

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isDark
            ? "bg-white/5 hover:bg-white/10 text-white border border-white/10"
            : "bg-amber-600 hover:bg-amber-700 text-white"
        }`}
      >
        <span>{current.flag}</span>
        <span>{current.label}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`absolute top-full mt-2 rounded-xl overflow-hidden z-50 ${
          isDark ? "surface-elev" : "bg-white border border-gray-200 shadow-lg"
        }`}
          style={{ minWidth: "160px", insetInlineEnd: 0 }}
        >
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLanguage(l.code);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                l.code === lang
                  ? isDark
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-amber-50 text-amber-700"
                  : isDark
                  ? "text-slate-300 hover:bg-white/5 hover:text-white"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
              {l.code === lang && <span className="ms-auto">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
