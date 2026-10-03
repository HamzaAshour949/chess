import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useToast } from "../../components/ui/Toaster";
import ImageField from "./ImageField";
import { useUnsavedWarning } from "./useUnsavedWarning";
import { Button, ErrorBanner, Field, PageHeader, Panel, inputCls } from "./ui";

const EMPTY = {
  title_en: "",
  title_ar: "",
  content_en: "",
  content_ar: "",
  region: "both",
  image_url: "",
  published: false,
  is_featured: false,
  player_id: "",
};

export default function NewsFormPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [players, setPlayers] = useState([]);
  const [loaded, setLoaded] = useState(!isEdit);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useUnsavedWarning(dirty);

  useEffect(() => {
    api
      .get("/players?per_page=100")
      .then((r) => setPlayers(r.data.players || []))
      .catch(() => {});
    if (!isEdit) return;
    api
      .get(`/news/${id}`)
      .then((r) => {
        setForm(Object.fromEntries(Object.keys(EMPTY).map((key) => [key, r.data[key] ?? EMPTY[key]])));
        setLoaded(true);
      })
      .catch((e) => setError(apiError(e, t("load_failed"))));
  }, [id, isEdit, t]);

  const update = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const handleChange = (e) => update({ [e.target.name]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title_en.trim() && !form.title_ar.trim()) {
      setError(t("news_title_required"));
      return;
    }
    setError("");
    setSaving(true);
    try {
      // Player ids are ObjectId strings; they used to go through parseInt,
      // which turned every one into NaN and made the save fail.
      const payload = { ...form, player_id: form.player_id || null };
      if (isEdit) await api.put(`/news/${id}`, payload);
      else await api.post("/news", payload);
      setDirty(false);
      toast({ tone: "success", title: t("saved") });
      navigate("/admin/news");
    } catch (err) {
      setError(apiError(err, t("action_failed")));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded && !error) return <p className="text-gray-500">{t("loading")}</p>;

  return (
    <div className="max-w-3xl">
      <PageHeader title={isEdit ? t("edit_news") : t("add_news")}>
        {isEdit && (
          <Link to={`/news/${id}`} target="_blank" rel="noreferrer" className="text-sm text-gray-600 hover:text-gray-900">
            {t("preview")} ↗
          </Link>
        )}
      </PageHeader>

      <form onSubmit={handleSubmit}>
        <Panel className="p-6 space-y-5">
          <ErrorBanner>{error}</ErrorBanner>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("title_en")} htmlFor="title_en">
              <input id="title_en" name="title_en" value={form.title_en} onChange={handleChange} maxLength={500} className={inputCls} />
            </Field>
            <Field label={t("title_ar")} htmlFor="title_ar">
              <input id="title_ar" name="title_ar" value={form.title_ar} onChange={handleChange} maxLength={500} dir="rtl" className={inputCls} />
            </Field>
          </div>

          <Field label={t("content_en")} htmlFor="content_en">
            <textarea id="content_en" name="content_en" value={form.content_en} onChange={handleChange} rows={8} className={inputCls} />
          </Field>
          <Field label={t("content_ar")} htmlFor="content_ar">
            <textarea id="content_ar" name="content_ar" value={form.content_ar} onChange={handleChange} rows={8} dir="rtl" className={inputCls} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("region")} htmlFor="region" hint={t("region_hint")}>
              <select id="region" name="region" value={form.region} onChange={handleChange} className={inputCls}>
                <option value="both">{t("region_both")}</option>
                <option value="en">{t("region_en")}</option>
                <option value="ar">{t("region_ar")}</option>
              </select>
            </Field>
            <Field label={t("select_player")} htmlFor="player_id">
              <select id="player_id" name="player_id" value={form.player_id} onChange={handleChange} className={inputCls}>
                <option value="">—</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name_en}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <ImageField value={form.image_url} onChange={(url) => update({ image_url: url })} onError={setError} />

          <div className="border-t border-gray-200 pt-5 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" name="published" checked={form.published} onChange={handleChange} className="w-4 h-4 accent-amber-600" />
              {t("published")}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" name="is_featured" checked={form.is_featured} onChange={handleChange} className="w-4 h-4 accent-amber-600" />
              ⭐ {t("mark_featured")}
            </label>
            <p className="text-xs text-gray-500">{t("featured_hint")}</p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
            <Button onClick={() => navigate("/admin/news")}>{t("cancel")}</Button>
          </div>
        </Panel>
      </form>
    </div>
  );
}
