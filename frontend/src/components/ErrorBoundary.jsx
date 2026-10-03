import { Component } from "react";
import i18n from "../i18n";

/**
 * Last line of defence against a render crash.
 *
 * Without it one broken component unmounts the whole tree and the visitor is
 * left with a blank page — which is exactly what an undefined `motion` in the
 * homepage carousel used to do. `resetKey` (the route) clears the error when
 * the visitor navigates somewhere else.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render error", error, info?.componentStack);
  }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">
          ♚
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-2">{t("error_title")}</h1>
        <p className="text-slate-400 mb-6">{t("error_body")}</p>
        <div className="flex justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            {t("reload")}
          </button>
          <a href="/" className="btn btn-ghost">
            {t("home")}
          </a>
        </div>
      </div>
    );
  }
}
