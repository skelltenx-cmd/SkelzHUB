"use client";

import { useEffect } from "react";
import { Bell, Heart, MessageCircle, UserPlus, Repeat2, Check, X, CheckCheck, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Me, NotificationItem } from "@/lib/types";
import { useNotifications, useMarkNotificationsRead, useFollowRequests, useResolveFollowRequest } from "../hooks";
import { UserAvatar, UserAvatarLink } from "../user-avatar";
import { AdminBadge } from "../admin-badge";
import { timeAgo, mediaThumb } from "../utils";

function notifText(n: NotificationItem, t: ReturnType<typeof useT>): string {
  switch (n.type) {
    case "LIKE":
      return t("notif.t.like");
    case "COMMENT":
      return n.commentText ? t("notif.t.comment", { t: n.commentText }) : t("notif.t.like");
    case "FOLLOW":
      return t("notif.t.follow");
    case "FOLLOW_REQUEST":
      return t("notif.t.follow_request");
    case "FOLLOW_ACCEPT":
      return t("notif.t.follow_accept");
    case "REPOST":
      return t("notif.t.repost");
    case "STORY_VIEW":
      return t("notif.t.story_view");
    case "POST_VIEW":
      return t("notif.t.post_view");
    case "STORY_LIKE":
      return t("notif.t.story_like");
    case "STORY_COMMENT":
      return n.commentText ? t("notif.t.story_comment", { t: n.commentText }) : t("notif.t.story_view");
    default:
      return t("notif.t.default");
  }
}

function NotifIcon({ type }: { type: NotificationItem["type"] }) {
  if (type === "LIKE" || type === "STORY_LIKE") return <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" aria-hidden="true" />;
  if (type === "COMMENT" || type === "STORY_COMMENT") return <MessageCircle className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />;
  if (type === "STORY_VIEW" || type === "POST_VIEW") return <Eye className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />;
  if (type === "REPOST") return <Repeat2 className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />;
  if (type === "FOLLOW_REQUEST") return <Lock className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />;
  if (type === "FOLLOW_ACCEPT") return <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
  return <UserPlus className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />;
}

function NotifRow({ n, t }: { n: NotificationItem; t: ReturnType<typeof useT> }) {
  const href = n.postId ? `#/post/${n.postId}` : `#/u/${encodeURIComponent(n.actor.username)}`;
  return (
    <li>
      <a
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent",
          !n.read && "border-rose-500/40 bg-rose-500/5"
        )}
      >
        <div className="relative shrink-0">
          {/* Avatar polos (bukan link) supaya tidak ada <a> di dalam <a> (error hydration) */}
          <UserAvatar name={n.actor.displayName} color={n.actor.avatarColor} avatar={n.actor.avatar} size={44} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card ring-1 ring-border">
            <NotifIcon type={n.type} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm leading-snug">
            <span className="font-semibold">{n.actor.displayName}</span>
            {(n.actor.role === "ADMIN" || n.actor.role === "OWNER") && <AdminBadge role={n.actor.role} />}
            <span className="truncate text-xs text-muted-foreground">@{n.actor.username}</span>
            <span className="text-muted-foreground">{notifText(n, t)}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
        </div>
        {n.postMedia && (
          n.postType === "VIDEO" ? (
            <video src={n.postMedia} muted playsInline preload="metadata" className="h-12 w-12 shrink-0 rounded-md bg-muted object-cover" aria-hidden="true" />
          ) : (
            <img src={mediaThumb(n.postMedia, 320) ?? undefined} alt="" className="h-12 w-12 shrink-0 rounded-md bg-muted object-cover" loading="lazy" />
          )
        )}
        {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Belum dibaca" />}
      </a>
    </li>
  );
}

function RequestRow({
  req,
  t,
}: {
  req: { followId: string; createdAt: string; user: { id: string; username: string; displayName: string; avatarColor: number; avatar?: string | null } };
  t: ReturnType<typeof useT>;
}) {
  const resolve = useResolveFollowRequest();
  return (
    <li className="flex items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/5 p-3">
      <UserAvatarLink name={req.user.displayName} color={req.user.avatarColor} avatar={req.user.avatar} username={req.user.username} size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-semibold">{req.user.displayName}</span>{" "}
          <span className="text-muted-foreground">{t("notif.t.follow_request")}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(req.createdAt)}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          size="sm"
          className="h-8 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-3 text-xs text-white hover:opacity-90"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ followId: req.followId, action: "accept" })}
        >
          <Check className="h-4 w-4" /> {t("notif.accept")}
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" disabled={resolve.isPending} onClick={() => resolve.mutate({ followId: req.followId, action: "reject" })}>
          <X className="h-4 w-4" /> {t("notif.reject")}
        </Button>
      </div>
    </li>
  );
}

export function NotificationsView({ me }: { me: Me | null }) {
  const t = useT();
  const query = useNotifications(!!me);
  const markRead = useMarkNotificationsRead();
  const requestsQuery = useFollowRequests(!!me);
  const requests = requestsQuery.data?.requests ?? [];

  useEffect(() => {
    document.title = `${t("notif.title")} · SkelzHub`;
  }, [t]);

  // Tandai semua terbaca saat view dibuka (permintaan ikut sengaja TIDAK ikut
  // ditandai otomatis supaya tetap terlihat sampai diproses)
  useEffect(() => {
    if (me && (query.data?.unread ?? 0) > 0 && !markRead.isPending) {
      markRead.mutate();
    }
  }, [me, query.data?.unread]);

  if (!me) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <Bell className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">{t("notif.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("notif.loginReq")}</p>
        <a href="#/login">
          <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">{t("a.login")}</Button>
        </a>
      </div>
    );
  }

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <div className="mx-auto w-full max-w-[470px] px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">{t("notif.title")}</h1>
        {unread > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-500">
            {unread > 99 ? "99+" : unread} {t("notif.new")}
          </span>
        )}
      </div>

      {/* Permintaan ikuti (akun privat) */}
      {requests.length > 0 && (
        <section className="mb-5" aria-label={t("profile.requests")}>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">{t("notif.requestsTitle", { n: requests.length })}</h2>
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <RequestRow key={r.followId} req={r} t={t} />
            ))}
          </ul>
        </section>
      )}

      {query.isLoading ? (
        <ul className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-2.5 w-16" />
              </div>
              <Skeleton className="h-12 w-12 rounded-md" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 && requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15">
            <Bell className="h-7 w-7 text-rose-500" />
          </span>
          <p className="font-semibold">{t("notif.empty")}</p>
          <p className="text-sm text-muted-foreground">{t("notif.emptySub")}</p>
          <a href="#/create">
            <Button variant="outline">{t("notif.makePost")}</Button>
          </a>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((n) => (
            <NotifRow key={n.id} n={n} t={t} />
          ))}
        </ul>
      )}

      {!query.isLoading && items.length > 0 && unread === 0 && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <CheckCheck className="h-4 w-4" /> {t("notif.allRead")}
        </p>
      )}
    </div>
  );
}
