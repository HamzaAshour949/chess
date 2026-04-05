import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../../api";

export default function SiteStringsPage() {
  const { t } = useTranslation();
  const [strings, setStrings] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValueEn, setNewValueEn] = useState("");
  const [newValueAr, setNewValueAr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");

  const fetchStrings = () => {
    api.get("/strings/all").then((r) => {
      // Group by key: [{key, value_en, value_ar}, ...]
      const grouped = {};
      r.data.forEach((s) => {
        if (!grouped[s.key]) grouped[s.key] = { key: s.key, value_en: "", value_ar: "" };
        if (s.lang === "en") grouped[s.key].value_en = s.value;
        if (s.lang === "ar") grouped[s.key].value_ar = s.value;
      });
      const list = Object.values(grouped).sort((a, b) => a.key.localeCompare(b.key));
      setStrings(list);
      setFiltered(list);
    });
  };

  useEffect(fetchStrings, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(strings);
    } else {
      const q = search.toLowerCase();
      setFiltered(
        strings.filter(
          (s) =>
            s.key.toLowerCase().includes(q) ||
            s.value_en.toLowerCase().includes(q) ||
            s.value_ar.toLowerCase().includes(q)
        )
      );
    }
  }, [search, strings]);

  const handleChange = (key, lang, value) => {
    setStrings((prev) =>
      prev.map((s) =>
        s.key === key ? { ...s, [lang === "en" ? "value_en" : "value_ar"]: value } : s
      )
    );
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = [];
      strings.forEach((s) => {
        payload.push({ key: s.key, lang: "en", value: s.value_en });
        payload.push({ key: s.key, lang: "ar", value: s.value_ar });
      });
      await api.put("/strings/bulk", { strings: payload });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save strings");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newKey.trim()) return;
    setError("");
    try {
      await api.post("/strings", {
        key: newKey.trim(),
        value_en: newValueEn,
        value_ar: newValueAr,
      });
      setNewKey("");
      setNewValueEn("");
      setNewValueAr("");
      setShowAdd(false);
      fetchStrings();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to add string");
    }
  };

  const handleDelete = async (key) => {
    if (!window.confirm(`Delete "${key}"?`)) return;
    try {
      await api.delete(`/strings/${encodeURIComponent(key)}`);
      fetchStrings();
    } catch {
      setError("Failed to delete string");
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("site_strings") || "Site Strings"}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors text-sm"
          >
            + {t("add_string") || "Add String"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
          >
            {saving ? t("loading") : saved ? "✓ Saved" : t("save")}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>
      )}

      {showAdd && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <h3 className="font-medium text-gray-900 mb-3">{t("add_string") || "Add New String"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Key</label>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g. welcome_message"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">English Value</label>
              <input
                value={newValueEn}
                onChange={(e) => setNewValueEn(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Arabic Value</label>
              <input
                value={newValueAr}
                onChange={(e) => setNewValueAr(e.target.value)}
                dir="rtl"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium"
            >
              {t("save")}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          placeholder={`${t("search")} keys or values...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-96 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase">
          <div className="col-span-3">Key</div>
          <div className="col-span-4">English</div>
          <div className="col-span-4">العربية</div>
          <div className="col-span-1"></div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
          {filtered.map((s) => (
            <div key={s.key} className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 items-start hover:bg-gray-50">
              <div className="md:col-span-3 flex items-center">
                <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 break-all">
                  {s.key}
                </code>
              </div>
              <div className="md:col-span-4">
                <input
                  value={s.value_en}
                  onChange={(e) => handleChange(s.key, "en", e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-gray-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                />
              </div>
              <div className="md:col-span-4">
                <input
                  value={s.value_ar}
                  onChange={(e) => handleChange(s.key, "ar", e.target.value)}
                  dir="rtl"
                  className="w-full px-3 py-1.5 rounded border border-gray-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                />
              </div>
              <div className="md:col-span-1 flex justify-end">
                <button
                  onClick={() => handleDelete(s.key)}
                  className="text-red-400 hover:text-red-600 text-xs p-1"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-500 py-8">{t("no_results")}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        {filtered.length} of {strings.length} strings shown. Changes are saved when you click Save.
      </p>
    </div>
  );
}
