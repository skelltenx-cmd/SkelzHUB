"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Search, Compass, Loader2, Clapperboard, ImageOff, Users, X, History, Trash2, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Me, Post, User } from "@/lib/types";
import { useInfinitePosts, useSearchAll, useFollow } from "../hooks";
import { PostTile } from "../post-grid";
import { UserAvatarLink } from "../user-avatar";
import { EmptyState } from "../empty-state";
import { formatCount } from "../utils";

type SearchTab = "all" | "accounts" | "posts" | "videos";

const TABS: { key: SearchTab; label: string }[] = [
  { key: "all", label: "search.tabAll" },
  { key: "accounts", label: "search.tabAccounts" },
  { key: "posts", label: "search.tabPosts" },
  { key: "videos", label: "search.tabVideos" },
];

// ---------- Riwayat pencarian (localStorage) ----------

const RECENT_KEY = "skelz-recent-search";
const RECENT_MAX = 8;
const RECENT_TERM_MAX = 60;
const EMPTY_RECENTS: string[] = [];

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function persistRecentSearches(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // mode privat / storage penuh — fitur tetap jalan tanpa riwayat tersimpan
  }
}

// Store eksternal mini (pola useSyncExternalStore): baca localStorage tanpa
// setState-in-effect & tanpa mismatch hidrasi (snapshot server = kosong).
let recentSnapshot: string[] | null = null;
const recentListeners = new Set<() => void>();

function getRecentSnapshot(): string[] {
  if (recentSnapshot === null) recentSnapshot = loadRecentSearches();
  return recentSnapshot;
}

function getRecentServerSnapshot(): string[] {
  return EMPTY_RECENTS;
}

function subscribeRecents(onChange: () => void): () => void {
  recentListeners.add(onChange);
  return () => recentListeners.delete(onChange);
}

function setRecentSearches(next: string[]) {
  recentSnapshot = next;
  persistRecentSearches(next);
  recentListeners.forEach((l) => l());
}

/** Baris hasil akun — dipakai di tab Semua & Akun */
function AccountRow({ u, me, follow, t }: { u: User; me: Me | null; follow: ReturnType<typeof useFollow>; t: ReturnType<typeof useT> }) {
  const st = u.followStatus ?? (u.isFollowing ? "ACCEPTED" : "NONE");
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/40">
      <UserAvatarLink name={u.displayName} color={u.avatarColor} avatar={u.avatar} username={u.username} size={44} />
      <div className="min-w-0 flex-1">
        <a href={`#/u/${encodeURIComponent(u.username)}`} className="block truncate text-sm font-semibold hover:underline">
          {u.displayName}
        </a>
        <p className="truncate text-xs text-muted-foreground">
          @{u.username} · {formatCount(u.followerCount)} {t("c.followers")} · {formatCount(u.postCount)} {t("c.posts")}
        </p>
      </div>
      {me && !u.isMe && (
        <Button
          size="sm"
          variant={st === "NONE" ? "default" : "outline"}
          className={
            st === "NONE"
              ? "h-8 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-3 text-xs text-white hover:opacity-90"
              : "h-8 rounded-full px-3 text-xs"
          }
          disabled={follow.isPending && follow.variables === u.username}
          onClick={() => follow.mutate(u.username)}
        >
          {st === "PENDING" ? t("c.requested") : st === "ACCEPTED" ? t("c.following") : t("c.follow")}
        </Button>
      )}
    </li>
  );
}

