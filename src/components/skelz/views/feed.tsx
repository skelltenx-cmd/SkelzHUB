"use client";

import { useEffect, useRef } from "react";
import { ImageOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Me } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { useInfinitePosts, useSuggestions, useFollow } from "../hooks";
import { PostCard } from "../post-card";
import { StoriesRail } from "../story";
import { UserAvatarLink } from "../user-avatar";

// Saran akun untuk MOBILE (rail kanan hanya tampil di desktop) — supaya
// pengguna ponsel juga bisa mengikuti akun dari saran Beranda.
function MobileSuggestions({ me, onNeedLogin }: { me: Me | null; onNeedLogin: () => void }) {
  const t = useT();
  const { data } = useSuggestions(!!me);
  const follow = useFollow(onNeedLogin);
  const users = (data?.users ?? []).filter((u) => !u.isMe).slice(0, 10);
  if (!me || users.length === 0) return null;
  return (
    <section className="mb-4 rounded-xl border bg-card p-3 lg:hidden" aria-label={t("feed.suggestions")}>
      <h2 className="mb-2.5 text-sm font-semibold text-muted-foreground">{t("feed.suggestions")}</h2>
      <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {users.map((u) => {
          // Status ikut dibalik optimistik oleh mutation — tombol berubah
          // seketika setelah diketuk (tidak menunggu balasan server).
          const st = u.followStatus ?? "NONE";
          const busy = follow.isPending && follow.variables === u.username;
          return (
            <li key={u.id} className="flex w-[106px] shrink-0 flex-col items-center gap-1.5 text-center">
              <UserAvatarLink name={u.displayName} color={u.avatarColor} avatar={u.avatar} username={u.username} size={54} />
              <a href={`#/u/${encodeURIComponent(u.username)}`} className="w-full truncate text-xs font-semibold hover:underline">
                {u.displayName}
              </a>
              <Button
                size="sm"
                variant={st === "NONE" ? "default" : "outline"}
                className={
                  st === "NONE"
                    ? "h-7 w-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-2 text-[11px] text-white hover:opacity-90"
                    : "h-7 w-full rounded-full px-2 text-[11px]"
                }
                disabled={busy}
                onClick={() => follow.mutate(u.username)}
              >
                {st === "PENDING" ? t("c.requested") : st === "ACCEPTED" ? t("c.following") : t("c.follow")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PostCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function GuestBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-rose-500/20 to-orange-400/20 blur-2xl" />
      <h1 className="text-xl font-extrabold tracking-tight">
        Selamat datang di <span className="bg-gradient-to-r from-rose-500 to-orange-400 bg-clip-text text-transparent">SkelzHub</span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tempatnya meme, momen, dan karya kreatif terbaik. Masuk untuk ikut seru-seruan!
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="#/login">
          <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">Masuk</Button>
        </a>
        <a href="#/register">
          <Button variant="outline">Daftar</Button>
        </a>
      </div>
    </div>
  );
}

export function FeedView({
  me,
  meLoading,
  onNeedLogin,
}: {
  me: Me | null;
  meLoading: boolean;
  onNeedLogin: () => void;
}) {
  const t = useT();
  const feed = me ? "following" : "home";
  const query = useInfinitePosts({ feed, limit: 8, enabled: !meLoading });
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const posts = data?.pages.flatMap((p) => p.posts) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    document.title = me ? `${t("feed.title")} · SkelzHub` : "SkelzHub — Bagikan momen & meme terbaikmu";
  }, [me, t]);

  return (
    <div className="mx-auto w-full max-w-[470px] px-3 py-4 sm:px-4 sm:py-6">
      {!me && !meLoading && <GuestBanner />}

      {me && (
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">{t("feed.title")}</h1>
          <a
            href="#/create"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Zap className="h-4 w-4" /> {t("feed.createPost")}
          </a>
        </div>
      )}

      {/* Rail Story (hanya untuk yang login) */}
      {me && !meLoading && <StoriesRail me={me} />}

      {/* Saran akun — khusus ponsel (desktop punya rail kanan sendiri) */}
      {me && !meLoading && <MobileSuggestions me={me} onNeedLogin={onNeedLogin} />}

      {isLoading && (
        <div className="flex flex-col gap-6">
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      )}

      {!isLoading && posts.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <ImageOff className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold">{t("feed.empty")}</p>
          <p className="text-sm text-muted-foreground">{me ? t("feed.emptyMe") : t("feed.emptyGuest")}</p>
          <a href="#/explore">
            <Button variant="outline">{t("feed.exploreBtn")}</Button>
          </a>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} me={me} onNeedLogin={onNeedLogin} />
        ))}
        {isFetchingNextPage && <PostCardSkeleton />}
      </div>

      <div ref={sentinelRef} className="h-2" />

      {!isLoading && !hasNextPage && posts.length > 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <div className="mx-auto mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-400 text-white">
            <Zap className="h-4 w-4" />
          </div>
          <p>{t("feed.end")}</p>
        </div>
      )}
    </div>
  );
}
