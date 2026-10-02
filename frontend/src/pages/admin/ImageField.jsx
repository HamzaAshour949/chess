import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { Button, Field } from "./ui";

/** Upload an editorial image and keep its URL in a form field. */
export default function ImageField({ value, onChange, label, onError }) {
  const { t } = useTranslation();
  const input = useRef(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/upload/image", form);
      onChange(res.data.url);
    } catch (error) {
      onError?.(apiError(error, t("upload_failed")));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field label={label ?? t("image")} hint={t("image_hint")}>
      <div className="flex items-center gap-4">
        {value ? (
          <img src={value} alt="" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
        ) : (
          <div className="w-24 h-24 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-2xl">♟</div>
        )}
        <div className="flex flex-col gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={upload} className="hidden" />
          <Button onClick={() => input.current?.click()} disabled={uploading}>
            {uploading ? t("uploading") : value ? t("replace_image") : t("upload_image")}
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange("")}>
              {t("remove")}
            </Button>
          )}
        </div>
      </div>
    </Field>
  );
}
