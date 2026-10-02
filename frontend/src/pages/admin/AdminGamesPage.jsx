import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useConfirm } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toaster";
import { formatDateTime, nameOf, tcLabel, terminationKey } from "../../lib/format";
import { Button, PageHeader, Pager, Pill, Table, inputCls } from "./ui";

const FILTERS = ["all", "open", "active", "finished", "voided"];

function StatusPill({ game, t }) {
  if (game.voided) return <Pill tone="red">{t("voided")}</Pill>;
  if (game.status === "active") return <Pill tone="amber">● {t("live_now")}</Pill>;
  if (game.status === "open") return <Pill tone="blue">{t("open")}</Pill>;
  if (game.status === "aborted") return <Pill tone="gray">{t(terminationKey(game) ?? "term_aborted")}</Pill>;
  return (
    <Pill tone="green">
      {game.result} · {t(terminationKey(game) ?? "finished")}
    </Pill>
  );
}

export default function AdminGamesPage() {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [data, setData] = useState({ games: [], total: 0, page: 1, pages: 1 });
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), per_page: "25" });
    if (status !== "all") p.set("status", status);
    if (search.trim()) p.set("search", search.trim());
    setLoading(true);
    api
      .get(`/games/admin/games?${p}`)
      .then((r) => setData(r.data))
      .catch((e) => toast({ tone: "error", title: apiError(e, t("load_failed")) }))
      .finally(() => setLoading(false));
  }, [status, search, page, toast, t]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const act = async (id, path, body) => {
    setBusy(id);
    try {
      await api.post(`/games/admin/games/${id}/${path}`, body ?? {});
      load();
    } catch (err) {
      toast({ tone: "error", title: apiError(err, t("action_failed")) });
    } finally {
      setBusy(null);
    }
  };

  const abort = async (game) => {
    const reason = await confirm({
      title: t("confirm_abort"),
      body: t("admin_abort_body"),
      confirmLabel: t("abort"),
      tone: "danger",
      input: { label: t("reason_optional") },
    });
    if (reason !== null) act(game.id, "abort", { reason });
  };

  const voidGame = async (game) => {
    const reason = await confirm({
      title: t("void_title"),
      body: t("void_body"),
      confirmLabel: t("void"),
      tone: "danger",
      input: { label: t("void_reason_prompt"), required: true },
    });
    if (reason) act(game.id, "void", { reason });
  };

  return (
    <div>
      <PageHeader title={t("admin_matches")} subtitle={t("admin_matches_intro")}>
        <input
          type="search"
          placeholder={t("search_username")}
          aria-label={t("search_username")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`${inputCls} sm:w-60`}
        />
        <select
          aria-label={t("status")}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={`${inputCls} w-auto`}
        >
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {t(f)}
            </option>
          ))}
        </select>
      </PageHeader>

      <Table
        columns={[
          { label: t("game") },
          { label: t("color_white") },
          { label: t("color_black") },
          { label: t("status") },
          { label: t("time_control") },
          { label: t("moves") },
          { label: t("actions"), end: true },
        ]}
        loading={loading && data.games.length === 0}
        empty={!loading && data.games.length === 0 ? t("no_results") : null}
      >
        {data.games.map((g) => (
          <tr key={g.id} className="hover:bg-gray-50">
            <td className="px-4 py-3 whitespace-nowrap">
              <Link to={`/play/${g.id}`} className="text-amber-700 hover:underline font-mono text-xs" target="_blank" rel="noreferrer">
                {g.id.slice(-8)} ↗
              </Link>
              <div className="text-xs text-gray-400">{formatDateTime(g.created_at, i18n.language)}</div>
            </td>
            <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{g.white_user ? nameOf(g.white_user, t) : "—"}</td>
            <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{g.black_user ? nameOf(g.black_user, t) : "—"}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <StatusPill game={g} t={t} />
                {g.chat_disabled && <Pill tone="gray">{t("chat_off")}</Pill>}
              </div>
              {g.void_reason && <div className="text-[11px] text-gray-500 mt-1 italic max-w-[220px]">“{g.void_reason}”</div>}
            </td>
            <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
              {tcLabel(g.time_control_seconds, g.increment_seconds, t)} · {g.rated ? t("rated") : t("casual")}
            </td>
            <td className="px-4 py-3 text-gray-600 text-xs tabular-nums">{g.move_count}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5 justify-end">
                {(g.status === "active" || g.status === "open") && (
                  <Button size="sm" variant="danger" disabled={busy === g.id} onClick={() => abort(g)}>
                    {t("abort")}
                  </Button>
                )}
                {["white_wins", "black_wins", "draw"].includes(g.status) && !g.voided && (
                  <Button size="sm" variant="danger" disabled={busy === g.id} onClick={() => voidGame(g)}>
                    {t("void")}
                  </Button>
                )}
                {g.status !== "open" && (
                  <Button size="sm" disabled={busy === g.id} onClick={() => act(g.id, "chat-toggle")}>
                    {g.chat_disabled ? t("enable_chat") : t("disable_chat")}
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pager page={data.page ?? page} pages={data.pages} total={data.total} onChange={setPage} />
    </div>
  );
}
