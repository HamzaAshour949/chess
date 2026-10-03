import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useConfirm } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toaster";
import { formatDate } from "../../lib/format";
import { useFetch } from "../../hooks/useFetch";
import { Button, PageHeader, Pager, Pill, Table } from "./ui";

const REGIONS = { both: "region_both", en: "region_en", ar: "region_ar" };

export default function AdminNewsPage() {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const { data: fetched, loading, error, reload: load } = useFetch(`/news/admin?page=${page}&per_page=15`);
  const data = fetched ?? { news: [], pages: 1, total: 0 };

  const handleDelete = async (item) => {
    const ok = await confirm({
      title: t("delete_news_title"),
      body: item.title_en || item.title_ar,
      confirmLabel: t("delete"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/news/${item.id}`);
      toast({ tone: "success", title: t("deleted_ok") });
      load();
    } catch (e) {
      toast({ tone: "error", title: apiError(e, t("action_failed")) });
    }
  };

  const togglePublish = async (item) => {
    setBusy(item.id);
    try {
      await api.put(`/news/${item.id}`, { published: !item.published });
      toast({ tone: "success", title: item.published ? t("unpublished_ok") : t("published_ok") });
      load();
    } catch (e) {
      toast({ tone: "error", title: apiError(e, t("action_failed")) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title={t("manage_news")}>
        <Link to="/admin/news/new" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm">
          + {t("add_news")}
        </Link>
      </PageHeader>

      <Table
        columns={[
          { label: t("title") },
          { label: t("region") },
          { label: t("status") },
          { label: t("player") },
          { label: t("actions"), end: true },
        ]}
        loading={loading}
        empty={!loading && data.news.length === 0 ? (error ? apiError(error, t("load_failed")) : t("no_results")) : null}
      >
        {data.news.map((n) => (
          <tr key={n.id} className="hover:bg-gray-50">
            <td className="px-4 py-3 max-w-sm">
              <div className="font-medium text-gray-900 truncate">
                {n.is_featured && (
                  <span className="me-1" title={t("featured")}>
                    ⭐
                  </span>
                )}
                {n.title_en || n.title_ar || "—"}
              </div>
              <div className="text-xs text-gray-500">
                {n.published_at ? t("published_on", { date: formatDate(n.published_at, i18n.language) }) : t("created_on", { date: formatDate(n.created_at, i18n.language) })}
              </div>
            </td>
            <td className="px-4 py-3">
              <Pill>{t(REGIONS[n.region] ?? "region_both")}</Pill>
            </td>
            <td className="px-4 py-3">
              <Pill tone={n.published ? "green" : "gray"}>{n.published ? t("published") : t("unpublished")}</Pill>
            </td>
            <td className="px-4 py-3 text-gray-600">{n.player_name || "—"}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5 justify-end">
                <Button size="sm" disabled={busy === n.id} onClick={() => togglePublish(n)}>
                  {n.published ? t("unpublish") : t("publish")}
                </Button>
                <Link to={`/admin/news/${n.id}/edit`} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200">
                  {t("edit")}
                </Link>
                <Button size="sm" variant="danger" onClick={() => handleDelete(n)}>
                  {t("delete")}
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pager page={page} pages={data.pages} total={data.total} onChange={setPage} />
    </div>
  );
}
