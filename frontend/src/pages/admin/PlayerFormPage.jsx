import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";

export default function PlayerFormPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name_en: "",
    name_ar: "",
    bio_en: "",
    bio_ar: "",
    country: "",
    rating: "",
    title: "",
    image_url: "",
    date_of_birth: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isEdit) {
      api.get(`/players/${id}`).then((r) => {
        setForm({
          name_en: r.data.name_en || "",
          name_ar: r.data.name_ar || "",
          bio_en: r.data.bio_en || "",
          bio_ar: r.data.bio_ar || "",
          country: r.data.country || "",
          rating: r.data.rating || "",
          title: r.data.title || "",
          image_url: r.data.image_url || "",
          date_of_birth: r.data.date_of_birth || "",
        });
      });
    }
  }, [id, isEdit]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
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
        rating: form.rating ? parseInt(form.rating) : null,
        date_of_birth: form.date_of_birth || null,
      };
      if (isEdit) {
        await api.put(`/players/${id}`, payload);
      } else {
        await api.post("/players", payload);
      }
      navigate("/admin/players");
    } catch {
      setError("Failed to save player");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEdit ? t("edit_player") : t("add_player")}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("name_en")} *</label>
            <input
              name="name_en"
              value={form.name_en}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("name_ar")} *</label>
            <input
              name="name_ar"
              value={form.name_ar}
              onChange={handleChange}
              required
              dir="rtl"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("title")}</label>
            <select
              name="title"
              value={form.title}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            >
              <option value="">—</option>
              <option value="GM">GM</option>
              <option value="IM">IM</option>
              <option value="FM">FM</option>
              <option value="CM">CM</option>
              <option value="WGM">WGM</option>
              <option value="WIM">WIM</option>
              <option value="WFM">WFM</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("rating")}</label>
            <input
              name="rating"
              type="number"
              value={form.rating}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("country")}</label>
            <input
              name="country"
              value={form.country}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("date_of_birth")}</label>
          <input
            name="date_of_birth"
            type="date"
            value={form.date_of_birth}
            onChange={handleChange}
            className="w-full sm:w-48 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("bio_en")}</label>
          <textarea
            name="bio_en"
            value={form.bio_en}
            onChange={handleChange}
            rows={4}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("bio_ar")}</label>
          <textarea
            name="bio_ar"
            value={form.bio_ar}
            onChange={handleChange}
            rows={4}
            dir="rtl"
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
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
            onClick={() => navigate("/admin/players")}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
