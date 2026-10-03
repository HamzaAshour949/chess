import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Set the tab title for the current page: "Page · Chess Hub".
 *
 * Titles matter more than they look: they are what a player sees in a row of
 * tabs, in history and in bookmarks, and a game page uses them to flag
 * "your move" while the tab is in the background.
 */
export function useDocumentTitle(title) {
  const { t } = useTranslation();
  const app = t("app_name");

  useEffect(() => {
    document.title = title ? `${title} · ${app}` : app;
  }, [title, app]);
}
