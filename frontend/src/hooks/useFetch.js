import { useCallback, useEffect, useState } from "react";
import api from "../api";

/**
 * GET a URL and keep the response, keyed by that URL.
 *
 * Keying matters: when the URL changes (typing in a search box, paging), a
 * slow answer for the old URL can arrive after the new one. It is stored
 * against its own URL and never shown for the new one, so results cannot jump
 * backwards. Loading is derived rather than set, so switching URLs shows the
 * loading state at once without an extra render.
 *
 * `reload()` fetches the same URL again and keeps the current data on screen
 * until the new answer arrives. Pass a null URL to fetch nothing.
 */
export function useFetch(url) {
  const [state, setState] = useState({ url: null, data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return undefined;
    let current = true;
    api
      .get(url)
      .then((res) => current && setState({ url, data: res.data, error: null }))
      .catch((error) => current && setState({ url, data: null, error }));
    return () => {
      current = false;
    };
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const fresh = state.url === url;

  return {
    data: fresh ? state.data : null,
    error: fresh ? state.error : null,
    loading: Boolean(url) && !fresh,
    status: fresh ? state.error?.response?.status ?? null : null,
    reload,
  };
}
