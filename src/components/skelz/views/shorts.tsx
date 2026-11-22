"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clapperboard,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Send,
  Share2,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Comment, Me, Post } from "@/lib/types";
import { useAddComment, useComments, useDeleteComment, useInfinitePosts, useLike } from "../hooks";
import { UserAvatarLink } from "../user-avatar";
import { formatCount, timeAgo } from "../utils";

const TAP_DELAY = 250; // ms — jeda maksimum antar ketukan ganda

// ---- Kerangka saat memuat ----

function ShortSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="relative flex h-full snap-start items-center justify-center overflow-hidden rounded-xl bg-black md:border md:border-white/10"
    >
      <div className="mx-auto h-full w-full max-w-[min(100%,480px)]">
        <Skeleton className="h-full w-full rounded-none bg-white/5" />
      </div>
    </section>
  );
}

// ---- Keadaan kosong ----

function ShortsEmpty() {
  return (
    <section className="flex h-full snap-start items-center justify-center p-4" aria-label="Belum ada Shorts">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-orange-400/20">
          <Clapperboard className="h-7 w-7 text-rose-500" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold">Belum ada Shorts</h2>
        <p className="text-sm text-muted-foreground">Bagikan video pendek pertamamu!</p>
        <a href="#/create" className="mt-1">
          <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
            Buat Short
          </Button>
        </a>
      </div>
    </section>
  );
}

// ---- Keadaan gagal memuat ----

function ShortsError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="flex h-full snap-start items-center justify-center p-4" role="alert">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <p className="font-semibold text-destructive">Gagal memuat Shorts</p>
        <p className="text-sm text-muted-foreground">Periksa koneksi internetmu, lalu coba lagi.</p>
        <Button variant="outline" onClick={onRetry}>
          Coba lagi
        </Button>
      </div>
    </section>
  );
}

// ---- Baris komentar (mengikuti gaya post-detail; mendukung balasan) ----

function CommentRow({
  comment,
  canDelete,
  isReply,
  onDelete,
  onReply,
}: {
  comment: Comment;
  canDelete: boolean;
  isReply?: boolean;
  onDelete: (id: string) => void;
  onReply: (c: Comment) => void;
}) {
  return (
    <div className={cn("group flex items-start gap-2.5", isReply ? "py-1.5" : "py-2")}>
      <UserAvatarLink
        name={comment.author.displayName}
        color={comment.author.avatarColor}
        avatar={comment.author.avatar}
        username={comment.author.username}
        size={isReply ? 26 : 32}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm leading-snug break-words">
          <a href={`#/u/${encodeURIComponent(comment.author.username)}`} className="font-semibold hover:underline">
            {comment.author.displayName}
          </a>
          <span className="truncate text-xs font-normal text-muted-foreground">@{comment.author.username}</span>
        </p>
        {isReply && comment.replyTo && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="mr-0.5 text-rose-500/80" aria-hidden="true">↷</span>
            <span className="shrink-0">membalas</span>
            <a href={`#/u/${encodeURIComponent(comment.replyTo.username)}`} className="font-medium text-rose-600 hover:underline">
              @{comment.replyTo.username}
            </a>
          </p>
        )}
        <p className="mt-0.5 break-words text-sm leading-snug text-foreground/90">{comment.text}</p>
        <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{timeAgo(comment.createdAt)}</span>
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="font-semibold transition-colors hover:text-rose-500"
          >
            Balas
          </button>
        </p>
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(comment.id)}
          className="rounded-full p-1.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Hapus komentar"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Isi dialog komentar — hanya terpasang saat dialog benar-benar terbuka,
