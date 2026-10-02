// Set the text direction before the first paint, so an Arabic visitor never
// sees the page flip from left-to-right as it loads. A file rather than an
// inline script, because the Content-Security-Policy allows only same-origin
// scripts.
try {
  var lang =
    localStorage.getItem("lang") ||
    ((navigator.language || "").toLowerCase().indexOf("ar") === 0 ? "ar" : "en");
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
} catch {
  /* storage blocked: the app sets it once it loads */
}
