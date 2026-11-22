"use client";

import { useState } from "react";
import { Loader2, Lock, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Me, UserBrief } from "@/lib/types";
import { useFollow, useFollowers, useFollowing } from "./hooks";
import { UserAvatarLink } from "./user-avatar";

type Props = {
  username: string;
  displayName: string;
  mode: "followers" | "following";
  me: Me | null;
  onNeedLogin: () => void;
  onClose: () => void;
};

export function FollowListDialog({ username, displayName, mode, me, onNeedLogin, onClose }: Props) {
  const t = useT();
  const followersQuery = useFollowers(username, mode === "followers");
  const followingQuery = useFollowing(username, mode === "following");
  const query = mode === "followers" ? followersQuery : followingQuery;
  const follow = useFollow(onNeedLogin);

  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  const items = query.data?.users ?? [];
  const title =
    mode === "followers"
      ? t("fl.title", { u: username })
      : t("fl.followingTitle", { u: username });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[82vh] w-full max-w-md overflow-hidden rounded-t-2xl border bg-card shadow-xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{title}</h2>
            <p className="truncate text-xs text-muted-foreground">{displayName}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={onClose} aria-label={t("c.cancel")}>
            ✕
          </Button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {query.isLoading ? (
            <div className="space-y-3 p-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : query.isError ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Lock className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("fl.privateErr")}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <UserRoundX className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("fl.empty")}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map(({ user }) => (
                <UserRow key={user.id} user={user} me={me} onNeedLogin={onNeedLogin} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  function UserRow({ user, me, onNeedLogin }: { user: UserBrief; me: Me | null; onNeedLogin: () => void }) {
    const isMe = me?.id === user.id;
    const isFollowed = followed[user.username] ?? false;
    return (
      <li className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent">
        <UserAvatarLink name={user.displayName} color={user.avatarColor} avatar={user.avatar} username={user.username} size={40} />
        <div className="min-w-0 flex-1">
          <a href={`#/u/${encodeURIComponent(user.username)}`} className="block truncate text-sm font-semibold hover:underline">
            {user.displayName}
          </a>
          <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
        </div>
        {me && !isMe && (
          <Button
            size="sm"
            variant={isFollowed ? "outline" : "default"}
            className={cn("h-8 rounded-full px-3 text-xs", !isFollowed && "bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90")}
            onClick={() => {
              follow.mutate(user.username);
              setFollowed((prev) => ({ ...prev, [user.username]: !isFollowed }));
            }}
            disabled={follow.isPending}
          >
            {follow.isPending && isFollowed === undefined ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {isFollowed ? t("c.following") : t("c.follow")}
          </Button>
        )}
      </li>
    );
  }
}
