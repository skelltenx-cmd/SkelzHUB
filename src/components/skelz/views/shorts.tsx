"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Plus,
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
import type { Comment, FollowStatus, Me, Post } from "@/lib/types";
import { useAddComment, useComments, useDeleteComment, useFollow, useInfinitePosts, useLike, useSave } from "../hooks";
import { useShortsSound } from "../shorts-sound";
import { EmojiPickerButton } from "../emoji-picker";
import { RichText } from "../richtext";
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

function ShortsEmpty({ following = false }: { following?: boolean }) {
  return (
    <section className="flex h-full snap-start items-center justify-center p-4" aria-label="Belum ada Shorts">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-orange-400/20">
          <Clapperboard className="h-7 w-7 text-rose-500" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold">
          {following ? "Belum ada video dari yang kamu ikuti" : "Belum ada Shorts"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {following
            ? "Ikuti lebih banyak akun di Jelajahi agar videonya muncul di sini."
            : "Bagikan video pendek pertamamu!"}
        </p>
        <a href={following ? "#/explore" : "#/create"} className="mt-1">
          <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
            {following ? "Jelajahi akun" : "Buat Short"}
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
        <div className="flex items-center gap-1.5">
          <EmojiPickerButton onPick={(emoji) => setText((t) => (t ?? "") + emoji)} />
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

function ShortItem({
  post,
  me,
  onNeedLogin,
  nextMedia,
  followStatus,
  onToggleFollow,
}: {
  post: Post;
  me: Me | null;
  onNeedLogin: () => void;
  nextMedia?: string | null;
  followStatus?: FollowStatus;
  onToggleFollow: (username: string) => void;
}) {
  const like = useLike(onNeedLogin);
  const save = useSave(onNeedLogin);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // Preferensi bisu GLOBAL (persist) — konsisten di semua Short seperti TikTok.
  const muted = useShortsSound((s) => s.muted);
  // Tanda "autoplay bersuara diblokir browser" hanya untuk Short yang terkena.
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [visible, setVisible] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  // Durasi video (state, bukan ref — agar aman dipakai saat render)
  const [videoDuration, setVideoDuration] = useState(0);
  // Waktu target saat menggeser bar progres (null = tidak menggeser)
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const heartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubFracRef = useRef(0);

  // Autoplay hanya saat Short terlihat >60%. SETIAP KALI Short menjadi aktif
  // (masuk / dimasuki lagi), video SELALU DIRESET ke awal — perilaku TikTok:
  // menonton ulang short selalu mulai dari 0, bukan melanjutkan posisi lama.
  // Video berikutnya juga di-pra-ambil (metadata) supaya swipe mulus.
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
            // Selalu mulai dari awal saat Short jadi aktif (re-watch = dari 0)
            try {
              if (video.currentTime > 0 || !video.paused) {
                video.currentTime = 0;
              }
            } catch {
              /* seek sebelum metadata siap — abaikan */
            }
            setVideoProgress(0);
            // Ikuti preferensi bisu global (bukan lagi dipaksa bersuara —
            // dulu bikin desync: video bunyi tapi ikon masih "bisu")
            video.muted = useShortsSound.getState().muted;
            video
              .play()
              .then(() => {
                setIsPaused(false);
              })
              .catch(() => {
                // Browser memblokir autoplay bersuara -> putar bisu dulu,
                // simpan preferensi global supaya Short berikutnya tak mencoba
                // bersuara lagi, dan tampilkan tanda satu-ketukan.
                video.muted = true;
                useShortsSound.getState().setMuted(true);
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
            // Keluar layar juga reset ke awal — konsisten "lihat lagi = dari awal"
            try {
              video.currentTime = 0;
            } catch {
              /* abaikan */
            }
            setVideoProgress(0);
          }
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [nextMedia]);

  // Sinkronkan status bisu global ke elemen video
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  // Batalkan timer ketuk tunggal & animasi hati saat komponen dilepas
  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
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
    if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
    heartTimerRef.current = setTimeout(() => setHeartBurst(false), 700);
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
    useShortsSound.getState().setMuted(next);
    const video = videoRef.current;
    if (video) video.muted = next;
    if (!next) setSoundBlocked(false); // suara sudah dinyalakan pengguna
  }

  // Geser bar progres: tarik-lepas untuk melompat waktu (dengan gelembung waktu)
  function handleScrubStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const bar = e.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const video = videoRef.current;
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    const applyAt = (clientX: number) => {
      const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      scrubFracRef.current = frac;
      setVideoProgress(frac);
      setScrubTime(frac * duration);
    };
    applyAt(e.clientX);

    const onMove = (ev: PointerEvent) => applyAt(ev.clientX);
    const onUp = () => {
      const v = videoRef.current;
      if (v && Number.isFinite(v.duration) && v.duration > 0) {
        v.currentTime = scrubFracRef.current * v.duration;
      }
      setScrubTime(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onCancel = () => {
      setScrubTime(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
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

  const isAuthorMe = !!me && me.id === post.author.id;
  const followingLabel =
    followStatus === "ACCEPTED" ? "Mengikuti" : followStatus === "PENDING" ? "Diminta" : "Ikuti";
  const fmt = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <section
      ref={sectionRef}
      data-short={post.id}
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
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            setVideoDuration(Number.isFinite(d) && d > 0 ? d : 0);
          }}
          onTimeUpdate={(e) => {
            if (scrubTime !== null) return; // sedang menggeser — progress dikendalikan scrub
            const v = e.currentTarget;
            if (v.duration > 0) setVideoProgress(Math.min(1, v.currentTime / v.duration));
          }}
        />

        {/* Bar progres video — bisa digeser untuk melompat waktu */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-[3] touch-none",
            "flex h-5 items-end justify-center px-0 py-0"
          )}
        >
          {/* Gelembung waktu saat menggeser */}
          {scrubTime !== null && (
            <span
              className="pointer-events-none absolute bottom-4 rounded-full bg-black/80 px-3 py-1 text-xs font-semibold tabular-nums text-white backdrop-blur"
              style={{ left: `calc(${Math.min(Math.max(videoProgress, 0.06), 0.94) * 100}% - 44px)` }}
            >
              {fmt(scrubTime)}{videoDuration > 0 ? ` / ${fmt(videoDuration)}` : ""}
            </span>
          )}
          <div
            role="slider"
            aria-label="Posisi video"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={Math.max(Math.round(videoDuration), 1)}
            aria-valuenow={Math.round(videoProgress * (videoDuration || 0))}
            aria-valuetext={videoDuration > 0 ? `${fmt(scrubTime ?? videoProgress * videoDuration)} dari ${fmt(videoDuration)}` : undefined}
            onPointerDown={handleScrubStart}
            onKeyDown={(e) => {
              const video = videoRef.current;
              if (!video || !Number.isFinite(video.duration)) return;
              if (e.key === "ArrowRight") video.currentTime = Math.min(video.duration, video.currentTime + 5);
              if (e.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 5);
            }}
            className="relative flex h-5 w-full cursor-pointer items-center"
          >
            <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-orange-400"
                style={{ width: `${videoProgress * 100}%` }}
                aria-hidden="true"
              />
            </div>
            <div
              className="absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow ring-2 ring-rose-500/70"
              style={{ left: `${videoProgress * 100}%` }}
              aria-hidden="true"
            />
          </div>
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

        {/* Tombol suara (mengikuti preferensi global; berdenyut bila autoplay bersuara diblokir browser) */}
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

        {/* Info pembuat + caption + tombol ikuti */}
        <div className="absolute bottom-6 left-3 right-16 z-10">
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
            {!isAuthorMe && (
              <button
                type="button"
                onClick={() => onToggleFollow(post.author.username)}
                aria-pressed={followStatus === "ACCEPTED" || followStatus === "PENDING"}
                className={cn(
                  "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  followStatus === "ACCEPTED" || followStatus === "PENDING"
                    ? "bg-white/15 text-white hover:bg-white/25"
                    : "bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                )}
              >
                {followStatus === "ACCEPTED" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {followingLabel}
              </button>
            )}
            <span className="ml-auto shrink-0 text-xs text-white/70 drop-shadow-sm">{timeAgo(post.createdAt)}</span>
          </div>
          {post.caption && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCaptionExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCaptionExpanded((v) => !v);
                }
              }}
              aria-expanded={captionExpanded}
              aria-label={captionExpanded ? "Tutup caption" : "Buka caption lengkap"}
              className={cn(
                "mt-1.5 max-w-full text-left text-sm leading-snug text-white/90 drop-shadow-sm",
                captionExpanded ? "break-words" : "line-clamp-2 break-words"
              )}
            >
              <RichText text={post.caption} light />
            </div>
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
              onClick={() => save.mutate(post.id)}
              aria-pressed={post.savedByMe}
              aria-label={post.savedByMe ? "Batalkan simpan" : "Simpan Short"}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                post.savedByMe
                  ? "bg-gradient-to-r from-rose-500 to-orange-400 shadow-[0_0_18px_rgba(244,63,94,0.35)]"
                  : "bg-black/50 hover:bg-black/70"
              )}
            >
              <Bookmark
                className={cn("h-7 w-7 text-white drop-shadow-md", post.savedByMe && "fill-white")}
                aria-hidden="true"
              />
            </motion.button>
            <span className="text-xs font-semibold drop-shadow-md">Simpan</span>
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

type ShortsFeedMode = "foryou" | "following";

export function ShortsView({ me, onNeedLogin }: { me: Me | null; onNeedLogin: () => void }) {
  const [feedMode, setFeedMode] = useState<ShortsFeedMode>("foryou");
  const query = useInfinitePosts({ feed: feedMode === "foryou" ? "shorts" : "following", limit: 5 });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const follow = useFollow(onNeedLogin);

  // Status ikut untuk penulis Short (optimistik; direkonsiliasi hasil server)
  const [followMap, setFollowMap] = useState<Record<string, FollowStatus>>({});

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  // "Mengikuti" membawa semua jenis post — ambil videonya saja untuk Shorts
  const posts = useMemo(() => {
    const raw = data?.pages.flatMap((p) => p.posts) ?? [];
    return feedMode === "following" ? raw.filter((p) => p.type === "VIDEO") : raw;
  }, [data, feedMode]);

  function toggleFollow(username: string) {
    if (!me) {
      onNeedLogin();
      return;
    }
    const cur = followMap[username] ?? "NONE";
    const optimistic: FollowStatus = cur === "ACCEPTED" || cur === "PENDING" ? "NONE" : "ACCEPTED";
    setFollowMap((m) => ({ ...m, [username]: optimistic }));
    follow.mutate(username, {
      onSuccess: (result) => {
        const next: FollowStatus = result.pending ? "PENDING" : result.following ? "ACCEPTED" : "NONE";
        setFollowMap((m) => ({ ...m, [username]: next }));
      },
      onError: () => setFollowMap((m) => ({ ...m, [username]: cur })),
    });
  }

  // Cari elemen video dari Short yang sedang aktif (terdekat dari tengah viewport)
  function findActiveVideo(): HTMLVideoElement | null {
    const container = containerRef.current;
    if (!container) return null;
    const sections = Array.from(container.querySelectorAll<HTMLElement>("section[data-short]"));
    if (sections.length === 0) return null;
    const mid = container.getBoundingClientRect().top + container.clientHeight / 2;
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best?.querySelector("video") ?? null;
  }

  function scrollToShort(direction: 1 | -1) {
    const container = containerRef.current;
    if (!container) return;
    container.scrollBy({ top: direction * container.clientHeight, behavior: "smooth" });
  }

  // Pintasan keyboard desktop ala TikTok web:
  // ↓/↑ = Short berikutnya/sebelumnya, Spasi = putar/jeda, M = bisu/suara.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollToShort(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollToShort(-1);
      } else if (e.key === " ") {
        e.preventDefault();
        const video = findActiveVideo();
        if (video) {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        }
      } else if (e.key === "m" || e.key === "M") {
        useShortsSound.getState().toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.title = "Shorts · SkelzHub";
  }, []);

  // Ganti tab: kembali ke Short pertama (scroll atas) + reset ikut-map cache lama
  useEffect(() => {
    const container = containerRef.current;
    if (container) container.scrollTo({ top: 0 });
  }, [feedMode]);

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
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[calc(100dvh-118px-env(safe-area-inset-bottom))] w-full snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:h-[calc(100dvh-1px)] md:bg-neutral-950 md:px-4 md:py-4"
      >
        {/* Tab "Untuk kamu / Mengikuti" ala TikTok (sticky di atas) */}
        <div className="sticky top-0 z-30 flex justify-center bg-gradient-to-b from-black/60 to-transparent pt-2 pb-2 md:from-neutral-950/80">
          <div
            role="tablist"
            aria-label="Jenis feed Shorts"
            className="flex items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur"
          >
            {(
              [
                { id: "foryou", label: "Untuk kamu" },
                { id: "following", label: "Mengikuti" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={feedMode === tab.id}
                onClick={() => setFeedMode(tab.id)}
                className={cn(
                  "relative rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  feedMode === tab.id ? "text-white" : "text-white/60 hover:text-white/90"
                )}
              >
                {feedMode === tab.id && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-rose-500/90 to-orange-400/90"
                  />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

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

        {!isLoading && !isError && posts.length === 0 && <ShortsEmpty following={feedMode === "following"} />}

        {posts.map((post, i) => (
          <ShortItem
            key={post.id}
            post={post}
            me={me}
            onNeedLogin={onNeedLogin}
            nextMedia={posts[i + 1]?.media}
            followStatus={followMap[post.author.username]}
            onToggleFollow={toggleFollow}
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

      {/* Panah navigasi desktop ala TikTok web */}
      <div className="absolute right-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-3 md:flex">
        <button
          type="button"
          onClick={() => scrollToShort(-1)}
          aria-label="Short sebelumnya"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ChevronUp className="h-6 w-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollToShort(1)}
          aria-label="Short berikutnya"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ChevronDown className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
