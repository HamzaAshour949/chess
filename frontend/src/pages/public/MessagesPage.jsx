import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { getSocket } from "../../realtime";
import { useUserAuth } from "../../context/UserAuthContext";

export default function MessagesPage() {
  const { t } = useTranslation();
  const { user } = useUserAuth();
  const { userId } = useParams();
  const navigate = useNavigate();

  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [partner, setPartner] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [blocks, setBlocks] = useState([]);
  const scrollRef = useRef(null);

  const loadThreads = useCallback(() => {
    api.get("/messages/threads").then((r) => setThreads(r.data || [])).catch(() => {});
  }, []);

  const loadBlocks = useCallback(() => {
    api.get("/messages/blocks").then((r) => setBlocks(r.data || [])).catch(() => {});
  }, []);

  const loadConvo = useCallback(() => {
    if (!userId) return;
    api.get(`/messages/with/${userId}`).then((r) => {
      setMessages(r.data.messages || []);
      setPartner(r.data.other_user || null);
      loadThreads();
    }).catch(() => {});
  }, [userId, loadThreads]);

  useEffect(() => { loadThreads(); loadBlocks(); }, [loadThreads, loadBlocks]);
  useEffect(() => { loadConvo(); }, [loadConvo]);

  // Incoming messages are pushed to the recipient's own channel, so the
  // thread updates on arrival rather than on a 3-second timer.
  useEffect(() => {
    const socket = getSocket();
    const onMessage = (message) => {
      loadThreads();
      if (userId && (message.sender_id === userId || message.recipient_id === userId)) {
        setMessages((current) =>
          current.some((m) => m.id === message.id) ? current : [...current, message]
        );
      }
    };
    socket.on("dm:new", onMessage);
    socket.on("connect", loadConvo);
    return () => {
      socket.off("dm:new", onMessage);
      socket.off("connect", loadConvo);
    };
  }, [userId, loadConvo, loadThreads]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !userId) return;
    try {
      const res = await api.post(`/messages/with/${userId}`, { content: text });
      setText("");
      // Show our own message straight away; the sender gets no push for it.
      setMessages((current) => [...current, res.data]);
      loadThreads();
    } catch (err) {
      setError(apiError(err));
      setTimeout(() => setError(""), 2500);
    }
  };

  const block = async (id) => {
    try { await api.post(`/messages/blocks/${id}`); loadBlocks(); }
    catch (err) { setError(apiError(err)); }
  };
  const unblock = async (id) => {
    try { await api.delete(`/messages/blocks/${id}`); loadBlocks(); }
    catch (err) { setError(apiError(err)); }
  };

  const isBlocked = partner ? blocks.some((b) => b.id === partner.id) : false;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-3xl font-extrabold text-white mb-4">{t("messages")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <aside className="surface-elev p-3 max-h-[70vh] overflow-y-auto">
          {threads.length === 0 ? (
            <p className="text-xs text-slate-500 p-3">{t("no_threads")}</p>
          ) : threads.map((th) => (
            <button key={th.user.id}
              onClick={() => navigate(`/messages/${th.user.id}`)}
              className={`w-full text-start p-3 rounded transition flex items-center gap-3 ${
                userId == th.user.id ? "bg-amber-500/15" : "hover:bg-white/5"
              }`}>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-slate-200 text-sm">
                {(th.user.display_name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium text-sm truncate">{th.user.display_name}</span>
                  {th.unread > 0 && <span className="chip chip-gold text-xs">{th.unread}</span>}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {th.last_message?.is_deleted ? <i>{t("deleted")}</i> : th.last_message?.content || "—"}
                </div>
              </div>
            </button>
          ))}
        </aside>

        <section className="surface-elev p-4 flex flex-col min-h-[70vh]">
          {!userId ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">{t("select_thread")}</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                <div>
                  <div className="text-white font-bold">{partner?.display_name || "—"}</div>
                  <div className="text-xs text-slate-500">@{partner?.username}</div>
                </div>
                {partner && (
                  isBlocked ? (
                    <button onClick={() => unblock(partner.id)} className="btn btn-ghost text-xs">{t("unblock")}</button>
                  ) : (
                    <button onClick={() => block(partner.id)} className="btn btn-ghost text-xs">{t("block")}</button>
                  )
                )}
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 mb-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">{t("no_messages_yet")}</p>
                ) : messages.map((m) => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${
                        mine ? "bg-amber-500/20 text-amber-100" : "bg-white/5 text-slate-200"
                      } ${m.is_deleted ? "italic opacity-50" : ""}`}>
                        {m.is_deleted ? t("deleted") : m.content}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isBlocked ? (
                <p className="text-xs text-rose-400 text-center">{t("you_blocked_user")}</p>
              ) : (
                <form onSubmit={send} className="flex gap-2">
                  <input value={text} onChange={(e) => setText(e.target.value)}
                    maxLength={2000} placeholder={t("type_message")}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-slate-500" />
                  <button type="submit" className="btn btn-primary">{t("send")}</button>
                </form>
              )}
              {error && <p className="text-xs text-rose-400 mt-1.5">{error}</p>}
            </>
          )}
        </section>
      </div>
      <div className="mt-4">
        <Link to="/play" className="btn btn-ghost">← {t("play")}</Link>
      </div>
    </div>
  );
}
