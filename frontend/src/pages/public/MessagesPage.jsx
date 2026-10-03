import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { getSocket } from "../../realtime";
import { useUserAuth } from "../../context/UserAuthContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../components/ui/Toaster";
import { useConfirm } from "../../components/ui/Dialog";
import Avatar from "../../components/Avatar";
import UserSearch from "../../components/UserSearch";
import { formatDate, formatTime, isolate, nameOf, sameDay, timeAgo } from "../../lib/format";

function ThreadList({ threads, activeId, onOpen, loaded }) {
  const { t, i18n } = useTranslation();
  if (!loaded) {
    return (
      <div className="space-y-2 p-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-xl shimmer" />
        ))}
      </div>
    );
  }
  if (threads.length === 0) return <p className="text-sm text-slate-500 p-4">{t("no_threads")}</p>;

  return (
    <ul className="space-y-1">
      {threads.map((thread) => {
        const other = thread.other_user;
        const active = activeId === other.id;
        return (
          <li key={other.id}>
            <button
              type="button"
              onClick={() => onOpen(other.id)}
              aria-current={active ? "true" : undefined}
              className={`w-full text-start p-3 rounded-xl transition flex items-center gap-3 ${
                active ? "bg-amber-500/15" : "hover:bg-white/5"
              }`}
            >
              <Avatar user={other} size={40} online={thread.online} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${thread.unread ? "text-white font-bold" : "text-white font-medium"}`}>
                    <bdi>{nameOf(other, t)}</bdi>
                  </span>
                  <span className="text-[11px] text-slate-500 flex-shrink-0">{timeAgo(thread.last_message?.created_at, i18n.language)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span dir="auto" className={`text-xs truncate text-start ${thread.unread ? "text-slate-200" : "text-slate-400"}`}>
                    {thread.blocked_by_me ? (
                      <i>{t("blocked")}</i>
                    ) : thread.last_message?.is_deleted ? (
                      <i>{t("message_removed")}</i>
                    ) : (
                      <>
                        {thread.last_message?.is_mine && `${t("you")}: `}
                        {thread.last_message?.content || "—"}
                      </>
                    )}
                  </span>
                  {thread.unread > 0 && (
                    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                      {thread.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Conversation({ userId, me, onChanged }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, partner: null, messages: [], blockedByMe: false, canMessage: true, unavailable: false });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const load = useCallback(() => {
    api
      .get(`/messages/with/${userId}`)
      .then((res) => {
        setState({
          loading: false,
          partner: res.data.other_user,
          online: res.data.online,
          messages: res.data.messages || [],
          blockedByMe: res.data.blocked_by_me,
          canMessage: res.data.can_message !== false,
          unavailable: false,
        });
        onChanged();
      })
      .catch((error) => {
        setState((s) => ({ ...s, loading: false, unavailable: error.response?.status === 403, missing: error.response?.status === 404 }));
      });
  }, [userId, onChanged]);

  // Mounted fresh for each conversation (keyed by user id), so there is no
  // previous conversation's state to clear first.
  useEffect(load, [load]);

  // Messages arriving for this conversation appear at once and are marked read.
  useEffect(() => {
    const socket = getSocket();
    const onMessage = (message) => {
      if (message.sender_id !== userId) return;
      setState((s) => (s.messages.some((m) => m.id === message.id) ? s : { ...s, messages: [...s.messages, message] }));
      api.post(`/messages/with/${userId}/read`).then(onChanged).catch(() => {});
    };
    socket.on("dm:new", onMessage);
    socket.on("connect", load);
    return () => {
      socket.off("dm:new", onMessage);
      socket.off("connect", load);
    };
  }, [userId, load, onChanged]);

  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [state.messages.length]);

  const send = async (event) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await api.post(`/messages/with/${userId}`, { content });
      setText("");
      setState((s) => ({ ...s, messages: [...s.messages, res.data] }));
      onChanged();
      inputRef.current?.focus();
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event) => {
    // Enter sends; Shift+Enter starts a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(event);
    }
  };

  const toggleBlock = async () => {
    const partner = state.partner;
    if (!partner) return;
    if (!state.blockedByMe) {
      const ok = await confirm({ title: t("block_title", { name: isolate(nameOf(partner, t)) }), body: t("block_body"), confirmLabel: t("block"), tone: "danger" });
      if (!ok) return;
    }
    try {
      if (state.blockedByMe) await api.delete(`/messages/blocks/${partner.id}`);
      else await api.post(`/messages/blocks/${partner.id}`);
      load();
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    }
  };

  if (state.loading) return <div className="flex-1 m-4 rounded-xl shimmer" />;
  if (state.unavailable || state.missing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
        <p>{state.missing ? t("player_not_found") : t("conversation_unavailable")}</p>
        <button type="button" className="btn btn-ghost mt-4" onClick={() => navigate("/messages")}>
          ← {t("messages")}
        </button>
      </div>
    );
  }

  const partner = state.partner;

  return (
    <>
      <div className="flex items-center gap-3 p-4 border-b border-white/10">
        <button type="button" onClick={() => navigate("/messages")} className="md:hidden text-slate-400 hover:text-white p-1" aria-label={t("back")}>
          <span className="rtl:hidden">←</span>
          <span className="hidden rtl:inline">→</span>
        </button>
        <Avatar user={partner} size={40} online={state.online} />
        <div className="flex-1 min-w-0">
          <Link to={`/u/${partner.username}`} className="text-white font-bold hover:text-amber-300 truncate block">
            <bdi>{nameOf(partner, t)}</bdi>
          </Link>
          <div className="text-xs text-slate-500">
            <bdi>@{partner.username}</bdi>
            {state.online && <span className="text-emerald-400"> · {t("online_now")}</span>}
          </div>
        </div>
        {!state.blockedByMe && (
          <Link to={`/play?opponent=${partner.username}`} className="btn btn-ghost px-3 py-1.5 text-xs hidden sm:inline-flex">
            ♞ {t("challenge")}
          </Link>
        )}
        <button type="button" onClick={toggleBlock} className="btn btn-ghost px-3 py-1.5 text-xs">
          {state.blockedByMe ? t("unblock") : t("block")}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1.5" aria-live="polite">
        {state.messages.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            {state.blockedByMe ? t("you_blocked_user") : t("start_conversation", { name: isolate(nameOf(partner, t)) })}
          </p>
        ) : (
          state.messages.map((m, index) => {
            const mine = m.sender_id === me.id;
            const previous = state.messages[index - 1];
            const newDay = !previous || !sameDay(previous.created_at, m.created_at);
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="text-center text-[11px] text-slate-500 my-3">
                    <span className="px-2 py-0.5 rounded-full bg-white/5">{formatDate(m.created_at, i18n.language)}</span>
                  </div>
                )}
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    dir="auto"
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                      mine ? "bg-amber-500/20 text-amber-50 rounded-ee-md" : "bg-white/[0.06] text-slate-100 rounded-es-md"
                    } ${m.is_deleted ? "italic opacity-50" : ""}`}
                  >
                    {m.is_deleted ? t("message_removed") : m.content}
                    <span className="block text-[10px] mt-1 text-end opacity-60">
                      {formatTime(m.created_at, i18n.language)}
                      {mine && m.is_read && ` · ${t("read")}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {state.blockedByMe ? (
        <p className="text-sm text-slate-400 text-center p-4 border-t border-white/10">{t("you_blocked_user")}</p>
      ) : !state.canMessage ? (
        <p className="text-sm text-slate-400 text-center p-4 border-t border-white/10">{t("dms_closed")}</p>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 p-3 border-t border-white/10">
          <label htmlFor="dm-input" className="sr-only">
            {t("type_message")}
          </label>
          <textarea
            id="dm-input"
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={2000}
            placeholder={t("type_message")}
            className="input resize-none max-h-32"
          />
          <button type="submit" disabled={!text.trim() || sending} className="btn btn-primary">
            {t("send")}
          </button>
        </form>
      )}
    </>
  );
}

export default function MessagesPage() {
  const { t } = useTranslation();
  const { user } = useUserAuth();
  const { userId } = useParams();
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useDocumentTitle(t("messages"));

  const loadThreads = useCallback(() => {
    api
      .get("/messages/threads")
      .then((r) => setThreads(r.data || []))
      .catch(() => {})
      .finally(() => {
        setLoaded(true);
        // The header badge counts unread messages; keep it in step.
        window.dispatchEvent(new CustomEvent("chesshub:activity-changed"));
      });
  }, []);

  useEffect(() => {
    loadThreads();
    const socket = getSocket();
    socket.on("dm:new", loadThreads);
    return () => socket.off("dm:new", loadThreads);
  }, [loadThreads]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <h1 className="text-3xl font-extrabold text-white mb-4">{t("messages")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-11rem)] min-h-[28rem]">
        <aside className={`surface-elev p-3 flex flex-col min-h-0 ${userId ? "hidden md:flex" : "flex"}`}>
          <div className="mb-3">
            <UserSearch onSelect={(person) => navigate(`/messages/${person.id}`)} excludeId={user?.id} placeholder={t("new_message_placeholder")} />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <ThreadList threads={threads} activeId={userId} onOpen={(id) => navigate(`/messages/${id}`)} loaded={loaded} />
          </div>
        </aside>

        <section className={`surface-elev flex flex-col min-h-0 ${userId ? "flex" : "hidden md:flex"}`}>
          {userId ? (
            <Conversation key={userId} userId={userId} me={user} onChanged={loadThreads} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <div className="text-4xl mb-3 text-slate-600" aria-hidden="true">
                ✉
              </div>
              <p>{t("select_thread")}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