// sehingga query komentar tidak berjalan untuk setiap Short di feed.
function CommentsBody({ post, me, onNeedLogin }: { post: Post; me: Me | null; onNeedLogin: () => void }) {
  const commentsQuery = useComments(post.id);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment(post.id);
  const [text, setText] = useState("");
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);

  const comments = commentsQuery.data?.pages.flatMap((p) => p.comments) ?? [];
  const isMine = !!me && me.id === post.author.id;

  // Susun thread: komentar utama + balasannya (terlama dulu) — rapi seperti post-detail
  const threads = useMemo(() => {
    const tops = comments.filter((c) => !c.parentId);
    const byParent = new Map<string, Comment[]>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const list = byParent.get(c.parentId) ?? [];
      list.push(c);
      byParent.set(c.parentId, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return tops.map((t) => ({ top: t, replies: byParent.get(t.id) ?? [] }));
  }, [comments]);

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (!me) {
      onNeedLogin();
      return;
    }
    setText("");
    const target = replyTarget;
    setReplyTarget(null);
    addComment.mutate({ postId: post.id, text: value, parentId: target?.id });
  }

  const inputPlaceholder = replyTarget
    ? `Balas @${replyTarget.author.username}...`
    : me
      ? "Tambahkan komentar..."
      : "Login untuk berkomentar";

  return (
    <>
      <DialogHeader className="border-b px-5 py-4 text-left">
        <DialogTitle className="text-base">Komentar</DialogTitle>
        <DialogDescription className="text-xs">
          {formatCount(post.commentCount)} komentar pada Short oleh @{post.author.username}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
        {commentsQuery.isLoading ? (
          <div className="space-y-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3 py-2.5">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-semibold">Belum ada komentar</p>
            <p className="text-xs text-muted-foreground">Jadilah yang pertama berkomentar!</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {threads.map(({ top, replies }) => (
              <li key={top.id}>
                <CommentRow
                  comment={top}
                  canDelete={!!me && (top.author.id === me.id || isMine)}
                  onDelete={(cid) => deleteComment.mutate(cid)}
                  onReply={setReplyTarget}
                />
                {replies.length > 0 && (
                  <div className="ml-9 mt-0.5 border-l-2 border-muted pl-3">
                    {replies.map((r) => (
                      <CommentRow
                        key={r.id}
                        comment={r}
                        isReply
                        canDelete={!!me && (r.author.id === me.id || isMine)}
                        onDelete={(cid) => deleteComment.mutate(cid)}
                        onReply={setReplyTarget}
                      />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {commentsQuery.hasNextPage && (
          <button
            type="button"
            className="mx-auto my-3 block text-sm text-muted-foreground hover:underline disabled:cursor-default"
            onClick={() => commentsQuery.fetchNextPage()}
            disabled={commentsQuery.isFetchingNextPage}
          >
            {commentsQuery.isFetchingNextPage ? "Memuat..." : "Muat komentar lainnya"}
          </button>
        )}
      </div>

      <form onSubmit={submitComment} className="flex flex-col gap-1.5 border-t px-4 py-3">
        {replyTarget && (
          <div className="flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1.5 text-xs text-muted-foreground animate-fade-in">
            <span className="text-rose-500" aria-hidden="true">↷</span>
            <span className="min-w-0 flex-1 truncate">
              membalas <span className="font-semibold text-rose-600">@{replyTarget.author.username}</span>
            </span>
            <button
              type="button"
              className="rounded-full p-1 transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setReplyTarget(null)}
              aria-label="Batal balas"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={inputPlaceholder}
            className="h-10 flex-1 rounded-full border-none bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring"
            maxLength={500}
            aria-label="Tulis komentar"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            disabled={!text.trim() || addComment.isPending}
            className="h-10 w-10 shrink-0 text-rose-500 hover:text-rose-600"
            aria-label="Kirim komentar"
          >
            {addComment.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </form>
    </>
  );
}

function ShortCommentsDialog({
  post,
  me,
  open,
  onOpenChange,
  onNeedLogin,
}: {
  post: Post;
  me: Me | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNeedLogin: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70vh] flex-col gap-0 p-0 sm:max-w-md max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl">
        <CommentsBody post={post} me={me} onNeedLogin={onNeedLogin} />
      </DialogContent>
    </Dialog>
  );
}

// ---- Satu Short ----

function ShortItem({ post, me, onNeedLogin, nextMedia }: { post: Post; me: Me | null; onNeedLogin: () => void; nextMedia?: string | null }) {
  const like = useLike(onNeedLogin);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // Suara Short: default NYALA (tidak otomatis dibisukan). Kalau browser
  // memblokir autoplay bersuara -> fallback bisu + tanda jelas untuk menyalakan.
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [visible, setVisible] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);

  // Autoplay hanya saat Short terlihat >60% (satu observer per Short).
  // Coba diputar BERSUARA dulu; browser yang memblokir -> bisu + tanda.
  // Saat terlihat, video SHORT BERIKUTNYA juga di-pra-ambil (metadata)
  // supaya scroll ke bawah langsung bisa diputar tanpa jeda.
  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;
    let prefetched = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            video.muted = false; // suara langsung menyala
            video
              .play()
              .then(() => {
                setIsPaused(false);
              })
              .catch(() => {
                // Browser memblokir autoplay bersuara -> putar bisu dulu,
                // tampilkan tanda agar pengguna bisa menyalakannya dengan satu ketukan.
                video.muted = true;
                setMuted(true);
                setSoundBlocked(true);
                video.play().then(() => setIsPaused(false)).catch(() => setIsPaused(true));
              });
            if (!prefetched && nextMedia) {
              prefetched = true;
              const v = document.createElement("video");
              v.preload = "metadata";
              v.muted = true;
              v.src = nextMedia; // masuk cache HTTP immutable (immutable, 1 tahun)
            }
          } else {
            setVisible(false);
            video.pause();
          }
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [nextMedia]);

  // Sinkronkan status bisu ke elemen video
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  // Batalkan timer ketuk tunggal yang tersisa saat komponen dilepas
  useEffect(() => {
    const timer = tapTimerRef;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPaused(false)).catch(() => setIsPaused(true));
    } else {
      video.pause();
    }
  }

  function handleDoubleTapLike() {
    if (!post.likedByMe) like.mutate(post.id);
    setHeartBurst(true);
    setTimeout(() => setHeartBurst(false), 700);
  }

  // Ketuk tunggal = putar/jeda; ketukan ganda = suka (dibedakan lewat timer)
  function handleTap() {
    const now = Date.now();
    if (now - lastTapRef.current < TAP_DELAY) {
      lastTapRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      handleDoubleTapLike();
      return;
    }
    lastTapRef.current = now;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      togglePlay();
    }, TAP_DELAY);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    const video = videoRef.current;
    if (video) video.muted = next;
    if (!next) setSoundBlocked(false); // suara sudah dinyalakan pengguna
  }

  // Bagikan Short lewat lembar berbagi bawaan perangkat (muncul di aplikasi
  // apa pun yang terpasang); kalau tidak tersedia -> salin link.
  async function sharePost() {
    const url = `${window.location.origin}${window.location.pathname}#/post/${post.id}`;
    const text = (post.caption || `Short oleh @${post.author.username}`).slice(0, 200);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "SkelzHub", text, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // pengguna menutup lembar berbagi
      }
    }
    copyLink();
  }

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#/post/${post.id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: "Link Short disalin" }),
      () => toast({ title: "Tidak bisa menyalin link" })
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label={`Short oleh @${post.author.username}`}
      className="relative flex h-full snap-start items-center justify-center overflow-hidden rounded-xl bg-black md:border md:border-white/10"
    >
      <div className="relative mx-auto h-full w-full max-w-[min(100%,480px)]">
        <video
          ref={videoRef}
          src={post.media ?? undefined}
          className="h-full w-full object-contain"
          loop
          playsInline
          preload="metadata"
          aria-label={`Video Short oleh @${post.author.username}`}
          onPlay={() => setIsPaused(false)}
          onPause={() => setIsPaused(true)}
          onLoadedData={() => setVideoReady(true)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) setVideoProgress(Math.min(1, v.currentTime / v.duration));
          }}
        />

        {/* Bar progres video (tipis, bergaya modern) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[3px] bg-white/10" aria-hidden="true">
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-orange-400"
            style={{ width: `${videoProgress * 100}%` }}
          />
        </div>

        {/* Area ketuk: sekali = putar/jeda, dua kali = suka */}
        <button
          type="button"
          onClick={handleTap}
          className="absolute inset-0 z-0 touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label="Putar atau jeda video"
        />

        {/* Gradasi bawah agar teks tetap terbaca */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-t from-black/40 via-black/10 to-transparent"
        />

        {/* Pemuat video */}
        {!videoReady && (
          <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center" role="status">
            <span className="sr-only">Memuat video...</span>
            <Loader2 className="h-8 w-8 animate-spin text-white/60" aria-hidden="true" />
          </div>
        )}

        {/* Indikator jeda */}
        <AnimatePresence>
          {visible && isPaused && videoReady && (
            <motion.div
              key="paused"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            >
              <Play className="h-14 w-14 fill-white/80 text-white/80 drop-shadow-lg" aria-hidden="true" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Animasi hati saat ketukan ganda */}
        <AnimatePresence>
          {heartBurst && (
            <motion.div
              key="burst"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.15, 1], opacity: [0, 1, 1] }}
              exit={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 0.55 }}
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            >
              <Heart className="h-24 w-24 fill-rose-500 text-rose-500 drop-shadow-lg" aria-hidden="true" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tombol suara (bersuara default; berdenyut bila autoplay bersuara diblokir browser) */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Aktifkan suara" : "Bisukan video"}
          className={cn(
            "absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            soundBlocked && muted && "animate-pulse ring-2 ring-white/60"
          )}
        >
          {muted ? (
            <VolumeX className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden="true" />
          )}
        </button>

        {/* Tanda "Bersuara" saat autoplay bersuara diblokir browser — satu ketukan langsung menyalakan */}
        <AnimatePresence>
          {soundBlocked && muted && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              type="button"
              onClick={toggleMute}
              className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/80"
            >
              {"Ketuk untuk bersuara"}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Info pembuat + caption */}
        <div className="absolute bottom-4 left-3 right-16 z-10">
          <div className="flex items-center gap-2.5">
            <UserAvatarLink
              name={post.author.displayName}
              color={post.author.avatarColor}
              avatar={post.author.avatar}
              username={post.author.username}
              size={36}
              className="ring-white/80"
            />
            <a
              href={`#/u/${encodeURIComponent(post.author.username)}`}
              className="text-sm font-semibold text-white drop-shadow-md hover:underline"
            >
              @{post.author.username}
            </a>
            <span className="text-xs text-white/70 drop-shadow-sm">{timeAgo(post.createdAt)}</span>
          </div>
          {post.caption && (
            <button
              type="button"
              onClick={() => setCaptionExpanded((v) => !v)}
              aria-expanded={captionExpanded}
              aria-label={captionExpanded ? "Tutup caption" : "Buka caption lengkap"}
              className={cn(
                "mt-1.5 max-w-full text-left text-sm leading-snug text-white/90 drop-shadow-sm",
                captionExpanded ? "whitespace-pre-wrap break-words" : "line-clamp-2 break-words"
              )}
            >
              {post.caption}
            </button>
          )}
        </div>

        {/* Rel aksi kanan */}
        <div className="absolute bottom-24 right-2 z-10 flex flex-col items-center gap-4 text-white">
          <div className="flex flex-col items-center gap-1">
            <motion.button
              whileTap={{ scale: 0.82 }}
              type="button"
              onClick={() => like.mutate(post.id)}
              aria-pressed={post.likedByMe}
              aria-label={post.likedByMe ? "Batalkan suka" : "Sukai Short"}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                post.likedByMe
                  ? "bg-rose-500/90 shadow-[0_0_18px_rgba(244,63,94,0.45)]"
                  : "bg-black/50 hover:bg-black/70"
              )}
            >
              <motion.span
                key={post.likedByMe ? "liked" : "unliked"}
                initial={{ scale: post.likedByMe ? 1.35 : 1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="inline-flex"
              >
                <Heart
                  className={cn("h-7 w-7 drop-shadow-md", post.likedByMe ? "fill-white text-white" : "text-white")}
                  aria-hidden="true"
                />
              </motion.span>
            </motion.button>
            <span className="text-xs font-semibold drop-shadow-md">{formatCount(post.likeCount)}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <motion.button
              whileTap={{ scale: 0.82 }}
              type="button"
              onClick={() => setCommentsOpen(true)}
              aria-label={`Lihat dan tulis komentar (${formatCount(post.commentCount)} komentar)`}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <MessageCircle className="h-7 w-7 text-white drop-shadow-md" aria-hidden="true" />
            </motion.button>
            <span className="text-xs font-semibold drop-shadow-md">{formatCount(post.commentCount)}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <motion.button
              whileTap={{ scale: 0.82 }}
              type="button"
              onClick={sharePost}
              aria-label="Bagikan Short"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Share2 className="h-7 w-7 text-white drop-shadow-md" aria-hidden="true" />
            </motion.button>
            <span className="text-xs font-semibold drop-shadow-md">Bagikan</span>
          </div>
        </div>

        {/* Dialog komentar (bottom sheet di ponsel) */}
        <ShortCommentsDialog
          post={post}
          me={me}
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
          onNeedLogin={onNeedLogin}
        />
      </div>
    </section>
  );
}

