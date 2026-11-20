"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, Loader2, LogOut, Pencil, UserRoundX, Bookmark, Lock, MessageCircle, Settings as SettingsIcon, Grid3x3, Repeat2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Me } from "@/lib/types";
import { useUser, useInfinitePosts, useFollow, useUpdateProfile, useLogout, useStartConversation, useStories } from "../hooks";
import { PostGrid } from "../post-grid";
import { UserAvatar } from "../user-avatar";
import { AdminBadge } from "../admin-badge";
import { FollowListDialog } from "../followers-dialog";
import { StoryViewer, CreateStoryDialog } from "../story";
import { formatCount, timeAgo } from "../utils";

export function ProfileView({ username, me }: { username: string; me: Me | null }) {
  const t = useT();
  const userQuery = useUser(username);
  const user = userQuery.data?.user;
  const isPrivateWall = !!user && user.isPrivate && !user.isMe && user.followStatus !== "ACCEPTED";
  const [tab, setTab] = useState<"posts" | "reposts">("posts");
  const postsQuery = useInfinitePosts({ feed: "profile", username, limit: 18, enabled: !isPrivateWall && tab === "posts" });
  const repostsQuery = useInfinitePosts({ feed: "reposts", username, limit: 18, enabled: !isPrivateWall && tab === "reposts" });
  // Story dari profil (mekanisme sama seperti di feed): ring di avatar + buka penampil
  const storiesQuery = useStories(!!me && !isPrivateWall);
  const storyGroup = storiesQuery.data?.groups.find((g) => g.author.username === username) ?? null;
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  // Pratinjau foto profil (lightbox) saat avatar diklik tanpa story aktif
  const [photoOpen, setPhotoOpen] = useState(false);
  const follow = useFollow(() => {
    toast({ title: t("misc.needLogin"), description: t("misc.needLoginSub") });
    window.location.hash = "#/login";
  });
  const updateProfile = useUpdateProfile();
  const logout = useLogout(() => {
    window.location.hash = "#/";
  });
  const startConversation = useStartConversation();

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [listOpen, setListOpen] = useState<"followers" | "following" | null>(null);

  useEffect(() => {
    document.title = userQuery.data ? `${userQuery.data.user.displayName} (@${userQuery.data.user.username}) · SkelzHub` : `${t("nav.profile")} · SkelzHub`;
  }, [userQuery.data, t]);

  function openEdit() {
    if (!user) return;
    setEditName(user.displayName);
    setEditBio(user.bio);
    setEditOpen(true);
  }

  function saveEdit() {
    if (!user) return;
    updateProfile.mutate(
      { username: user.username, displayName: editName.trim(), bio: editBio.trim() },
      { onSuccess: () => setEditOpen(false) }
    );
  }

  function openDm() {
    if (!user || !me) return;
    startConversation.mutate(user.username, {
      onSuccess: (data) => {
        window.location.hash = `#/chat/${data.conversationId}`;
      },
    });
  }

  // Klik avatar profil: punya story -> tonton; tanpa story tapi punya foto
  // profil -> pratinjau foto; profil sendiri tanpa keduanya -> buat story baru
  function openStoryFromAvatar() {
    if (storyGroup && storyGroup.items.length > 0) {
      setStoryViewerOpen(true);
    } else if (user?.avatar) {
      setPhotoOpen(true);
    } else if (user?.isMe && me) {
      setCreateStoryOpen(true);
    }
  }

  // Lightbox foto profil: Esc menutup pratinjau
  useEffect(() => {
    if (!photoOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPhotoOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoOpen]);

  // Unduh foto profil: blob -> nama {username}.jpg (fallback: buka tautan)
  async function downloadAvatarPhoto() {
    if (!user?.avatar) return;
    try {
      const res = await fetch(user.avatar);
      if (!res.ok) throw new Error("Gagal mengunduh");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${user.username}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      window.open(user.avatar, "_blank");
    }
  }

  if (userQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 px-2 py-6 sm:px-4">
        <div className="flex items-center gap-6">
          <Skeleton className="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-64" />
            <div className="flex gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <UserRoundX className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">{t("profile.notFound")}</h1>
        <p className="text-sm text-muted-foreground">{t("profile.notFoundSub", { u: username })}</p>
        <a href="#/explore">
          <Button variant="outline">{t("profile.findOther")}</Button>
        </a>
      </div>
    );
  }

  const isMe = !!me && me.id === user.id;
  const followStatus = user.followStatus ?? (user.isFollowing ? "ACCEPTED" : "NONE");
  const presenceOnline = !!user.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < 75_000;
  const hasStory = !!(storyGroup && storyGroup.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-2 py-4 sm:px-4 sm:py-6">
      {/* Info profil */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
        {/* Avatar dengan ring story — klik untuk menonton story dari profil */}
        <motion.button
          type="button"
          onClick={openStoryFromAvatar}
          whileTap={{ scale: 0.94 }}
          className={cn(
            "relative shrink-0 self-start rounded-full",
            hasStory || user.avatar || (isMe && me) ? "cursor-pointer" : "cursor-default"
          )}
          aria-label={
            hasStory
              ? `${t("st.story")}: ${user.displayName}`
              : user.avatar
                ? t("profile.viewPhoto")
                : isMe
                  ? t("st.addStory")
                  : undefined
          }
        >
          <span className={cn("block rounded-full p-[3px] transition-transform", hasStory ? "animate-story-ring bg-gradient-to-tr from-rose-500 via-pink-500 to-orange-400" : "bg-muted/30")}>
            <UserAvatar name={user.displayName} color={user.avatarColor} avatar={user.avatar} size={88} />
          </span>
          {isMe && !hasStory && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-gradient-to-r from-rose-500 to-orange-400 text-white shadow-md">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          )}
        </motion.button>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="flex items-center gap-2 truncate text-xl font-bold tracking-tight">
              {user.displayName}
              {(user.role === "ADMIN" || user.role === "OWNER") && <AdminBadge role={user.role} />}
              {user.isPrivate && (
                <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden="true" /> {t("c.private")}
                </span>
              )}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isMe ? (
              <>
                <a href="#/settings">
                  <Button variant="outline" size="sm">
                    <Pencil className="h-4 w-4" /> {t("profile.edit")}
                  </Button>
                </a>
                <a href="#/settings">
                  <Button variant="outline" size="sm">
                    <SettingsIcon className="h-4 w-4" /> {t("profile.settings")}
                  </Button>
                </a>
                <a href="#/saved" className="sm:hidden">
                  <Button variant="outline" size="sm">
                    <Bookmark className="h-4 w-4" /> {t("nav.saved")}
                  </Button>
                </a>
                <Button variant="ghost" size="sm" className="text-muted-foreground md:hidden" onClick={() => logout.mutate()}>
                  <LogOut className="h-4 w-4" /> {t("nav.logout")}
                </Button>
              </>
            ) : me ? (
              <>
                <Button
                  size="sm"
                  onClick={() => follow.mutate(user.username)}
                  disabled={follow.isPending}
                  className={cn(
                    followStatus === "ACCEPTED" ? "rounded-full" : "rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                  )}
                  variant={followStatus === "ACCEPTED" ? "outline" : "default"}
                >
                  {follow.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {followStatus === "ACCEPTED" ? t("c.following") : followStatus === "PENDING" ? t("c.requested") : t("c.follow")}
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={openDm} disabled={startConversation.isPending}>
                  <MessageCircle className="h-4 w-4" /> {t("c.message")}
                </Button>
              </>
            ) : (
              <a href="#/login">
                <Button size="sm" className="rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
                  {t("c.follow")}
                </Button>
              </a>
            )}
          </div>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          {/* Status online / terakhir aktif */}
          {!isMe && (
            <p className={cn("flex items-center gap-1.5 text-xs", presenceOnline ? "font-medium text-emerald-500" : "text-muted-foreground")}>
              <span className={cn("h-2 w-2 rounded-full", presenceOnline ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600")} aria-hidden="true" />
              {presenceOnline
                ? t("p.online")
                : user.lastSeenAt
                  ? t("p.lastSeen", { t: timeAgo(user.lastSeenAt) })
                  : t("p.offline")}
            </p>
          )}
          <div className="flex flex-wrap gap-4 sm:gap-6">
            <button type="button" className="flex flex-col items-center sm:flex-row sm:gap-1.5" aria-label={t("c.posts")}>
              <span className="font-bold tabular-nums">{formatCount(user.postCount)}</span>
              <span className="text-xs text-muted-foreground sm:text-sm">{t("c.posts")}</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center sm:flex-row sm:gap-1.5"
              aria-label={t("c.followers")}
              onClick={() => setListOpen("followers")}
            >
              <span className="font-bold tabular-nums">{formatCount(user.followerCount)}</span>
              <span className="text-xs text-muted-foreground hover:underline sm:text-sm">{t("c.followers")}</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center sm:flex-row sm:gap-1.5"
              aria-label={t("c.followingList")}
              onClick={() => setListOpen("following")}
            >
              <span className="font-bold tabular-nums">{formatCount(user.followingCount)}</span>
              <span className="text-xs text-muted-foreground hover:underline sm:text-sm">{t("c.followingList")}</span>
            </button>
          </div>
          {user.bio && !isPrivateWall && <p className="whitespace-pre-wrap text-sm leading-relaxed">{user.bio}</p>}
        </div>
      </header>

      {/* Tab Postingan / Postingan Ulang */}
      <div className="mb-3 flex border-b" role="tablist" aria-label="Kategori konten profil">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "posts"}
          onClick={() => setTab("posts")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors sm:flex-none sm:gap-2 sm:px-8 sm:text-sm",
            tab === "posts"
              ? "border-rose-500 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Grid3x3 className="h-4 w-4" aria-hidden="true" />
          {t("profile.tabPosts")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "reposts"}
          onClick={() => setTab("reposts")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors sm:flex-none sm:gap-2 sm:px-8 sm:text-sm",
            tab === "reposts"
              ? "border-rose-500 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Repeat2 className="h-4 w-4" aria-hidden="true" />
          {t("profile.tabReposts")}
        </button>
      </div>

      {/* Grid post / repost / dinding privat */}
      <section aria-label={`Konten oleh ${user.username}`}>
        {isPrivateWall ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15">
              <Lock className="h-7 w-7 text-rose-500" />
            </span>
            <p className="font-semibold">{t("profile.privateTitle")}</p>
            <p className="max-w-xs text-sm text-muted-foreground">{t("profile.privateSub", { u: user.username })}</p>
          </div>
        ) : tab === "posts" ? (
          (() => {
            const posts = postsQuery.data?.pages.flatMap((p) => p.posts) ?? [];
            if (postsQuery.isLoading) {
              return (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                  ))}
                </div>
              );
            }
            if (posts.length === 0) {
              return (
                <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-10 text-center">
                  <p className="font-semibold">{t("profile.noPosts")}</p>
                  <p className="text-sm text-muted-foreground">
                    {isMe ? t("profile.noPostsMe") : t("profile.noPostsOther", { u: user.username })}
                  </p>
                  {isMe && (
                    <a href="#/create" className="mt-2">
                      <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
                        {t("profile.firstPost")}
                      </Button>
                    </a>
                  )}
                </div>
              );
            }
            return <PostGrid posts={posts} />;
          })()
        ) : (
          (() => {
            const reposts = repostsQuery.data?.pages.flatMap((p) => p.posts) ?? [];
            // Tab repost khusus pengikut: bila disembunyikan, tampilkan penjelasan
            const repostsHidden = repostsQuery.data?.pages.some((p) => p.hidden);
            if (repostsHidden) {
              return (
                <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <p className="font-semibold">{t("profile.repostsLocked")}</p>
                  <p className="max-w-xs text-sm text-muted-foreground">{t("profile.repostsLockedSub", { u: user.username })}</p>
                </div>
              );
            }
            if (repostsQuery.isLoading) {
              return (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                  ))}
                </div>
              );
            }
            if (reposts.length === 0) {
              return (
                <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Repeat2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <p className="font-semibold">{t("profile.noReposts")}</p>
                  <p className="text-sm text-muted-foreground">{t("profile.noRepostsSub")}</p>
                </div>
              );
            }
            return <PostGrid posts={reposts} />;
          })()
        )}
      </section>

      {/* Dialog daftar pengikut / mengikuti */}
      {listOpen && (
        <FollowListDialog
          username={user.username}
          displayName={user.displayName}
          mode={listOpen}
          me={me}
          onNeedLogin={() => {
            toast({ title: t("misc.needLogin"), description: t("misc.needLoginSub") });
            window.location.hash = "#/login";
          }}
          onClose={() => setListOpen(null)}
        />
      )}

      {/* Penampil story dibuka dari avatar profil (mekanisme sama seperti feed) */}
      {storyViewerOpen && storyGroup && me && (
        <StoryViewer groups={[storyGroup]} startIndex={0} me={me} onClose={() => setStoryViewerOpen(false)} />
      )}
      {createStoryOpen && me && <CreateStoryDialog me={me} onClose={() => setCreateStoryOpen(false)} />}

      {/* Lightbox pratinjau foto profil: tutup (X / Esc / klik latar) + unduh */}
      {photoOpen && user?.avatar && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={t("profile.viewPhoto")}
          onClick={() => setPhotoOpen(false)}
        >
          <img
            src={user.avatar}
            alt={`${user.displayName} (@${user.username})`}
            className="max-h-[85vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label={t("dm.closePreview")}
            onClick={() => setPhotoOpen(false)}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              downloadAvatarPhoto();
            }}
            className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] right-3 flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("dm.download")}
          </button>
        </div>
      )}

      {/* Dialog edit profil (nama & bio ringan; lengkapnya di Pengaturan) */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-t-2xl border bg-card p-4 shadow-xl sm:rounded-2xl sm:p-6">
            <h2 className="mb-1 text-base font-bold">{t("profile.editTitle")}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{t("profile.editDesc")}</p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t("profile.name")}</Label>
                <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={40} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-bio">{t("profile.bio")}</Label>
                <Textarea id="edit-bio" value={editBio} onChange={(e) => setEditBio(e.target.value)} className="min-h-[80px] resize-none" maxLength={160} />
                <div className="text-right text-xs text-muted-foreground">{editBio.length}/160</div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={updateProfile.isPending}>
                  {t("c.cancel")}
                </Button>
                <Button
                  onClick={saveEdit}
                  disabled={updateProfile.isPending || !editName.trim()}
                  className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                >
                  {updateProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("c.savechanges")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
