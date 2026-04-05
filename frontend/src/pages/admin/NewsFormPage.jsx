import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";

export default function NewsFormPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    title_en: "",
    title_ar: "",
    content_en: "",
    content_ar: "",
    region: "both",
    image_url: "",
    published: false,
    player_id: "",
  });
  const [players, setPlayers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/players?per_page=100").then((r) => setPlayers(r.data.players));
    if (isEdit) {
      api.get(`/news/${id}`).then((r) => {
        setForm({
          title_en: r.data.title_en || "",
          title_ar: r.data.title_ar || "",
          content_en: r.data.content_en || "",
          content_ar: r.data.content_ar || "",
          region: r.data.region || "both",
          image_url: r.data.image_url || "",
          published: r.data.published || false,
          player_id: r.data.player_id || "",
        });
      });
    }
  }, [id, isEdit]);

  const handleChange = (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm({ ...form, [e.target.name]: value });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/upload/image", fd);
      setForm({ ...form, image_url: res.data.url });
    } catch {
      setError("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        player_id: form.player_id ? parseInt(form.player_id) : null,
      };
      if (isEdit) {
        await api.put(`/news/${id}`, payload);
      } else {
        await api.post("/news", payload);
      }
      navigate("/admin/news");
    } catch {
      setError("Failed to save news");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEdit ? t("edit_news") : t("add_news")}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("title_en")}</label>
            <input
              name="title_en"
              value={form.title_en}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("title_ar")}</label>
            <input
              name="title_ar"
              value={form.title_ar}
              onChange={handleChange}
              dir="rtl"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("content_en")}</label>
          <textarea
            name="content_en"
            value={form.content_en}
            onChange={handleChange}
            rows={6}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("content_ar")}</label>
          <textarea
            name="content_ar"
            value={form.content_ar}
            onChange={handleChange}
            rows={6}
            dir="rtl"
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("region")}</label>
            <select
              name="region"
              value={form.region}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            >
              <option value="both">{t("region_both")}</option>
              <option value="en">{t("region_en")}</option>
              <option value="ar">{t("region_ar")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("select_player")}</label>
            <select
              name="player_id"
              value={form.player_id}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            >
              <option value="">—</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_en}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("image")}</label>
          <div className="flex items-center gap-4">
            {form.image_url && (
              <img src={form.image_url} alt="" className="w-20 h-20 object-cover rounded-lg" />
            )}
            <label className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer text-sm font-medium text-gray-700 transition-colors">
              {uploading ? t("loading") : t("upload_image")}
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="published"
            id="published"
            checked={form.published}
            onChange={handleChange}
            className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <label htmlFor="published" className="text-sm font-medium text-gray-700">
            {t("published")}
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? t("loading") : t("save")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/news")}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