// ---- Tampilan utama Shorts ----

export function ShortsView({ me, onNeedLogin }: { me: Me | null; onNeedLogin: () => void }) {
  const query = useInfinitePosts({ feed: "shorts", limit: 5 });
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const posts = data?.pages.flatMap((p) => p.posts) ?? [];

  useEffect(() => {
    document.title = "Shorts · SkelzHub";
  }, []);

  // Paginasi tak berujung lewat sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Mobile: header 56px + garis 1 + nav 60px + garis 1 = 118px (+ safe-area
  // untuk perangkat berponi). Desktop: tinggi penuh. Snap murni tanpa
  // jarak/padding ekstra supaya tiap Short mengisi halaman penuh.
  return (
    <div className="h-[calc(100dvh-118px-env(safe-area-inset-bottom))] w-full snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:h-[calc(100dvh-1px)] md:bg-neutral-950 md:px-4 md:py-4">
      {isLoading && (
        <>
          <span className="sr-only" role="status" aria-live="polite">
            Memuat Shorts...
          </span>
          <ShortSkeleton />
          <ShortSkeleton />
        </>
      )}

      {!isLoading && isError && <ShortsError onRetry={() => refetch()} />}

      {!isLoading && !isError && posts.length === 0 && <ShortsEmpty />}

      {posts.map((post, i) => (
        <ShortItem
          key={post.id}
          post={post}
          me={me}
          onNeedLogin={onNeedLogin}
          nextMedia={posts[i + 1]?.media}
        />
      ))}

      {isFetchingNextPage && (
        <div className="flex h-20 items-center justify-center" role="status" aria-label="Memuat Shorts lainnya">
          <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-hidden="true" />
        </div>
      )}

      {!isLoading && !isError && !hasNextPage && posts.length > 0 && (
        <p className="py-4 text-center text-xs text-white/50">Kamu sudah menonton semua Shorts.</p>
      )}

      <div ref={sentinelRef} className="h-2 w-full" aria-hidden="true" />
    </div>
  );
}
