"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Heart, Bookmark, MoreHorizontal, MessageCircle, Trash2, Loader2, Link2, Flag, CornerDownRight, X, Share2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Me, Comment } from "@/lib/types";
import { usePost, useComments, useLike, useSave, useAddComment, useDeleteComment, useDeletePost, useReportPost, useEditPost } from "../hooks";
import { UserAvatarLink } from "../user-avatar";
import { AdminBadge } from "../admin-badge";
import { formatCount, timeAgo, mediaThumb } from "../utils";
import { goBack } from "../router";

type ReplyTarget = { parentId: string; topId: string; username: string; displayName: string };

type PostsCacheShape = { pages: { posts: import("@/lib/types").Post[] }[] } | undefined;

function CommentRow({
  comment,
  canDelete,
  isReply,
  onReply,
  onDelete,
}: {
  comment: Comment;
  canDelete: boolean;
  isReply?: boolean;
  onReply: (target: ReplyTarget) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={cn("group flex items-start gap-2.5", isReply ? "py-1.5" : "py-2")}>
      <UserAvatarLink
        name={comment.author.displayName}
        color={comment.author.avatarColor}
        avatar={comment.author.avatar}
        username={comment.author.username}
        size={isReply ? 26 : 34}
      />
      <div className="min-w-0 flex-1">
        {/* Baris nama: nama tampil + @username + badge — rapi dalam satu baris */}
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm leading-snug break-words">
          <a href={`#/u/${encodeURIComponent(comment.author.username)}`} className="font-semibold hover:underline">
            {comment.author.displayName}
          </a>
          {(comment.author.role === "ADMIN" || comment.author.role === "OWNER") && <AdminBadge role={comment.author.role} />}
          <span className="truncate text-xs font-normal text-muted-foreground">@{comment.author.username}</span>
        </p>
        {/* Balasan: chip kecil "membalas @user" di baris sendiri */}
        {isReply && comment.replyTo && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CornerDownRight className="h-3 w-3 shrink-0 text-rose-500/80" aria-hidden="true" />
            <span className="shrink-0">membalas</span>
            <a href={`#/u/${encodeURIComponent(comment.replyTo.username)}`} className="font-medium text-rose-600 hover:underline">
              @{comment.replyTo.username}
            </a>
          </p>
        )}
        <p className="mt-0.5 text-sm leading-snug break-words text-foreground/90">{comment.text}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{timeAgo(comment.createdAt)}</span>
          <button
            type="button"
            className="font-semibold text-foreground/70 transition-colors hover:text-rose-500"
            onClick={() =>
              onReply({
                parentId: comment.parentId ?? comment.id,
                topId: comment.parentId ?? comment.id,
                username: comment.author.username,
                displayName: comment.author.displayName,
              })
            }
          >
            Balas
          </button>
        </div>
      </div>
      {canDelete && (
        <button
          onClick={() => onDelete(comment.id)}
          className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
          aria-label="Hapus komentar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function PostDetailView({ id, me, onNeedLogin }: { id: string; me: Me | null; onNeedLogin: () => void }) {
  const qc = useQueryClient();
  const postQuery = usePost(id);
  const commentsQuery = useComments(id);
  const like = useLike(onNeedLogin);
  const save = useSave(onNeedLogin);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment(id);
  const deletePost = useDeletePost();
  const reportPost = useReportPost();
  const editPost = useEditPost();

  const [text, setText] = useState("");
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // BENIH CACHE: pakai data post dari cache feed/explore/profil supaya
  // post terbuka INSTAN (gambar pun sudah di cache browser immutable).
  // Server hanya menyegarkan data di belakang layar bila sudah basi.
  useEffect(() => {
    const queries = qc.getQueriesData<PostsCacheShape>({ queryKey: ["posts"] });
    for (const [, data] of queries) {
      if (!data?.pages) continue;
      for (const page of data.pages) {
        const found = page.posts.find((p) => p.id === id);
        if (found) {
          qc.setQueryData(["post", id], (old) => old ?? { post: found });
          return;
        }
      }
    }
  }, [id, qc]);

  const post = postQuery.data?.post;
  const comments = commentsQuery.data?.pages.flatMap((p) => p.comments) ?? [];
  const isMine = !!me && !!post && me.id === post.author.id;
  const isAdmin = me?.role === "ADMIN" || me?.role === "OWNER";
  const isVideo = post?.type === "VIDEO";

  // Susun thread: komentar utama (terbaru dulu) + balasannya (terlama dulu)
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

  useEffect(() => {
    document.title = post ? `Post oleh @${post.author.username} · SkelzHub` : "Post · SkelzHub";
  }, [post]);

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (!me) {
      onNeedLogin();
      return;
    }
    setText("");
    addComment.mutate({ postId: id, text: value, parentId: reply?.parentId });
    setReply(null);
  }

  function startReply(target: ReplyTarget) {
    setReply(target);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function copyLink() {
    if (!post) return;
    const url = `${window.location.origin}${window.location.pathname}#/post/${post.id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: "Link post disalin" }),
      () => toast({ title: "Tidak bisa menyalin link" })
    );
  }

  // Bagikan lewat lembar berbagi bawaan perangkat; kalau tidak tersedia
  // (mis. di komputer lama) -> salin link sebagai gantinya.
  async function sharePost() {
    if (!post) return;
    const url = `${window.location.origin}${window.location.pathname}#/post/${post.id}`;
    const text = (post.caption || `Post oleh @${post.author.username}`).slice(0, 200);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "SkelzHub", text, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // lembar dibatalkan
      }
    }
    copyLink();
  }

  function openEdit() {
    if (!post) return;
    setEditText(post.caption ?? "");
    setEditOpen(true);
  }

  function submitEdit() {
    const caption = editText.trim();
    if (!post) return;
    if (post.repostOf && !caption) return; // kutip repost wajib ada teks
    setEditOpen(false);
    editPost.mutate({ postId: post.id, caption });
  }

  function submitReport() {
    const reason = reportReason.trim();
    if (!reason) {
      toast({ title: "Tulis alasan laporan dulu" });
      return;
    }
    setReportOpen(false);
    reportPost.mutate({ postId: id, reason }, { onSuccess: () => setReportReason("") });
  }

  if (postQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-2 py-4 sm:px-4 sm:py-6">
        <Skeleton className="mb-4 h-9 w-9 rounded-full" />
        <div className="overflow-hidden rounded-xl border">
          <Skeleton className="aspect-square w-full rounded-none sm:aspect-[4/3]" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <p className="text-2xl">🤔</p>
        <h1 className="text-lg font-bold">Post tidak ditemukan</h1>
        <p className="text-sm text-muted-foreground">Post ini mungkin sudah dihapus.</p>
        <Button variant="outline" onClick={() => goBack()}>
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-2 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <Button variant="ghost" size="icon" onClick={() => goBack()} aria-label="Kembali" className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>

      <article className="overflow-hidden rounded-xl border bg-card shadow-sm md:flex">
        {/* Media */}
        <div
          className="relative select-none bg-black md:w-[58%]"
          onDoubleClick={() => !post.likedByMe && like.mutate(post.id)}
        >
          {isVideo ? (
            <video
              src={post.media ?? undefined}
              controls
              loop
              playsInline
              preload="metadata"
              className="aspect-square w-full bg-black object-contain md:aspect-auto md:h-full md:min-h-[560px]"
              aria-label={`Video oleh ${post.author.username}`}
            />
          ) : (
            <img
              src={mediaThumb(post.media, 1440) ?? undefined}
              alt={`Post oleh ${post.author.username}`}
              className="aspect-square w-full bg-muted object-cover md:aspect-auto md:h-full md:min-h-[560px]"
              draggable={false}
            />
          )}
        </div>

        {/* Panel kanan */}
        <div className="flex min-w-0 flex-1 flex-col md:w-[42%]">
          {/* Header */}
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <UserAvatarLink name={post.author.displayName} color={post.author.avatarColor} avatar={post.author.avatar} username={post.author.username} size={38} ring />
            <div className="min-w-0 flex-1 leading-tight">
              <a href={`#/u/${encodeURIComponent(post.author.username)}`} className="flex items-center gap-1.5 truncate text-sm font-semibold hover:underline">
                {post.author.displayName}
                {(post.author.role === "ADMIN" || post.author.role === "OWNER") && <AdminBadge role={post.author.role} />}
              </a>
              <p className="text-xs text-muted-foreground">
                @{post.author.username} · {timeAgo(post.createdAt)}
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
                  <Link2 className="h-4 w-4" /> Salin link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void sharePost()}>
                  <Share2 className="h-4 w-4" /> Bagikan
                </DropdownMenuItem>
                {isMine && (
                  <DropdownMenuItem onClick={openEdit}>
                    <Pencil className="h-4 w-4" /> Edit post
                  </DropdownMenuItem>
                )}
                {me && !isMine && (
                  <DropdownMenuItem onClick={() => setReportOpen(true)}>
                    <Flag className="h-4 w-4" /> Laporkan post
                  </DropdownMenuItem>
                )}
                {(isMine || isAdmin) && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      deletePost.mutate(post.id);
                      goBack();
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Hapus post{isAdmin && !isMine ? " (admin)" : ""}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Caption + komentar */}
          <div className="flex-1 overflow-y-auto px-4 py-3 md:max-h-[440px]">
            {post.caption && (
              <div className="border-b pb-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  <a href={`#/u/${encodeURIComponent(post.author.username)}`} className="font-semibold hover:underline">
                    {post.author.username}
                  </a>{" "}
                  {post.caption}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{timeAgo(post.createdAt)}</p>
              </div>
            )}
            {commentsQuery.isLoading ? (
              <div className="space-y-4 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-10 text-center">
                <p className="text-lg">💬</p>
                <p className="text-sm font-semibold">Belum ada komentar</p>
                <p className="text-xs text-muted-foreground">Jadilah yang pertama berkomentar!</p>
              </div>
            ) : (
            <ul className="space-y-1">
              {threads.map(({ top, replies }) => (
                <li key={top.id}>
                  <CommentRow
                    comment={top}
                    canDelete={!!me && (top.author.id === me.id || isMine || isAdmin)}
                    onReply={startReply}
                    onDelete={(cid) => deleteComment.mutate(cid)}
                  />
                  {/* Balasan: garis penghubung + indentasi rapi di bawah komentarnya */}
                  {replies.length > 0 && (
                    <div className="ml-10 mt-0.5 border-l-2 border-muted pl-3 sm:ml-12">
                      {replies.map((r) => (
                        <CommentRow
                          key={r.id}
                          comment={r}
                          isReply
                          canDelete={!!me && (r.author.id === me.id || isMine || isAdmin)}
                          onReply={startReply}
                          onDelete={(cid) => deleteComment.mutate(cid)}
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
                className="mx-auto mt-3 block text-sm text-muted-foreground hover:underline"
                onClick={() => commentsQuery.fetchNextPage()}
              >
                {commentsQuery.isFetchingNextPage ? "Memuat..." : "Muat komentar lainnya"}
              </button>
            )}
          </div>

          {/* Aksi */}
          <div className="border-t px-3 py-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => like.mutate(post.id)}
                aria-pressed={post.likedByMe}
                aria-label={post.likedByMe ? "Batalkan suka" : "Sukai post"}
              >
                <Heart className={cn("h-6 w-6", post.likedByMe && "fill-rose-500 text-rose-500")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => inputRef.current?.focus()}
                aria-label="Fokus ke input komentar"
              >
                <MessageCircle className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => save.mutate(post.id)}
                aria-pressed={post.savedByMe}
                aria-label={post.savedByMe ? "Batalkan simpan" : "Simpan post"}
              >
                <Bookmark className={cn("h-6 w-6", post.savedByMe && "fill-foreground")} />
              </Button>
              <p className="ml-auto pr-2 text-sm font-semibold">{formatCount(post.likeCount)} suka</p>
            </div>
            <form onSubmit={submitComment} className="flex flex-col gap-1.5 py-1">
              {reply && (
                <div className="flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1.5 text-xs text-muted-foreground animate-fade-in">
                  <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    Membalas <span className="font-semibold text-foreground">@{reply.username}</span>
                  </span>
                  <button
                    type="button"
                    className="rounded-full p-1 transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => setReply(null)}
                    aria-label="Batal balas"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={reply ? `Balas @${reply.username}...` : me ? "Tambahkan komentar..." : "Login untuk berkomentar"}
                  className="h-10 flex-1 rounded-full border-none bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring"
                  maxLength={500}
                  aria-label="Tulis komentar"
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={!text.trim() || addComment.isPending}
                  className="h-10 shrink-0 px-4 font-semibold text-rose-500 hover:text-rose-600"
                >
                  {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kirim"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </article>

      {/* Dialog edit caption post (tanpa hapus + posting ulang) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit post</DialogTitle>
            <DialogDescription>Ubah teks caption post ini — tidak perlu hapus lalu posting ulang.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Tulis caption..."
              className="min-h-[110px] resize-none"
              maxLength={2200}
              aria-label="Edit caption post"
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{editText.length}/2200</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={editPost.isPending}>
              Batal
            </Button>
            <Button
              onClick={submitEdit}
              disabled={editPost.isPending || (post?.repostOf ? !editText.trim() : false)}
              className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
            >
              Simpan perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog laporan */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Laporkan post ini</DialogTitle>
            <DialogDescription>
              Ceritakan apa masalahnya — laporanmu akan ditinjau oleh admin SkelzHub.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Contoh: konten tidak pantas, spam, penyalahgunaan, dsb."
              className="min-h-[90px] resize-none"
              maxLength={300}
              aria-label="Alasan laporan"
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{reportReason.length}/300</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={reportPost.isPending}>
              Batal
            </Button>
            <Button
              onClick={submitReport}
              disabled={!reportReason.trim() || reportPost.isPending}
              className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
            >
              Kirim laporan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
