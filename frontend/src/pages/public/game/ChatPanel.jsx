import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../../api";
import { useLiveChat } from "../../../hooks/useLive";
import { formatTime, nameOf } from "../../../lib/format";
import { playSound } from "../../../lib/sound";

const MUTE_KEY = "mute_game_chat";

/**
 * In-game chat. Players write, spectators read. Explains itself when it is
 * off — muted by an admin, turned off in settings, or locked on this game —
 * instead of an input that silently fails.
 */
export default function ChatPanel({ gameId, role, chatDisabled, user }) {
  const { t, i18n } = useTranslation();
  const { messages, append } = useLiveChat(gameId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hidden, setHidden] = useState(() => localStorage.getItem(MUTE_KEY) === "1");
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const seen = useRef(messages.length);

  // Follow new messages only if the reader is already at the bottom; someone
  // scrolling back through the conversation should not be yanked down.
  useEffect(() => {
    const box = scrollRef.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
    if (messages.length > seen.current) {
      const newest = messages[messages.length - 1];
      if (!hidden && newest && newest.user_id !== user?.id) playSound("notify");
    }
    seen.current = messages.length;
  }, [messages, hidden, user?.id]);

  const onScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  };

  const send = async (event) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await api.post(`/games/${gameId}/chat`, { content });
      setText("");
      stickToBottom.current = true;
      append(res.data);
    } catch (err) {
      setError(apiError(err, t("action_failed")));
      setTimeout(() => setError(""), 3500);
    } finally {
      setSending(false);
    }
  };

  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  };

  let disabledReason = null;
  if (chatDisabled) disabledReason = t("chat_disabled_admin");
  else if (!role) disabledReason = t("spectator_chat_readonly");
  else if (user?.chat_muted) disabledReason = t("chat_muted_you");
  else if (user && user.notif_game_chat === false) disabledReason = t("chat_off_in_settings");

  return (
    <div className="surface-elev p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t("chat")}</h3>
        <button
          type="button"
          onClick={toggleHidden}
          className="text-xs text-slate-400 hover:text-amber-400"
          aria-pressed={hidden}
        >
          {hidden ? t("show_chat") : t("hide_chat")}
        </button>
      </div>

      {hidden ? (
        <p className="text-xs text-slate-500 py-2">{t("chat_hidden")}</p>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="space-y-1.5 h-48 overflow-y-auto pe-1 mb-3 text-sm"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <p className="text-xs text-slate-500">{t("no_messages_yet")}</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="leading-snug group">
                <span className={`font-semibold ${m.user_id === user?.id ? "text-amber-300" : "text-sky-300"}`}>
                  <bdi>{m.display_name || m.username || nameOf(null, t)}</bdi>
                </span>
                <span className="text-[10px] text-slate-600 ms-1.5 opacity-0 group-hover:opacity-100 transition">
                  {formatTime(m.created_at, i18n.language)}
                </span>
                <div dir="auto" className={`text-start ${m.is_deleted ? "text-slate-500 italic" : "text-slate-200 break-words"}`}>
                  {m.is_deleted ? t("message_removed") : m.content}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {disabledReason ? (
        <p className="text-xs text-slate-500">{disabledReason}</p>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <label htmlFor={`chat-${gameId}`} className="sr-only">
            {t("type_message")}
          </label>
          <input
            id={`chat-${gameId}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder={t("type_message")}
            autoComplete="off"
            className="input !py-2"
          />
          <button type="submit" disabled={!text.trim() || sending} className="btn btn-primary px-3 py-2 text-sm">
            {t("send")}
          </button>
        </form>
      )}
      {error && (
        <p className="text-xs text-rose-400 mt-1.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
