import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useConfirm } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toaster";
import { formatDate } from "../../lib/format";
import { Button, ErrorBanner, PageHeader, Pager, Pill, Table, inputCls } from "./ui";

const STATUS_FILTERS = ["all", "active", "banned", "unverified"];

function StatusPill({ user, t }) {
  if (user.is_deleted) return <Pill tone="gray">{t("deleted_player")}</Pill>;
  if (user.is_banned) return <Pill tone="red">{t("banned")}</Pill>;
  if (!user.is_verified) return <Pill tone="amber">{t("unverified")}</Pill>;
  return <Pill tone="green">{t("active")}</Pill>;
}

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const status = STATUS_FILTERS.includes(params.get("status")) ? params.get("status") : "all";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ users: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/links/admin/users?status=${status}&search=${encodeURIComponent(search.trim())}&page=${page}&per_page=25`)
      .then((r) => {
        setData(r.data);
        setError("");
      })
      .catch((e) => setError(apiError(e, t("load_failed"))))
      .finally(() => setLoading(false));
  }, [status, search, page, t]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const act = async (user, path, body) => {
    setBusy(user.id);
    try {
      await api.post(`/links/admin/users/${user.id}/${path}`, body ?? {});
      load();
    } catch (e) {
      toast({ tone: "error", title: apiError(e, t("action_failed")) });
    } finally {
      setBusy(null);
    }
  };

  const ban = async (user) => {
    const reason = await confirm({
      title: t("ban_title", { name: `@${user.username}` }),
      body: t("ban_body"),
      tone: "danger",
      confirmLabel: t("ban"),
      input: { label: t("ban_reason"), multiline: true },
    });
    if (reason !== null) act(user, "ban", { reason });
  };

  const simple = async (user, path, title) => {
    if (await confirm({ title, confirmLabel: t("confirm") })) act(user, path);
  };

  return (
    <div>
      <PageHeader title={t("manage_users")} subtitle={t("manage_users_sub")}>
        <input
          type="search"
          placeholder={t("search_users_placeholder")}
          aria-label={t("search")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`${inputCls} sm:w-64`}
        />
        <select
          aria-label={t("status")}
          value={status}
          onChange={(e) => {
            setParams(e.target.value === "all" ? {} : { status: e.target.value });
            setPage(1);
          }}
          className={`${inputCls} w-auto`}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
      </PageHeader>

      <ErrorBanner>{error}</ErrorBanner>

      <Table
        columns={[
          { label: t("user") },
          { label: t("email") },
          { label: t("rating") },
          { label: t("games_played") },
          { label: t("link_profile") },
          { label: t("status") },
          { label: t("actions"), end: true },
        ]}
        loading={loading && data.users.length === 0}
        empty={!loading && data.users.length === 0 ? t("no_results") : null}
      >
        {data.users.map((u) => (
          <tr key={u.id} className="align-top hover:bg-gray-50">
            <td className="px-4 py-3">
              <Link to={`/u/${u.username}`} className="font-medium text-gray-900 hover:text-amber-700">
                {u.display_name || u.username}
              </Link>
              <div className="text-xs text-gray-500">@{u.username}</div>
              <div className="text-xs text-gray-400">{t("joined_on", { date: formatDate(u.created_at, i18n.language) })}</div>
            </td>
            <td className="px-4 py-3 text-gray-600 text-xs" dir="ltr">
              {u.email}
            </td>
            <td className="px-4 py-3">
              <div className="font-bold text-gray-900 tabular-nums">{u.online_rating}</div>
              {u.is_provisional && <div className="text-[10px] text-gray-400">{t("provisional")}</div>}
            </td>
            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap tabular-nums" dir="ltr">
              {u.games_played} · {u.games_won}W/{u.games_lost}L/{u.games_drawn}D
            </td>
            <td className="px-4 py-3 text-xs">
              {u.linked_player_id ? (
                <Link to={`/players/${u.linked_player_id}`} className="text-amber-700 hover:underline font-medium">
                  {u.linked_player_title ? `${u.linked_player_title} ` : ""}
                  {u.linked_player_name}
                </Link>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <StatusPill user={u} t={t} />
                {u.chat_muted && <Pill tone="blue">{t("muted")}</Pill>}
              </div>
              {u.is_banned && u.ban_reason && <div className="text-[11px] text-rose-700 mt-1 italic max-w-[200px]">“{u.ban_reason}”</div>}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5 justify-end">
                {!u.is_verified && (
                  <Button size="sm" variant="primary" disabled={busy === u.id} onClick={() => simple(u, "verify", t("verify_title_admin", { name: `@${u.username}` }))}>
                    {t("mark_verified")}
                  </Button>
                )}
                {u.chat_muted ? (
                  <Button size="sm" disabled={busy === u.id} onClick={() => act(u, "unmute")}>
                    {t("unmute_user")}
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy === u.id} onClick={() => act(u, "mute")}>
                    {t("mute_user")}
                  </Button>
                )}
                {u.linked_player_id && (
                  <Button size="sm" disabled={busy === u.id} onClick={() => simple(u, "unlink", t("unlink_title", { name: `@${u.username}` }))}>
                    {t("unlink")}
                  </Button>
                )}
                {u.is_banned ? (
                  <Button size="sm" variant="success" disabled={busy === u.id} onClick={() => simple(u, "unban", t("unban_title", { name: `@${u.username}` }))}>
                    {t("unban")}
                  </Button>
                ) : (
                  <Button size="sm" variant="danger" disabled={busy === u.id || u.is_deleted} onClick={() => ban(u)}>
                    {t("ban")}
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pager page={page} pages={data.pages} total={data.total} onChange={setPage} />
    </div>
  );
}
