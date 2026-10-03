import { useTranslation } from "react-i18next";

/**
 * The admin console's shared pieces, in its light theme. Kept together so
 * every page reads the same: one heading style, one table, one set of
 * buttons and status pills.
 */

export const inputCls =
  "w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm";

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }) {
  return <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>{children}</div>;
}

const BUTTONS = {
  primary: "bg-amber-600 hover:bg-amber-700 text-white",
  secondary: "bg-gray-100 hover:bg-gray-200 text-gray-800",
  danger: "bg-rose-600 hover:bg-rose-700 text-white",
  success: "bg-emerald-600 hover:bg-emerald-700 text-white",
  ghost: "text-gray-600 hover:bg-gray-100",
};

export function Button({ variant = "secondary", size = "md", className = "", ...props }) {
  const sizing = size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizing} ${BUTTONS[variant]} ${className}`}
      {...props}
    />
  );
}

const PILLS = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  blue: "bg-sky-100 text-sky-800",
  gray: "bg-gray-100 text-gray-700",
};

export function Pill({ tone = "gray", children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${PILLS[tone]}`}>
      {children}
    </span>
  );
}

/** A table that scrolls sideways on a phone instead of breaking the layout. */
export function Table({ columns, children, empty, loading }) {
  const { t } = useTranslation();
  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                    column.end ? "text-end" : "text-start"
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
      </div>
      {loading ? (
        <p className="text-center text-gray-400 py-10">{t("loading")}</p>
      ) : (
        empty && <p className="text-center text-gray-500 py-10">{empty}</p>
      )}
    </Panel>
  );
}

export function Pager({ page, pages, total, onChange }) {
  const { t } = useTranslation();
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-5">
      <Button onClick={() => onChange(page - 1)} disabled={page <= 1}>
        {t("previous")}
      </Button>
      <span className="text-sm text-gray-600">
        {t("page")} {page} {t("of")} {pages}
        {total != null && <span className="text-gray-400"> · {t("n_total", { count: total })}</span>}
      </span>
      <Button onClick={() => onChange(page + 1)} disabled={page >= pages}>
        {t("next")}
      </Button>
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 rounded-lg text-sm mb-4" role="alert">
      {children}
    </div>
  );
}
