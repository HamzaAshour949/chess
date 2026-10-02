import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useConfirm } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toaster";
import { PageHeader, Pager, Pill, Table, inputCls } from "./ui";

export default function AdminPlayersPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [data, setData] = useState({ players: [], pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/players?page=${page}&per_page=15&search=${encodeURIComponent(search.trim())}`)
      .then((r) => setData(r.data))
      .catch((e) => toast({ tone: "error", title: apiError(e, t("load_failed")) }))
      .finally(() => setLoading(false));
  }, [page, search, toast, t]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const handleDelete = async (player) => {
    const ok = await confirm({
      title: t("delete_player_title", { name: player.name_en }),
      body: t("delete_player_body"),
      confirmLabel: t("delete"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/players/${player.id}`);
      toast({ tone: "success", title: t("deleted_ok") });
      load();
    } catch (e) {
      toast({ tone: "error", title: apiError(e, t("action_failed")) });
    }
  };

  return (
    <div>
      <PageHeader title={t("manage_players")}>
        <input
          type="search"
          placeholder={t("search")}
          aria-label={t("search")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`${inputCls} sm:w-64`}
        />
        <Link to="/admin/players/new" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm whitespace-nowrap">
          + {t("add_player")}
        </Link>
      </PageHeader>

      <Table
        columns={[
          { label: t("name_en") },
          { label: t("name_ar") },
          { label: t("title") },
          { label: t("rating") },
          { label: t("country") },
          { label: t("actions"), end: true },
        ]}
        loading={loading && data.players.length === 0}
        empty={!loading && data.players.length === 0 ? t("no_results") : null}
      >
        {data.players.map((p) => (
          <tr key={p.id} className="hover:bg-gray-50">
            <td className="px-4 py-3 font-medium text-gray-900">
              <div className="flex items-center gap-2 flex-wrap">
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-8 h-8 rounded-full object-cover" loading="lazy" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">♟</span>
                )}
                {p.name_en}
                {p.is_player_of_month && <Pill tone="amber">🏆 {t("player_of_month")}</Pill>}
                {p.is_tournament_winner && <Pill tone="blue">👑 {t("tournament_winner")}</Pill>}
              </div>
            </td>
            <td className="px-4 py-3 text-gray-700" dir="rtl">
              {p.name_ar}
            </td>
            <td className="px-4 py-3">{p.title ? <Pill tone="amber">{p.title}</Pill> : <span className="text-gray-400">—</span>}</td>
            <td className="px-4 py-3 text-gray-700 tabular-nums">{p.rating || "—"}</td>
            <td className="px-4 py-3 text-gray-700">{p.country || "—"}</td>
            <td className="px-4 py-3 text-end whitespace-nowrap">
              <Link to={`/players/${p.id}`} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-800 text-sm font-medium me-3">
                {t("view")} ↗
              </Link>
              <Link to={`/admin/players/${p.id}/edit`} className="text-amber-700 hover:text-amber-900 text-sm font-medium me-3">
                {t("edit")}
              </Link>
              <button type="button" onClick={() => handleDelete(p)} className="text-rose-600 hover:text-rose-800 text-sm font-medium">
                {t("delete")}
              </button>
            </td>
          </tr>
        ))}
      </Table>

      <Pager page={page} pages={data.pages} total={data.total} onChange={setPage} />
    </div>
  );
}
