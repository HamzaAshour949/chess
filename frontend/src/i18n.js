import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ar from "./locales/ar.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en } },
    ar: { translation: { ...ar } },
  },
  lng: localStorage.getItem("lang") || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Load overrides from API (site strings managed in admin)
fetch("/api/strings")
  .then((r) => r.json())
  .then((data) => {
    if (data.en) {
      i18n.addResourceBundle("en", "translation", data.en, true, true);
    }
    if (data.ar) {
      i18n.addResourceBundle("ar", "translation", data.ar, true, true);
    }
  })
  .catch(() => {
    // Silently fall back to static locale files
  });

export default i18n;