export function ExploreView({
  me,
  onNeedLogin,
  initialQuery,
}: {
  me: Me | null;
  onNeedLogin: () => void;
  /** Deep-link #/explore?q=... — langsung diisikan ke kotak pencarian */
  initialQuery?: string;
}) {
  const t = useT();
  // Deep-link hashtag (#/explore?q=...) dipakai sebagai nilai AWAL pencarian
  // (view selalu di-remount oleh router saat berpindah halaman, jadi nilai
  // awal ini ikut kata kunci terbaru setiap masuk dari luar halaman ini).
  const initialQ = initialQuery?.trim().slice(0, RECENT_TERM_MAX) ?? "";
  const [rawSearch, setRawSearch] = useState(initialQ);
  const [search, setSearch] = useState(initialQ);
  const [tab, setTab] = useState<SearchTab>("all");
  const recents = useSyncExternalStore(subscribeRecents, getRecentSnapshot, getRecentServerSnapshot);
  const inputRef = useRef<HTMLInputElement>(null);

  // debounce pencarian 350ms (terasa responsif tanpa membombardir server)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawSearch.trim()), 350);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  function pushRecent(term: string) {
    const value = term.trim().slice(0, RECENT_TERM_MAX);
    if (!value) return;
    // dedupe: term lama dinaikkan ke depan, maksimal 8 item
    setRecentSearches([value, ...recents.filter((x) => x !== value)].slice(0, RECENT_MAX));
  }

  function removeRecent(term: string) {
    setRecentSearches(recents.filter((x) => x !== term));
  }

  function clearRecents() {
    setRecentSearches([]);
  }

  function applyRecent(term: string) {
    setRawSearch(term);
    setSearch(term);
    inputRef.current?.focus();
  }

  const searching = search.length > 0;
  const searchQuery = useSearchAll(search.toLowerCase());
  const postsQuery = useInfinitePosts({ feed: "explore", limit: 24, enabled: !searching });
  const follow = useFollow(onNeedLogin);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = postsQuery;
  const posts = data?.pages.flatMap((p) => p.posts) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || searching) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, searching]);

  useEffect(() => {
    document.title = "Jelajahi · SkelzHub";
  }, []);

  const userResults = searchQuery.data?.users ?? [];
  const postResults = searchQuery.data?.posts ?? [];
  const videoResults = searchQuery.data?.videos ?? [];
  const resultCount = userResults.length + postResults.length + videoResults.length;
  const showAccounts = tab === "all" || tab === "accounts";
  const showPosts = tab === "all" || tab === "posts";
  const showVideos = tab === "all" || tab === "videos";
  const anyInSection =
    (showAccounts && userResults.length > 0) ||
    (showPosts && postResults.length > 0) ||
    (showVideos && videoResults.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
      {/* Kotak pencarian + judul */}
      <div className="mb-5 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">{t("nav.explore")}</h1>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Compass className="h-4 w-4" /> {searching ? t("search.resultsFor", { q: search }) : "Post trending"}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            onKeyDown={(e) => {
              // Enter = submit pencarian -> simpan ke riwayat terakhir dicari
              if (e.key === "Enter") pushRecent(rawSearch);
            }}
            placeholder={t("search.placeholder")}
            className="h-11 rounded-full bg-muted/70 pl-11 pr-11"
            aria-label={t("search.placeholder")}
            maxLength={50}
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
            {rawSearch ? (
              <button
                type="button"
                onClick={() => {
                  setRawSearch("");
                  setSearch("");
                  inputRef.current?.focus();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t("c.cancel")}
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              searchQuery.isFetching && (
                <span className="flex h-8 w-8 items-center justify-center" aria-label={t("search.searching")}>
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </span>
              )
            )}
          </div>
        </div>

        {/* Tab filter hasil — hanya saat sedang mencari */}
        {!searching && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("search.hint")}
          </p>
        )}

        {/* Riwayat pencarian — chip muncul saat kotak pencarian kosong */}
        {!searching && recents.length > 0 && (
          <div className="animate-fade-in-up">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <History className="h-3.5 w-3.5" aria-hidden="true" /> Terakhir dicari
              </p>
              <button
                type="button"
                onClick={clearRecents}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Hapus semua riwayat pencarian"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" /> Hapus semua
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {recents.map((term) => (
                <li
                  key={term}
                  className="flex items-center gap-0.5 rounded-full border bg-card py-1 pl-3 pr-1 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => applyRecent(term)}
                    className="max-w-[180px] truncate font-medium transition-colors hover:text-rose-500"
                    aria-label={`Cari ${term}`}
                  >
                    {term}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRecent(term)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={`Hapus ${term} dari riwayat pencarian`}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {searching && (
          <div role="tablist" aria-label={t("nav.search")} className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  "h-9 min-w-[76px] shrink-0 rounded-full px-3 text-xs font-bold transition-colors",
                  tab === item.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {searching ? (
        /* ===== Hasil pencarian ===== */
        <div className="space-y-6">
          {searchQuery.isLoading && !searchQuery.data && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-11 w-11 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                ))}
              </div>
            </div>
          )}

          {searchQuery.data && resultCount === 0 && (
            <EmptyState
              icon={SearchX}
              title={`Tidak ada hasil untuk “${search}”`}
              subtitle={t("search.noResultsSub")}
            />
          )}

          {/* Akun */}
          {showAccounts && userResults.length > 0 && (
            <section aria-label={t("search.tabAccounts")}>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Users className="h-4 w-4" aria-hidden="true" />
                {t("search.tabAccounts")} <span className="font-normal">({userResults.length})</span>
              </h2>
              <ul className="flex flex-col gap-2.5">
                {userResults.map((u) => (
                  <AccountRow key={u.id} u={u} me={me} follow={follow} t={t} />
                ))}
              </ul>
            </section>
          )}

          {/* Post gambar */}
          {showPosts && postResults.length > 0 && (
            <section aria-label={t("search.tabPosts")}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                {t("search.tabPosts")} <span className="font-normal">({postResults.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
                {postResults.map((p) => (
                  <PostTile key={p.id} post={p} />
                ))}
              </div>
            </section>
          )}

          {/* Video / Shorts */}
          {showVideos && videoResults.length > 0 && (
            <section aria-label={t("search.tabVideos")}>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Clapperboard className="h-4 w-4" aria-hidden="true" />
                {t("search.tabVideos")} <span className="font-normal">({videoResults.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
                {videoResults.map((p) => (
                  <PostTile key={p.id} post={p} />
                ))}
              </div>
            </section>
          )}

          {/* Ada hasil di kategori lain tapi tab ini kosong */}
          {resultCount > 0 && !anyInSection && (
            <EmptyState
              icon={ImageOff}
              title={t("search.noResults")}
              subtitle={t("search.hint")}
              className="px-4 py-8 sm:px-6 sm:py-10"
            />
          )}
        </div>
      ) : (
        /* ===== Mode jelajah: post trending ===== */
        <section aria-label="Trending posts">
          {isLoading && (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-lg" />
              ))}
            </div>
          )}
          {!isLoading && posts.length === 0 && (
            <EmptyState
              icon={Compass}
              title="Belum ada post untuk dijelajahi"
              subtitle="Post terbaru dari komunitas akan muncul di sini begitu ada yang berbagi."
            />
          )}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
            {posts.map((p: Post) => (
              <PostTile key={p.id} post={p} />
            ))}
          </div>
          {isFetchingNextPage && (
            <div className="mt-4 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </section>
      )}
      <div ref={sentinelRef} className="h-2" />
    </div>
  );
}
