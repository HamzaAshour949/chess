import { useState } from "react";
import { useTranslation } from "react-i18next";

/** A password field with a show/hide toggle, so typos can be caught on a phone. */
export default function PasswordInput({ id, value, onChange, autoComplete = "current-password", ...rest }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        className="input pe-12"
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        dir="ltr"
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        className="absolute inset-y-0 end-0 px-3 text-xs font-semibold text-slate-400 hover:text-white"
        aria-label={visible ? t("hide_password") : t("show_password")}
        aria-pressed={visible}
      >
        {visible ? t("hide") : t("show")}
      </button>
    </div>
  );
}
