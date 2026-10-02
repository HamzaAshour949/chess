import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useToast } from "../../components/ui/Toaster";
import ImageField from "./ImageField";
import { useUnsavedWarning } from "./useUnsavedWarning";
import { Button, ErrorBanner, Field, PageHeader, Panel, inputCls } from "./ui";

// The titles the API accepts, strongest first.
const TITLES = ["GM", "IM", "FM", "CM", "WGM", "WIM", "WFM", "WCM", "NM"];

const EMPTY = {
  name_en: "",
  name_ar: "",
  bio_en: "",
  bio_ar: "",
  country: "",
  rating: "",
  title: "",
  image_url: "",
  date_of_birth: "",
  is_player_of_month: false,
  is_tournament_winner: false,
};

export default function PlayerFormPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [loaded, setLoaded] = useState(!isEdit);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useUnsavedWarning(dirty);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/players/${id}`)
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
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        rating: form.rating === "" ? null : Number(form.rating),
        date_of_birth: form.date_of_birth || null,
      };
      if (isEdit) await api.put(`/players/${id}`, payload);
      else await api.post("/players", payload);
      setDirty(false);
      toast({ tone: "success", title: t("saved") });
      navigate("/admin/players");
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
      <PageHeader title={isEdit ? t("edit_player") : t("add_player")}>
        {isEdit && (
          <Link to={`/players/${id}`} target="_blank" rel="noreferrer" className="text-sm text-gray-600 hover:text-gray-900">
            {t("view")} ↗
          </Link>
        )}
      </PageHeader>

      <form onSubmit={handleSubmit}>
        <Panel className="p-6 space-y-5">
          <ErrorBanner>{error}</ErrorBanner>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={`${t("name_en")} *`} htmlFor="name_en">
              <input id="name_en" name="name_en" value={form.name_en} onChange={handleChange} required maxLength={200} className={inputCls} />
            </Field>
            <Field label={`${t("name_ar")} *`} htmlFor="name_ar">
              <input id="name_ar" name="name_ar" value={form.name_ar} onChange={handleChange} required maxLength={200} dir="rtl" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t("title")} htmlFor="title">
              <select id="title" name="title" value={form.title} onChange={handleChange} className={inputCls}>
                <option value="">—</option>
                {TITLES.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("rating")} htmlFor="rating">
              <input id="rating" name="rating" type="number" min="0" max="4000" inputMode="numeric" value={form.rating} onChange={handleChange} className={inputCls} />
            </Field>
            <Field label={t("country")} htmlFor="country">
              <input id="country" name="country" value={form.country} onChange={handleChange} maxLength={100} className={inputCls} />
            </Field>
          </div>

          <Field label={t("date_of_birth")} htmlFor="date_of_birth">
            <input id="date_of_birth" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} className={`${inputCls} sm:w-56`} />
          </Field>

          <Field label={t("bio_en")} htmlFor="bio_en">
            <textarea id="bio_en" name="bio_en" value={form.bio_en} onChange={handleChange} rows={5} className={inputCls} />
          </Field>
          <Field label={t("bio_ar")} htmlFor="bio_ar">
            <textarea id="bio_ar" name="bio_ar" value={form.bio_ar} onChange={handleChange} rows={5} dir="rtl" className={inputCls} />
          </Field>

          <ImageField value={form.image_url} onChange={(url) => update({ image_url: url })} onError={setError} />

          <div className="border-t border-gray-200 pt-5">
            <p className="text-sm font-medium text-gray-700 mb-3">{t("homepage_highlights")}</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="is_player_of_month" checked={form.is_player_of_month} onChange={handleChange} className="w-4 h-4 accent-amber-600" />
                🏆 {t("player_of_month")}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="is_tournament_winner" checked={form.is_tournament_winner} onChange={handleChange} className="w-4 h-4 accent-amber-600" />
                👑 {t("tournament_winner")}
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">{t("highlight_hint")}</p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
            <Button onClick={() => navigate("/admin/players")}>{t("cancel")}</Button>
          </div>
        </Panel>
      </form>
    </div>
  );
}
