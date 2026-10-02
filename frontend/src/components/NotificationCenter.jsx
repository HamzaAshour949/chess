import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../api";
import { getSocket } from "../realtime";
import { useUserAuth } from "../context/UserAuthContext";
import { useToast } from "./ui/Toaster";
import { isolate, nameOf, tcLabel } from "../lib/format";
import { playSound } from "../lib/sound";

/** Other components listen for this to refresh their challenge lists. */
export const CHALLENGES_CHANGED_EVENT = "chesshub:challenges-changed";

function announceChallengesChanged() {
  window.dispatchEvent(new CustomEvent(CHALLENGES_CHANGED_EVENT));
}

/**
 * The player's personal channel, handled once for the whole app.
 *
 * Before this, an accepted challenge went unnoticed unless the challenger
 * happened to be looking at the lobby; a direct message only bumped a badge;
 * a ban or an approved profile link said nothing at all. Now each one reaches
 * the player wherever they are.
 */
export default function NotificationCenter() {
  const { t } = useTranslation();
  const { user, endSession, refresh } = useUserAuth();
  const { toast, dismiss } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Handlers read the current path without re-subscribing on every navigation.
  const path = useRef(location.pathname);
  useEffect(() => {
    path.current = location.pathname;
  }, [location.pathname]);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    const socket = getSocket();
    const shown = new Set();

    const challengeDetails = (game) => {
      const parts = [tcLabel(game.time_control_seconds, game.increment_seconds, t), game.rated ? t("rated") : t("casual")];
      // The creator's colour is fixed unless random; tell the invitee theirs.
      if (game.creator_color === "white") parts.push(t("you_play_black"));
      if (game.creator_color === "black") parts.push(t("you_play_white"));
      return parts.join(" · ");
    };

    const showChallenge = (game) => {
      if (shown.has(game.id) || game.status !== "open") return;
      shown.add(game.id);
      const from = isolate(nameOf(game.creator_user, t));
      toast({
        id: `challenge-${game.id}`,
        tone: "challenge",
        duration: 0,
        title: game.rematch_of_game_id ? t("rematch_offer_from", { name: from }) : t("challenge_from", { name: from }),
        body: challengeDetails(game),
        actions: [
          {
            label: t("accept"),
            primary: true,
            onClick: async () => {
              try {
                const res = await api.post(`/games/${game.id}/accept`);
                navigate(`/play/${res.data.id}`);
              } catch (error) {
                toast({ tone: "error", title: apiError(error, t("action_failed")) });
              }
              announceChallengesChanged();
            },
          },
          {
            label: t("decline"),
            onClick: () => {
              api.post(`/games/${game.id}/decline`).catch(() => {}).finally(announceChallengesChanged);
            },
          },
        ],
      });
    };

    const onChallenge = (game) => {
      playSound("notify");
      showChallenge(game);
      announceChallengesChanged();
    };

    const onChallengeClosed = (game) => {
      dismiss(`challenge-${game.id}`);
      announceChallengesChanged();
      // Tell the challenger when their invitation was turned down or lapsed.
      if (game.creator_user_id === userId && ["declined", "expired"].includes(game.termination)) {
        toast({
          title: t(game.termination === "declined" ? "challenge_declined" : "challenge_expired", {
            name: isolate(nameOf(game.invited_user, t)),
          }),
        });
      }
    };

    const onGameStarted = (game) => {
      playSound("start");
      dismiss(`challenge-${game.id}`);
      announceChallengesChanged();
      if (!path.current.startsWith(`/play/${game.id}`)) navigate(`/play/${game.id}`);
      const opponent = game.white_user?.id === userId ? game.black_user : game.white_user;
      toast({ tone: "success", title: t("game_started"), body: t("game_started_body", { name: isolate(nameOf(opponent, t)) }) });
    };

    const onDirectMessage = (message) => {
      if (path.current.startsWith("/messages")) return;
      playSound("notify");
      toast({
        id: `dm-${message.sender_id}`,
        icon: "✉",
        title: t("new_message_from", { name: isolate(nameOf(message.sender, t)) }),
        body: message.content?.slice(0, 140),
        actions: [{ label: t("reply"), primary: true, onClick: () => navigate(`/messages/${message.sender_id}`) }],
      });
    };

    const onBanned = (payload) => {
      endSession("banned");
      toast({
        tone: "error",
        duration: 0,
        title: t("account_suspended"),
        body: payload?.reason || undefined,
      });
      navigate("/login");
    };

    const onDeleted = () => endSession("deleted");

    const onLinkReviewed = (payload) => {
      void refresh();
      toast({
        tone: payload?.status === "approved" ? "success" : "info",
        title: t(payload?.status === "approved" ? "link_approved_toast" : "link_rejected_toast"),
        actions: [{ label: t("view"), onClick: () => navigate("/settings?tab=link") }],
      });
    };

    // Invitations sent while this player was away still deserve an answer.
    const loadPending = () => {
      api
        .get("/games/me/challenges")
        .then((res) => res.data.incoming.forEach(showChallenge))
        .catch(() => {});
    };

    socket.on("challenge:received", onChallenge);
    socket.on("challenge:closed", onChallengeClosed);
    socket.on("game:started", onGameStarted);
    socket.on("dm:new", onDirectMessage);
    socket.on("account:banned", onBanned);
    socket.on("account:deleted", onDeleted);
    socket.on("link:reviewed", onLinkReviewed);
    socket.on("connect", loadPending);
    loadPending();

    return () => {
      socket.off("challenge:received", onChallenge);
      socket.off("challenge:closed", onChallengeClosed);
      socket.off("game:started", onGameStarted);
      socket.off("dm:new", onDirectMessage);
      socket.off("account:banned", onBanned);
      socket.off("account:deleted", onDeleted);
      socket.off("link:reviewed", onLinkReviewed);
      socket.off("connect", loadPending);
    };
  }, [userId, t, toast, dismiss, navigate, endSession, refresh]);

  return null;
}
