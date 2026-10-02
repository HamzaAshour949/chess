import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import api, { apiError } from "../../api";
import { useConfirm } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toaster";
import en from "../../locales/en.json";
import ar from "../../locales/ar.json";
import { useUnsavedWarning } from "./useUnsavedWarning";
import { Button, PageHeader, Panel, Pill, inputCls } from "./ui";

/**
 * Every string on the site, editable.
 *
 * The list is the built-in text plus any saved overrides, so an admin can
 * find and change anything — not only the keys someone happened to override
 * before. A field left empty falls back to the built-in text, shown as its
 * placeholder. Only changed rows are sent on save.
 */
export default function SiteStringsPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [overrides, setOverrides] = useState(null); // key -> { en, ar }
  const [edits, setEdits] = useState({}); // key -> { en?, ar? }
  const [search, setSearch] = useState("");
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ key: "", en: "", ar: "" });

  const dirtyCount = Object.keys(edits).length;
  useUnsavedWarning(dirtyCount > 0);

  const load = useCallback(() => {
    api
      .get("/strings/all")
      .then((r) => {
        const grouped = {};
        for (const row of r.data) {
          grouped[row.key] ??= { en: "", ar: "" };
          grouped[row.key][row.lang] = row.value;
        }
        setOverrides(grouped);
        setEdits({});
      })
      .catch((e) => toast({ tone: "error", title: apiError(e, t("load_failed")) }));
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!overrides) return [];
    const keys = new Set([...Object.keys(en), ...Object.keys(overrides)]);
    const q = search.trim().toLowerCase();
    return [...keys]
      .sort()
      .map((key) => ({
        key,
        defaults: { en: en[key] ?? "", ar: ar[key] ?? "" },
        saved: overrides[key] ?? null,
        value: {
          en: edits[key]?.en ?? overrides[key]?.en ?? "",
          ar: edits[key]?.ar ?? overrides[key]?.ar ?? "",
        },
        custom: !(key in en),
      }))
      .filter((row) => !onlyOverridden || row.saved)
      .filter(
        (row) =>
          !q ||
          row.key.toLowerCase().includes(q) ||
          [row.value.en, row.value.ar, row.defaults.en, row.defaults.ar].some((v) => v.toLowerCase().includes(q)),
      );
  }, [overrides, edits, search, onlyOverridden]);

  const change = (key, lang, value) => {
    setEdits((current) => ({ ...current, [key]: { ...current[key], [lang]: value } }));
  };

  const applyLive = (entries) => {
    // Show the new text in this tab straight away.
    for (const { key, lang, value } of entries) {
      const fallback = (lang === "ar" ? ar : en)[key];
      i18n.addResource(lang, "translation", key, value || fallback || "");
    }
  };

  const save = async () => {
    const entries = Object.entries(edits).flatMap(([key, langs]) =>
      Object.entries(langs).map(([lang, value]) => ({ key, lang, value })),
    );
    if (entries.length === 0) return;
    setSaving(true);
    try {
      await api.put("/strings/bulk", { strings: entries });
      applyLive(entries);
      toast({ tone: "success", title: t("strings_saved", { count: Object.keys(edits).length }) });
      load();
    } catch (e) {
      toast({ tone: "error", title: apiError(e, t("action_failed")) });
    } finally {
      setSaving(false);
    }
  };

  const reset = async (row) => {
    const ok = await confirm({
      title: t(row.custom ? "delete_string_title" : "reset_string_title", { key: row.key }),
      body: t(row.custom ? "delete_string_body" : "reset_string_body"),
      confirmLabel: t(row.custom ? "delete" : "reset"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/strings/${encodeURIComponent(row.key)}`);
      applyLive([
        { key: row.key, lang: "en", value: "" },
        { key: row.key, lang: "ar", value: "" },
      ]);
      load();
    } catch (e) {
      toast({ tone: "error", title: apiError(e, t("action_failed")) });
    }
  };

  const add = async (event) => {
    event.preventDefault();
    try {
      await api.post("/strings", { key: draft.key.trim(), value_en: draft.en, value_ar: draft.ar });
      setDraft({ key: "", en: "", ar: "" });
      setShowAdd(false);
      load();
    } catch (e) {
      toast({ tone: "error", title: apiError(e, t("action_failed")) });
    }
  };

  return (
    <div>
      <PageHeader title={t("site_strings")} subtitle={t("site_strings_sub")}>
        <Button onClick={() => setShowAdd((shown) => !shown)}>+ {t("add_string")}</Button>
        <Button variant="primary" onClick={save} disabled={saving || dirtyCount === 0}>
          {saving ? t("saving") : dirtyCount ? t("save_n_changes", { count: dirtyCount }) : t("save")}
        </Button>
      </PageHeader>

      {showAdd && (
        <Panel className="p-4 mb-4">
          <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1">{t("key")}</span>
              <input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="promo_banner" required className={inputCls} dir="ltr" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1">English</span>
              <input value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1">العربية</span>
              <input value={draft.ar} onChange={(e) => setDraft({ ...draft, ar: e.target.value })} dir="rtl" className={inputCls} />
            </label>
            <div className="sm:col-span-3 flex gap-2">
              <Button type="submit" variant="primary">
                {t("save")}
              </Button>
              <Button onClick={() => setShowAdd(false)}>{t("cancel")}</Button>
            </div>
          </form>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          placeholder={t("search_strings_placeholder")}
          aria-label={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputCls} sm:w-96`}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyOverridden} onChange={(e) => setOnlyOverridden(e.target.checked)} className="w-4 h-4 accent-amber-600" />
          {t("only_customised")}
        </label>
      </div>

      <Panel className="overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
          <div className="col-span-3">{t("key")}</div>
          <div className="col-span-4">English</div>
          <div className="col-span-4">العربية</div>
          <div className="col-span-1" />
        </div>
        {overrides === null ? (
          <p className="text-center text-gray-400 py-10">{t("loading")}</p>
        ) : (
          <div className="divide-y divide-gray-100 max-h-[65vh] overflow-y-auto">
            {rows.map((row) => (
              <div key={row.key} className={`grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3 items-start ${edits[row.key] ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                <div className="md:col-span-3 flex flex-col gap-1">
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 break-all w-fit" dir="ltr">
                    {row.key}
                  </code>
                  <div className="flex gap-1">
                    {row.custom && <Pill tone="blue">{t("custom")}</Pill>}
                    {row.saved && !row.custom && <Pill tone="amber">{t("customised")}</Pill>}
                    {edits[row.key] && <Pill tone="gray">{t("unsaved")}</Pill>}
                  </div>
                </div>
                <textarea
                  rows={1}
                  aria-label={`${row.key} English`}
                  value={row.value.en}
                  placeholder={row.defaults.en}
                  onChange={(e) => change(row.key, "en", e.target.value)}
                  className={`${inputCls} md:col-span-4 resize-y min-h-[38px]`}
                />
                <textarea
                  rows={1}
                  aria-label={`${row.key} العربية`}
                  value={row.value.ar}
                  placeholder={row.defaults.ar}
                  onChange={(e) => change(row.key, "ar", e.target.value)}
                  dir="rtl"
                  className={`${inputCls} md:col-span-4 resize-y min-h-[38px]`}
                />
                <div className="md:col-span-1 flex justify-end">
                  {row.saved && (
                    <button type="button" onClick={() => reset(row)} className="text-xs text-rose-600 hover:text-rose-800 p-1" title={t(row.custom ? "delete" : "reset")}>
                      {row.custom ? t("delete") : t("reset")}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="text-center text-gray-500 py-8">{t("no_results")}</p>}
          </div>
        )}
      </Panel>
      <p className="text-xs text-gray-500 mt-3">{t("strings_footer", { shown: rows.length })}</p>
    </div>
  );
}
