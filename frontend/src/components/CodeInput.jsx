import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * Six boxes for a one-time code. Typing advances, Backspace goes back, a
 * pasted code fills every box, and phones can offer the code from the SMS or
 * email bar (autocomplete="one-time-code"). `onComplete` fires when all six
 * digits are in, so the form submits itself.
 */
export default function CodeInput({ value, onChange, onComplete, disabled, length = 6 }) {
  const { t } = useTranslation();
  const inputs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const commit = (next) => {
    onChange(next);
    if (next.length === length && /^\d+$/.test(next)) onComplete?.(next);
  };

  const setAt = (index, raw) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length > 1) {
      // Autofill or a paste landing in one box: spread it across the rest.
      const next = (value.slice(0, index) + clean).slice(0, length);
      commit(next);
      inputs.current[Math.min(next.length, length - 1)]?.focus();
      return;
    }
    const chars = digits.slice();
    chars[index] = clean;
    const next = chars.join("").slice(0, length);
    commit(next);
    if (clean && index < length - 1) inputs.current[index + 1]?.focus();
  };

  const onKeyDown = (index, event) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) inputs.current[index + 1]?.focus();
  };

  const onPaste = (event) => {
    const text = (event.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    event.preventDefault();
    commit(text);
    inputs.current[Math.min(text.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3" dir="ltr" onPaste={onPaste} role="group" aria-label={t("verification_code")}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          pattern="\d*"
          maxLength={index === 0 ? length : 1}
          disabled={disabled}
          aria-label={t("digit_n", { n: index + 1 })}
          value={digit}
          onChange={(event) => setAt(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          className="w-11 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-amber-400/60 focus:bg-white/10 focus:shadow-[0_0_0_3px_rgba(245,184,74,0.18)] disabled:opacity-50"
        />
      ))}
    </div>
  );
}
