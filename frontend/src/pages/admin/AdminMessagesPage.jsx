import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useConfirm } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toaster";
import { formatDateTime } from "../../lib/format";
import { Button, PageHeader, Pager, Pill, Table, inputCls } from "./ui";

function who(person) {
  return person?.display_name || person?.username || "—";
}

export default function AdminMessagesPage() {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [tab, setTab] = useState("game");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ messages: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), per_page: "30", only: showDeleted ? "all" : "active" });
    if (search.trim()) p.set("search", search.trim());
    const url = tab === "game" ? `/games/admin/messages?${p}` : `/messages/admin/dms?${p}`;
    setLoading(true);
    api
      .get(url)
      .then((r) => setData(r.data))
      .catch((e) => toast({ tone: "error", title: apiError(e, t("load_failed")) }))
      .finally(() => setLoading(false));
  }, [tab, search, showDeleted, page, toast, t]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const remove = async (message) => {
    const ok = await confirm({ title: t("confirm_delete_message"), body: message.content, confirmLabel: t("delete"), tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(tab === "game" ? `/games/admin/messages/${message.id}` : `/messages/admin/dms/${message.id}`);
      load();
    } catch (err) {
      toast({ tone: "error", title: apiError(err, t("action_failed")) });
    }
  };

  const switchTab = (next) => {
    setTab(next);
    setPage(1);
  };

  const tabCls = (active) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-200"}`;

  return (
    <div>
      <PageHeader title={t("admin_chat_moderation")} subtitle={t("admin_chat_intro")} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "game"} className={tabCls(tab === "game")} onClick={() => switchTab("game")}>
            {t("game_chat")}
          </button>
          <button type="button" role="tab" aria-selected={tab === "dm"} className={tabCls(tab === "dm")} onClick={() => switchTab("dm")}>
            {t("direct_messages")}
          </button>
        </div>
        <input
          type="search"
          placeholder={t("search_messages_placeholder")}
          aria-label={t("search")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`${inputCls} flex-1 min-w-[200px] max-w-sm`}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => {
              setShowDeleted(e.target.checked);
              setPage(1);
            }}
            className="w-4 h-4 accent-amber-600"
          />
          {t("show_deleted")}
        </label>
      </div>

      <Table
        columns={[
          { label: t("when") },
          { label: t("from") },
          { label: tab === "game" ? t("game") : t("to") },
          { label: t("content") },
          { label: t("actions"), end: true },
        ]}
        loading={loading && data.messages.length === 0}
        empty={!loading && data.messages.length === 0 ? t("no_results") : null}
      >
        {data.messages.map((m) => (
          <tr key={m.id} className="align-top hover:bg-gray-50">
            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(m.created_at, i18n.language)}</td>
            <td className="px-4 py-3 text-gray-900 text-sm whitespace-nowrap">
              {tab === "game" ? (m.username ? <Link to={`/u/${m.username}`} className="hover:text-amber-700">{m.display_name || m.username}</Link> : "—") : who(m.sender)}
            </td>
            <td className="px-4 py-3 text-sm whitespace-nowrap">
              {tab === "game" ? (
                <Link to={`/play/${m.game_id}`} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline font-mono text-xs">
                  {m.game_id?.slice(-8)} ↗
                </Link>
              ) : (
                <span className="text-gray-900">{who(m.recipient)}</span>
              )}
            </td>
            <td className="px-4 py-3 text-gray-800 max-w-md">
              {m.is_deleted ? <Pill tone="gray">{t("message_removed")}</Pill> : <span className="break-words whitespace-pre-wrap">{m.content}</span>}
            </td>
            <td className="px-4 py-3 text-end">
              {!m.is_deleted && (
                <Button size="sm" variant="danger" onClick={() => remove(m)}>
                  {t("delete")}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <Pager page={data.page ?? page} pages={data.pages} total={data.total} onChange={setPage} />
    </div>
  );
}
