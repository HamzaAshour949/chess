import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useLanguage } from "../../context/LanguageContext";
import { useConfirm } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toaster";
import { formatDate } from "../../lib/format";
import { useFetch } from "../../hooks/useFetch";
import { Button, PageHeader, Pill, Table, inputCls } from "./ui";

const FILTERS = ["pending", "approved", "rejected", "all"];

export default function AdminLinkRequestsPage() {
  const { t, i18n } = useTranslation();
  const { lang } = useLanguage();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [filter, setFilter] = useState("pending");
  const [busy, setBusy] = useState(null);
  const { data, loading, error, reload: load } = useFetch(`/links/admin/requests?status=${filter}&lang=${lang}`);
  const items = data ?? [];

  const review = async (request, action) => {
    const approving = action === "approve";
    const note = await confirm({
      title: t(approving ? "approve_link_title" : "reject_link_title", {
        user: `@${request.user?.username}`,
        player: request.player?.name,
      }),
      body: t(approving ? "approve_link_body" : "reject_link_body"),
      confirmLabel: t(approving ? "approve" : "reject"),
      tone: approving ? undefined : "danger",
      input: { label: t("admin_note_optional"), multiline: true },
    });
    if (note === null) return;
    setBusy(request.id);
    try {
      await api.post(`/links/admin/requests/${request.id}/${action}`, { admin_note: note });
      toast({ tone: "success", title: t(approving ? "link_approved_admin" : "link_rejected_admin") });
      load();
    } catch (err) {
      toast({ tone: "error", title: apiError(err, t("action_failed")) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title={t("manage_link_requests")} subtitle={t("manage_link_requests_sub")}>
        <select aria-label={t("status")} value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputCls} w-auto`}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {t(f)}
            </option>
          ))}
        </select>
      </PageHeader>

      <Table
        columns={[
          { label: t("user") },
          { label: t("requested_player") },
          { label: t("evidence") },
          { label: t("status") },
          { label: t("actions"), end: true },
        ]}
        loading={loading}
        empty={!loading && items.length === 0 ? (error ? apiError(error, t("load_failed")) : t("no_link_requests")) : null}
      >
        {items.map((r) => (
          <tr key={r.id} className="align-top hover:bg-gray-50">
            <td className="px-4 py-3">
              <Link to={`/u/${r.user?.username}`} className="font-medium text-gray-900 hover:text-amber-700">
                {r.user?.display_name || r.user?.username}
              </Link>
              <div className="text-xs text-gray-500">
                @{r.user?.username} · {r.user?.online_rating}
              </div>
              <div className="text-xs text-gray-400">{formatDate(r.created_at, i18n.language)}</div>
            </td>
            <td className="px-4 py-3">
              <Link to={`/players/${r.player_id}`} className="font-medium text-gray-900 flex items-center gap-2 hover:text-amber-700">
                {r.player?.title && <Pill tone="amber">{r.player.title}</Pill>}
                {r.player?.name}
              </Link>
              <div className="text-xs text-gray-500">
                {r.player?.country || "—"} · {r.player?.rating || "—"}
              </div>
            </td>
            <td className="px-4 py-3 text-gray-700 text-sm max-w-sm">
              {r.message ? <p className="whitespace-pre-wrap break-words">{r.message}</p> : <span className="text-gray-400 italic">{t("no_evidence")}</span>}
              {r.admin_note && <p className="mt-1 text-xs italic text-gray-500">{t("reviewer_note")}: “{r.admin_note}”</p>}
            </td>
            <td className="px-4 py-3">
              <Pill tone={r.status === "pending" ? "amber" : r.status === "approved" ? "green" : "red"}>{t(r.status)}</Pill>
            </td>
            <td className="px-4 py-3">
              {r.status === "pending" && (
                <div className="flex gap-1.5 justify-end">
                  <Button size="sm" variant="success" disabled={busy === r.id} onClick={() => review(r, "approve")}>
                    {t("approve")}
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => review(r, "reject")}>
                    {t("reject")}
                  </Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
