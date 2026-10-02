import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ar from "./locales/ar.json";

/**
 * Static bundles, plus the admin-edited overrides from /api/strings.
 *
 * The overrides are cached and applied before the first render, then refreshed
 * in the background. Fetching them first and applying them late made the
 * header visibly change name a moment after every page load.
 */
const OVERRIDES_KEY = "site_strings_cache";

function readCachedOverrides() {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
  } catch {
    return {};
  }
}

function storedLanguage() {
  try {
    const value = localStorage.getItem("lang");
    if (value === "en" || value === "ar") return value;
  } catch {
    /* storage unavailable */
  }
  // First visit: follow the browser.
  return navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** Empty overrides mean "use the built-in text", not "show nothing". */
function nonEmpty(bundle) {
  return Object.fromEntries(Object.entries(bundle || {}).filter(([, value]) => typeof value === "string" && value.trim()));
}

const cached = readCachedOverrides();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...nonEmpty(cached.en) } },
    ar: { translation: { ...ar, ...nonEmpty(cached.ar) } },
  },
  lng: storedLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

fetch("/api/strings")
  .then((response) => (response.ok ? response.json() : null))
  .then((data) => {
    if (!data) return;
    for (const lang of ["en", "ar"]) {
      if (data[lang]) i18n.addResourceBundle(lang, "translation", nonEmpty(data[lang]), true, true);
    }
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(data));
    } catch {
      /* quota or private mode: the next load simply fetches again */
    }
  })
  .catch(() => {
    // Offline or API down: the bundled strings still work.
  });

export default i18n;
