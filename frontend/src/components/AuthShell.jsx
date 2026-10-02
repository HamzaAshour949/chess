/** The centred card every sign-in, sign-up and recovery page is drawn in. */
export default function AuthShell({ icon = "♔", title, subtitle, children, footer }) {
  return (
    <div className="flex items-center justify-center px-4 py-10 sm:py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" aria-hidden="true" />
      <div
        className="absolute -top-20 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md">
        <div className="surface-elev p-6 sm:p-8 animate-fade-up">
          <div className="text-center mb-7">
            <div
              className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 items-center justify-center text-2xl text-slate-900 font-black mb-4 shadow-lg shadow-amber-500/30"
              aria-hidden="true"
            >
              {icon}
            </div>
            <h1 className="text-2xl font-extrabold text-white">{title}</h1>
            {subtitle && <p className="text-slate-400 text-sm mt-1.5">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="text-center mt-6 text-sm text-slate-400">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/** A form error, announced to screen readers. */
export function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-xl bg-rose-500/10 border border-rose-400/30 text-rose-200 text-sm px-3 py-2.5" role="alert">
      {children}
    </div>
  );
}

export function FormNotice({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 text-sm px-3 py-2.5" role="status">
      {children}
    </div>
  );
}
