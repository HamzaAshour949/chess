import { createContext, useContext, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState(i18n.language || "en");
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem("lang", lang);
  }, [lang, dir]);

  const setLanguage = (newLang) => {
    setLang(newLang);
    i18n.changeLanguage(newLang);
  };

  const toggleLanguage = () => {
    setLanguage(lang === "en" ? "ar" : "en");
  };

  return (
    <LanguageContext.Provider value={{ lang, dir, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
