import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";

export default function VerifyOtpPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { verifyOtp, resendOtp } = useUserAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get("email") || "";

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const setDigit = (i, val) => {
    const v = val.replace(/\D/g, "").slice(-1);
    setDigits((d) => { const n = [...d]; n[i] = v; return n; });
    if (v && i < 5) inputs.current[i + 1]?.focus();
  };
  const onKey = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };
  const onPaste = (e) => {
    const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const arr = text.split("").concat(Array(6).fill("")).slice(0, 6);
    setDigits(arr);
    inputs.current[Math.min(text.length, 5)]?.focus();
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!email) { setError("Missing email"); return; }
    const code = digits.join("");
    if (code.length !== 6) return;
    setBusy(true); setError("");
    try {
      await verifyOtp(email, code);
      navigate("/play");
    } catch (err) {
      setError(err.response?.data?.error || "Invalid code");
      setDigits(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    } finally { setBusy(false); }
  };

  const resend = async () => {
    if (cooldown > 0 || !email) return;
    setInfo(""); setError("");
    try {
      await resendOtp(email, lang);
      setInfo(t("code_resent"));
      setCooldown(60);
    } catch (err) {
      setError(err.response?.data?.error || "Failed");
    }
  };

  return (
    <div className="flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="surface-elev p-8 animate-fade-up">
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/30 items-center justify-center text-2xl mb-4">✉</div>
            <h1 className="text-2xl font-extrabold text-white">{t("verify_title")}</h1>
            <p className="text-slate-400 text-sm mt-2">{t("verify_subtitle", { email })}</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="flex justify-center gap-2 sm:gap-3" onPaste={onPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-amber-400/60 focus:bg-white/10 focus:shadow-[0_0_0_3px_rgba(245,184,74,0.18)]"
                  style={{ direction: "ltr" }}
                />
              ))}
            </div>

            {error && <div className="chip chip-red w-full justify-center py-2">{error}</div>}
            {info && <div className="chip chip-green w-full justify-center py-2">{info}</div>}

            <button type="submit" disabled={busy || digits.join("").length !== 6} className="btn btn-primary btn-lg w-full">
              {busy ? t("verifying") : t("verify")}
            </button>

            <div className="text-center text-sm text-slate-400">
              <button type="button" onClick={resend} disabled={cooldown > 0}
                className="text-amber-400 hover:text-amber-300 disabled:text-slate-500 disabled:cursor-not-allowed font-medium">
                {cooldown > 0 ? `${t("resend_code")} (${cooldown}s)` : t("resend_code")}
              </button>
            </div>
          </form>

          <div className="text-center mt-6 text-xs text-slate-500">
            <Link to="/login" className="hover:text-slate-300">← {t("sign_in")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
