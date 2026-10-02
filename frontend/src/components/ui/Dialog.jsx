import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Promise-based confirm and prompt dialogs, replacing `window.confirm` and
 * `window.prompt`: those block the page (a live game's clock and socket
 * included), cannot be styled or translated, and some browsers suppress them.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title, body, tone: "danger" })) ...
 *   const reason = await confirm({ title, input: { label } }); // string | null
 */
const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setDialog({ ...options, resolve });
      }),
    [],
  );

  const close = useCallback(
    (result) => {
      dialog?.resolve(result);
      setDialog(null);
    },
    [dialog],
  );

  const value = useMemo(() => confirm, [confirm]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && <DialogView dialog={dialog} close={close} />}
    </DialogContext.Provider>
  );
}

function DialogView({ dialog, close }) {
  const { t } = useTranslation();
  const titleId = useId();
  const bodyId = useId();
  const [value, setValue] = useState(dialog.input?.initial ?? "");
  const panel = useRef(null);
  const hasInput = Boolean(dialog.input);
  const cancelResult = hasInput ? null : false;

  useEffect(() => {
    const previous = document.activeElement;
    // Focus the field, or the safe choice — never a destructive button.
    const target = panel.current?.querySelector("[data-autofocus]");
    target?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") close(cancelResult);
      if (event.key === "Tab" && panel.current) {
        // Keep focus inside the dialog.
        const focusable = panel.current.querySelectorAll("button, input, textarea, [tabindex]");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, cancelResult]);

  const submit = (event) => {
    event.preventDefault();
    if (hasInput) {
      if (dialog.input.required && !value.trim()) return;
      close(value.trim());
    } else {
      close(true);
    }
  };

  const danger = dialog.tone === "danger";

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => close(cancelResult)} />
      <form
        ref={panel}
        onSubmit={submit}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={dialog.body ? bodyId : undefined}
        className="relative w-full max-w-md surface-elev p-6 animate-fade-up"
        style={{ background: "#0f1628" }}
      >
        <h2 id={titleId} className="text-lg font-bold text-white">
          {dialog.title}
        </h2>
        {dialog.body && (
          <p id={bodyId} className="text-sm text-slate-300 mt-2 leading-relaxed">
            {dialog.body}
          </p>
        )}
        {hasInput && (
          <label className="block mt-4">
            <span className="block text-xs font-semibold text-slate-300 mb-1.5">{dialog.input.label}</span>
            {dialog.input.multiline ? (
              <textarea
                data-autofocus
                className="input min-h-[96px]"
                maxLength={dialog.input.maxLength ?? 1000}
                placeholder={dialog.input.placeholder}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            ) : (
              <input
                data-autofocus
                type={dialog.input.type ?? "text"}
                className="input"
                maxLength={dialog.input.maxLength ?? 500}
                placeholder={dialog.input.placeholder}
                autoComplete={dialog.input.autoComplete ?? "off"}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </label>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => close(cancelResult)}
            {...(hasInput ? {} : { "data-autofocus": true })}
          >
            {dialog.cancelLabel ?? t("cancel")}
          </button>
          <button
            type="submit"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            disabled={hasInput && dialog.input.required && !value.trim()}
          >
            {dialog.confirmLabel ?? t("confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function useConfirm() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useConfirm must be used inside <DialogProvider>");
  return context;
}
