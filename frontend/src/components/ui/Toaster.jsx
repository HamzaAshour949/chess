import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Toast notifications.
 *
 * `toast({ title, body, tone, actions, duration })` from anywhere under the
 * provider. A duration of 0 keeps the toast until it is dismissed — used for
 * incoming challenges, which should not vanish while the player looks away.
 */
const ToastContext = createContext(null);

const TONES = {
  info: "border-sky-400/30",
  success: "border-emerald-400/40",
  error: "border-rose-400/40",
  challenge: "border-amber-400/50",
};

const ICONS = { info: "ℹ", success: "✓", error: "!", challenge: "♞" };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (options) => {
      counter.current += 1;
      const id = options.id ?? `t${counter.current}`;
      const entry = { tone: "info", duration: 5000, ...options, id };
      // Re-using an id replaces that toast instead of stacking a duplicate.
      setToasts((current) => [...current.filter((item) => item.id !== id).slice(-3), entry]);
      clearTimeout(timers.current.get(id));
      if (entry.duration) timers.current.set(id, setTimeout(() => dismiss(id), entry.duration));
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Toaster({ toasts, dismiss }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed z-[100] bottom-4 end-4 start-4 sm:start-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto rounded-2xl border ${TONES[item.tone] ?? TONES.info} bg-[#0f1628]/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-4 animate-fade-up`}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="w-8 h-8 flex-shrink-0 rounded-full bg-white/5 flex items-center justify-center text-sm font-bold text-amber-300"
            >
              {item.icon ?? ICONS[item.tone] ?? ICONS.info}
            </span>
            <div className="flex-1 min-w-0">
              {item.title && <p className="text-sm font-semibold text-white">{item.title}</p>}
              {item.body && (
                <p dir="auto" className="text-sm text-slate-300 mt-0.5 break-words text-start">
                  {item.body}
                </p>
              )}
              {item.actions?.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {item.actions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => {
                        action.onClick?.();
                        if (action.dismiss !== false) dismiss(item.id);
                      }}
                      className={`btn ${action.primary ? "btn-primary" : "btn-ghost"} px-3 py-1.5 text-xs`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="text-slate-500 hover:text-white p-1 -m-1 rounded"
              aria-label={t("dismiss")}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
