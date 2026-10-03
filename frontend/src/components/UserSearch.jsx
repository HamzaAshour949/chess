import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebounced } from "../hooks/useDebounced";
import { useFetch } from "../hooks/useFetch";
import Avatar from "./Avatar";
import { nameOf } from "../lib/format";

/**
 * Find a player by username or display name. Used to start a conversation and
 * to challenge someone directly. Keyboard: arrows move, Enter picks, Esc closes.
 */
export default function UserSearch({ onSelect, excludeId, placeholder, autoFocus = false }) {
  const { t } = useTranslation();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const box = useRef(null);

  const term = useDebounced(query.trim(), 200);
  const { data, loading } = useFetch(term ? `/users?search=${encodeURIComponent(term)}&limit=8` : null);
  const results = query.trim() ? (data ?? []).filter((user) => user.id !== excludeId) : [];
  const active = Math.min(highlight, Math.max(0, results.length - 1));

  useEffect(() => {
    const onPointer = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const pick = (user) => {
    onSelect(user);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={box}>
      <input
        type="search"
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder ?? t("search_players_placeholder")}
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && query.trim() && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-white/10 shadow-2xl p-1"
          style={{ background: "#111827" }}
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">{loading || term !== query.trim() ? t("loading") : t("no_players_found")}</li>
          ) : (
            results.map((user, index) => (
              <li key={user.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(user)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-start ${
                    index === active ? "bg-white/10" : ""
                  }`}
                >
                  <Avatar user={user} size={28} online={user.online} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-white truncate"><bdi>{nameOf(user, t)}</bdi></span>
                    <span className="block text-xs text-slate-400 truncate"><bdi>@{user.username}</bdi></span>
                  </span>
                  <span className="text-xs font-semibold text-amber-400 tabular-nums">{user.online_rating}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
