"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Bookmark, MoreHorizontal, Trash2, Link2, Send, Flag, Repeat2, Pencil, Share2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Post, Comment, Me } from "@/lib/types";
import { useLike, useSave, useAddComment, useDeletePost, useEditPost, useReportPost, useRepost, useQuoteRepost } from "./hooks";
import { UserAvatarLink, UserAvatar } from "./user-avatar";
import { AdminBadge } from "./admin-badge";
import { formatCount, timeAgo, mediaThumb } from "./utils";

type Props = {
  post: Post;
  me: Me | null;
  onNeedLogin: () => void;
};

export function PostCard({ post, me, onNeedLogin }: Props) {
  const t = useT();
  const like = useLike(onNeedLogin);
  const save = useSave(onNeedLogin);
  const addComment = useAddComment();
  const deletePost = useDeletePost();
  const editPost = useEditPost();
  const reportPost = useReportPost();
  const repost = useRepost(onNeedLogin);
  const quoteRepost = useQuoteRepost(() => void 0);

  const [heartBurst, setHeartBurst] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState<Comment[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");

  // Video post: putar otomatis setelah termuat, mulai BISU (browser selalu
  // mengizinkannya) + tombol suara yang jelas terlihat untuk menyalakan.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);

  const original = post.repostOf ?? null;
  // Repost: interaksi & identitas visual memakai post ASLI
  const eff = original ?? post;
  const isMine = me?.id === eff.author.id;
  const isAdmin = me?.role === "ADMIN" || me?.role === "OWNER";
  const isVideo = eff.type === "VIDEO";
  const canRepost = !!me && !isMine;
  const canEdit = isMine || isAdmin;

  // Autoplay video post — mulai BISU begitu data siap (autoplay bisu selalu
  // diizinkan browser, jadi tidak ada "kedip gagal" bersuara → bisu di awal
  // tampilan). Suara dinyalakan lewat tombol suara (satu ketukan, langsung).
  useEffect(() => {
    if (!isVideo) return;
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      v.muted = true;
      setSoundOn(false);
      setSoundBlocked(true);
      v.play().catch(() => {});
    };
    if (v.readyState >= 1) attempt();
    else v.addEventListener("loadeddata", attempt, { once: true });
    return () => {
      cancelled = true;
      v.removeEventListener("loadeddata", attempt);
      try {
        v.pause();
      } catch {
        /* video sudah dilepas */
      }
    };
  }, [isVideo, eff.media]);

  function toggleVideoSound() {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setSoundOn(!next);
    if (!next) setSoundBlocked(false);
  }

  function handleLike() {
    like.mutate(post.id);
  }

  function handleDoubleTapLike() {
    if (!eff.likedByMe) like.mutate(post.id);
    setHeartBurst(true);
    setTimeout(() => setHeartBurst(false), 700);
  }

  function handleSave() {
    save.mutate(post.id);
  }

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#/post/${post.id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: t("pc.linkCopied") }),
      () => toast({ title: t("pc.linkCopied") })
    );
  }

  // Bagikan ke aplikasi lain lewat lembar berbagi bawaan perangkat;
  // kalau tidak tersedia -> salin link sebagai gantinya.
  async function sharePost() {
    const url = `${window.location.origin}${window.location.pathname}#/post/${post.id}`;
    const text = (eff.caption || `Post oleh @${eff.author.username}`).slice(0, 200);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "SkelzHub", text, url });
        return;
      } catch (err) {
        // pemakai menutup lembar berbagi -> jangan lanjut salin otomatis
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    copyLink();
  }

  function openEdit() {
    setEditText(post.caption ?? "");
    setEditOpen(true);
  }

  function submitEdit() {
    const caption = editText.trim();
    if (original && !caption) return; // kutip repost wajib ada teks
    setEditOpen(false);
    editPost.mutate({ postId: post.id, caption });
  }

  function toggleRepost() {
    repost.mutate(post.id, {
      onSuccess: (r) =>
        toast({
          title: r.reposted ? t("pc.repostToast") : t("pc.unrepostToast"),
        }),
    });
  }

  function submitQuote() {
    const caption = quoteText.trim();
    if (!caption) return;
    setQuoteOpen(false);
    quoteRepost.mutate(
      { postId: post.id, caption },
      {
        onSuccess: () => {
          setQuoteText("");
          toast({ title: t("pc.repostToast") });
        },
      }
    );
  }

  function submitReport() {
    const reason = reportReason.trim();
    if (!reason) {
      toast({ title: t("pc.reportSend") });
      return;
    }
    setReportOpen(false);
    reportPost.mutate(
      { postId: post.id, reason },
      { onSuccess: () => setReportReason("") }
    );
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    if (!me) {
      onNeedLogin();
      return;
    }
    setCommentText("");
    setLocalComments((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        text,
        createdAt: new Date().toISOString(),
        author: { id: me.id, username: me.username, displayName: me.displayName, avatarColor: me.avatarColor, avatar: me.avatar },
      },
    ]);
    addComment.mutate(
      { postId: post.id, text },
      { onError: () => setLocalComments((prev) => prev.filter((c) => c.text !== text || !c.id.startsWith("local"))) }
    );
  }

  const previewComments = [...(eff.previewComments ?? []), ...localComments].slice(0, 3);
  const lastComments = previewComments.slice(-2);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label={`Post oleh ${post.author.username}`}
    >
      {/* Header: penulis + (banner repost bila ini repost) */}
      <header className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        <UserAvatarLink name={post.author.displayName} color={post.author.avatarColor} avatar={post.author.avatar} username={post.author.username} size={38} ring />
        <div className="min-w-0 flex-1 leading-tight">
          <a href={`#/u/${encodeURIComponent(post.author.username)}`} className="flex min-w-0 items-center gap-1.5 text-sm font-semibold hover:underline">
            <span className="truncate">{post.author.displayName}</span>
            {(post.author.role === "ADMIN" || post.author.role === "OWNER") && (
              <span className="shrink-0">
                <AdminBadge role={post.author.role} />
              </span>
            )}
          </a>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {original && (
              <>
                <Repeat2 className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                <span className="truncate">{t("pc.reposted")}</span>
                <span>·</span>
              </>
            )}
            <span className="truncate">
              @{post.author.username} · {timeAgo(post.createdAt)}
            </span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Menu post">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={copyLink}>
              <Link2 className="h-4 w-4" /> {t("pc.copyLink")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={sharePost}>
              <Share2 className="h-4 w-4" /> {t("pc.share")}
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem onClick={openEdit}>
                <Pencil className="h-4 w-4" /> {t("pc.editPost")}
              </DropdownMenuItem>
            )}
            {canRepost && (
              <>
                <DropdownMenuItem onClick={toggleRepost}>
                  <Repeat2 className="h-4 w-4" /> {post.repostedByMe ? t("pc.unrepostToast") : t("pc.repost")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuoteOpen(true)}>
                  <Repeat2 className="h-4 w-4 rotate-180" /> {t("pc.quote")}
                </DropdownMenuItem>
              </>
            )}
            {me && !isMine && (
              <DropdownMenuItem onClick={() => setReportOpen(true)}>
                <Flag className="h-4 w-4" /> {t("pc.report")}
              </DropdownMenuItem>
            )}
            {(isMine || isAdmin) && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => deletePost.mutate(post.id)}
              >
                <Trash2 className="h-4 w-4" /> {t("pc.deletePost")}{isAdmin && !isMine ? t("pc.deleteAdmin") : ""}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Komentar pembuka (quote) */}
      {original && post.caption && (
        <p className="whitespace-pre-wrap break-words border-l-2 border-rose-500/40 px-3 py-1.5 text-sm text-muted-foreground sm:px-4">
          {post.caption}
        </p>
      )}

      {/* Identitas post ASLI (untuk repost bersarang) */}
      {original && (
        <div className="flex items-center gap-2.5 border-y bg-muted/40 px-3 py-2 sm:px-4">
          <UserAvatarLink name={original.author.displayName} color={original.author.avatarColor} avatar={original.author.avatar} username={original.author.username} size={30} ring />
          <div className="min-w-0 flex-1 leading-tight">
            <a href={`#/u/${encodeURIComponent(original.author.username)}`} className="block truncate text-xs font-semibold hover:underline">
              {original.author.displayName}
            </a>
            <p className="truncate text-[11px] text-muted-foreground">
              @{original.author.username} · {timeAgo(original.createdAt)}
            </p>
          </div>
        </div>
      )}

      {/* Media (gambar / video) dengan double-tap like */}
      <div className="relative select-none bg-black" onDoubleClick={handleDoubleTapLike}>
        {isVideo ? (
          <>
            <video
              ref={videoRef}
              src={eff.media ?? undefined}
              controls
              loop
              playsInline
              preload="metadata"
              className="aspect-square w-full bg-black object-contain"
              aria-label={`Video oleh ${eff.author.username}`}
            />
            {/* Tombol suara: nyala kalau autoplay bersuara berhasil. Kalau
                browser memblokir, tanda bisu KE CIL tenang (tanpa kedip)
                supaya tetap terlihat tapi tidak mengganggu. */}
            <button
              type="button"
              onClick={toggleVideoSound}
              aria-label={soundOn ? "Bisukan video" : t("pc.turnOnSound")}
              className={cn(
                "absolute right-2.5 top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                soundBlocked && !soundOn && "ring-1 ring-rose-400/80"
              )}
            >
              {soundOn ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
            </button>
          </>
        ) : (
          <img
            src={mediaThumb(eff.media, 720) ?? undefined}
            alt={`Post oleh ${eff.author.username}: ${eff.caption || ""}`}
            className="aspect-square w-full bg-muted object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        )}
        <AnimatePresence>
          {heartBurst && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.15, 1], opacity: [0, 1, 1] }}
              exit={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 0.55 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <Heart className="h-24 w-24 fill-rose-500 text-rose-500 drop-shadow-lg" aria-hidden="true" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Aksi — padding sama persis dengan header/caption (bingkai rapi) */}
      <div className="flex items-center gap-1 px-3 pt-2.5 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLike}
          aria-pressed={eff.likedByMe}
          aria-label={eff.likedByMe ? "Batalkan suka" : "Sukai post"}
          className="h-10 w-10 rounded-full hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950"
        >
          <motion.span whileTap={{ scale: 0.8 }}>
            <Heart className={cn("h-6 w-6", eff.likedByMe && "fill-rose-500 text-rose-500")} />
          </motion.span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950"
          aria-label="Lihat dan tulis komentar"
          onClick={() => {
            window.location.hash = `#/post/${post.id}`;
          }}
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
        {canRepost && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-10 w-10 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950", post.repostedByMe && "text-rose-500")}
            aria-pressed={post.repostedByMe}
            aria-label={t("pc.repost")}
            onClick={toggleRepost}
          >
            <Repeat2 className={cn("h-6 w-6", post.repostedByMe && "fill-rose-500")} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950"
          aria-label={eff.savedByMe ? "Batalkan simpan" : "Simpan post"}
          aria-pressed={eff.savedByMe}
          onClick={handleSave}
        >
          <Bookmark className={cn("h-6 w-6", eff.savedByMe && "fill-foreground")} />
        </Button>
        {eff.repostCount > 0 && (
          <span className="ml-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
            {formatCount(eff.repostCount)}
          </span>
        )}
      </div>

      {/* Suka & caption */}
      <div className="space-y-1 px-3 pb-2 pt-1 sm:px-4">
        <p className="text-sm font-semibold">{formatCount(eff.likeCount)} {t("pc.likes")}</p>
        {eff.caption && !original && (
          <p className="text-sm leading-snug whitespace-pre-wrap break-words">
            <a href={`#/u/${encodeURIComponent(eff.author.username)}`} className="font-semibold hover:underline">
              {eff.author.username}
            </a>{" "}
            {eff.caption}
          </p>
        )}
        {original && !post.caption && original.caption && (
          <p className="text-sm leading-snug whitespace-pre-wrap break-words">
            <a href={`#/u/${encodeURIComponent(original.author.username)}`} className="font-semibold hover:underline">
              {original.author.username}
            </a>{" "}
            {original.caption}
          </p>
        )}

        {eff.commentCount > 0 && (
          <a href={`#/post/${post.id}`} className="block text-sm text-muted-foreground hover:underline">
            {t("pc.viewComments", { n: formatCount(eff.commentCount) })}
          </a>
        )}
        {lastComments.map((c) => (
          <p key={c.id} className="flex items-center gap-1.5 text-sm leading-snug break-words">
            <a href={`#/u/${encodeURIComponent(c.author.username)}`} className="shrink-0 hover:opacity-80" aria-label={`Profil ${c.author.username}`}>
              <UserAvatar name={c.author.displayName} color={c.author.avatarColor} avatar={c.author.avatar} size={20} />
            </a>
            <span className="min-w-0">
              <a href={`#/u/${encodeURIComponent(c.author.username)}`} className="font-semibold hover:underline">
                {c.author.username}
              </a>{" "}
              {c.replyTo && (
                <span className="text-muted-foreground">
                  <span className="text-rose-500/80">↷</span> @{c.replyTo.username}{" "}
                </span>
              )}
              {c.text}
            </span>
          </p>
        ))}
      </div>

      {/* Input komentar */}
      <form onSubmit={submitComment} className="flex items-center gap-2 border-t px-3 py-2 sm:px-4">
        <Input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={me ? t("pc.commentPlaceholder") : t("pc.commentLogin")}
          className="h-9 flex-1 rounded-full border-none bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring"
          maxLength={500}
          aria-label="Tulis komentar"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          disabled={!commentText.trim() || addComment.isPending}
          className="h-9 w-9 shrink-0 text-rose-500 hover:text-rose-600"
          aria-label="Kirim komentar"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>

      {/* Dialog kutip repost */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pc.quote")}</DialogTitle>
            <DialogDescription>{t("pc.repostToast")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={quoteText}
              onChange={(e) => setQuoteText(e.target.value)}
              placeholder={t("pc.commentPlaceholder")}
              className="min-h-[90px] resize-none"
              maxLength={2200}
              aria-label={t("pc.quote")}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQuoteOpen(false)}>
              {t("c.cancel")}
            </Button>
            <Button
              onClick={submitQuote}
              disabled={!quoteText.trim() || quoteRepost.isPending}
              className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
            >
              {t("pc.repost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog edit post */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pc.editTitle")}</DialogTitle>
            <DialogDescription>{t("pc.editDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder={t("pc.commentPlaceholder")}
              className="min-h-[110px] resize-none"
              maxLength={2200}
              aria-label={t("pc.editTitle")}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{editText.length}/2200</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={editPost.isPending}>
              {t("c.cancel")}
            </Button>
            <Button
              onClick={submitEdit}
              disabled={editPost.isPending || (original ? !editText.trim() : false)}
              className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
            >
              {t("c.savechanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog laporan */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pc.reportTitle")}</DialogTitle>
            <DialogDescription>{t("pc.reportDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={t("pc.reportPlaceholder")}
              className="min-h-[90px] resize-none"
              maxLength={300}
              aria-label={t("pc.reportTitle")}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{reportReason.length}/300</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={reportPost.isPending}>
              {t("c.cancel")}
            </Button>
            <Button
              onClick={submitReport}
              disabled={!reportReason.trim() || reportPost.isPending}
              className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
            >
              {t("pc.reportSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.article>
  );
}
