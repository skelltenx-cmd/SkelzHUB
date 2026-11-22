"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Camera,
  Check,
  CheckCheck,
  Download,
  ImageIcon,
  Loader2,
  MessageCircle,
  Mic,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Reply,
  Search,
  Send,
  SmilePlus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { api, uploadCaps } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import type { Me, ConversationItem, ChatMessage, ChatPresence, MessageKind, MessageQuote } from "@/lib/types";
import {
  useConversations,
  useMessages,
  useReactMessage,
  useSendMessage,
  useSendMessageMedia,
  useStartConversation,
  useSearchUsers,
  useEditMessage,
  useDeleteMessage,
} from "../hooks";
import { UserAvatarLink, UserAvatarStory } from "../user-avatar";
import { AdminBadge } from "../admin-badge";
import { timeAgo, compressImageForChat, fileToPreviewUrl, mediaThumb } from "../utils";
import { CameraCaptureDialog } from "../camera-capture";

// ---------- Helpers ----------

function kindLabel(kind: MessageKind | null | undefined, t: ReturnType<typeof useT>): string {
  if (kind === "IMAGE") return t("dm.photoMsg");
  if (kind === "VIDEO") return t("dm.videoMsg");
  if (kind === "VOICE") return t("dm.voiceMsg");
  return "";
}

/** Cuplikan satu baris dari pesan untuk kutipan balasan / chip balas. */
function messageSnippet(m: ChatMessage, t: ReturnType<typeof useT>): string {
  if (m.deleted) return t("dm.deletedMsg");
  const text = m.text?.trim();
  if (text) return text;
  return kindLabel(m.kind, t) || t("dm.startChat");
}

function presenceText(p: { online: boolean; lastSeenAt: string | null; typing: boolean } | null | undefined, t: ReturnType<typeof useT>): string {
  if (!p) return "";
  if (p.typing) return t("dm.typing");
  if (p.online) return t("dm.online");
  if (p.lastSeenAt) return t("dm.lastSeen", { t: timeAgo(p.lastSeenAt) });
  return t("dm.offline");
}

/** Label pemisah hari (Hari ini / Kemarin / tanggal) */
function dayLabel(iso: string, t: ReturnType<typeof useT>): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = d.getTime();
  if (time >= startOfToday) return t("dm.today");
  if (time >= startOfToday - 86_400_000) return t("dm.yesterday");
  try {
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Deteksi jenis file galeri: MIME utama; sebagian HP Android mengirim file
 *  tanpa MIME -> deteksi lewat ekstensi supaya video tetap bisa dikirim. */
function detectGalleryKind(f: File): "IMAGE" | "VIDEO" | null {
  if (f.type.startsWith("image/")) return "IMAGE";
  if (f.type.startsWith("video/")) return "VIDEO";
  if (!f.type || f.type === "application/octet-stream") {
    if (/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name)) return "IMAGE";
    if (/\.(mp4|m4v|webm|mov|mkv|3gp|3gpp|avi)$/i.test(f.name)) return "VIDEO";
  }
  return null;
}

/** Emoji reaksi yang diizinkan server (urutan tampil di pemilih reaksi). */
const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

// ---------- Pemutar pesan suara ----------

function VoiceBubble({ src, mine }: { src: string; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = new Audio(src);
    audioRef.current = a;
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      a.pause();
      audioRef.current = null;
    };
  }, [src]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => null);
    }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90",
          mine ? "bg-white/20 text-white" : "bg-rose-500/10 text-rose-500"
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>
      <div className="flex h-9 items-end gap-[3px]">
        {/* Bar "gelombang" statis dengan progres terisi */}
        {Array.from({ length: 22 }).map((_, i) => {
          const h = 20 + Math.abs(Math.sin(i * 1.7)) * 70;
          const filled = progress * 22 > i;
          return (
            <span
              key={i}
              className={cn("w-[3px] rounded-full transition-colors", mine ? (filled ? "bg-white" : "bg-white/40") : filled ? "bg-rose-500" : "bg-rose-500/30")}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <span className={cn("shrink-0 text-[11px] tabular-nums", mine ? "text-white/80" : "text-muted-foreground")}>
        {fmt(duration || 0)}
      </span>
    </div>
  );
}

// ---------- Pratinjau foto layar penuh ----------

/** Lightbox foto: layar penuh hitam, tutup lewat tombol X / klik latar /
 *  tombol Esc, unduh lewat fetch blob (fallback: buka tab baru), waktu
 *  pesan tampil kecil di bawah. Tombol besar supaya nyaman disentuh. */
function PhotoLightbox({ src, createdAt, onClose }: { src: string; createdAt: string; onClose: () => void }) {
  const t = useT();
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  let timeLabel = createdAt;
  try {
    timeLabel = new Date(createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    timeLabel = createdAt;
  }

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "foto.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      // Gagal mem-fetch (mis. CORS) -> buka di tab baru sebagai cadangan
      window.open(src, "_blank", "noopener");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black animate-fade-in" role="dialog" aria-modal="true" aria-label={t("dm.closePreview")}>
      <div className="flex items-center justify-end p-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/25 active:scale-95"
          aria-label={t("dm.closePreview")}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3" onClick={onClose}>
        <img
          src={src}
          alt={t("dm.photoMsg")}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-3" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        <span className="min-w-0 truncate text-xs text-white/70">{timeLabel}</span>
        <button
          type="button"
          onClick={download}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25 active:scale-95"
          aria-label={t("dm.download")}
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t("dm.download")}
        </button>
      </div>
    </div>
  );
}

// ---------- Kutipan balasan + pil reaksi ----------

/** Blok kutipan kecil di atas isi bubble untuk pesan yang merupakan balasan. */
function ReplyQuote({
  q,
  variant,
  className,
}: {
  q: MessageQuote;
  /** gradient = bubble gradient milikku; card = permukaan kartu/bubble lawan; dark = kartu video */
  variant: "gradient" | "card" | "dark";
  className?: string;
}) {
  const t = useT();
  const snippet = q.deleted
    ? t("dm.deletedMsg")
    : q.text && q.text.trim().length > 0
      ? q.text
      : kindLabel(q.kind, t);
  return (
    <div
      className={cn(
        "max-w-full rounded-lg border-l-2 px-2.5 py-1.5 text-xs",
        variant === "gradient" ? "border-white/70 bg-white/10" : "border-rose-500",
        variant === "card" && "bg-black/5",
        variant === "dark" && "bg-card",
        className
      )}
    >
      <p className={cn("font-bold", variant === "gradient" ? "text-white" : "text-rose-500")}>
        {q.senderMine ? t("dm.you") : q.senderName}
      </p>
      <p
        className={cn(
          "line-clamp-2 break-words",
          q.deleted && "italic",
          variant === "gradient" ? "text-white/80" : "text-muted-foreground"
        )}
      >
        {snippet}
      </p>
    </div>
  );
}

/** Pil reaksi di bawah bubble: emoji + jumlah; pil milikku di-highlight,
 *  klik pil = toggle reaksi milikku pada emoji itu. */
function ReactionRow({ m, onReact }: { m: ChatMessage; onReact?: (messageId: string, emoji: string | null) => void }) {
  const list = m.reactions ?? [];
  if (list.length === 0 || !onReact) return null;
  return (
    <div className={cn("flex max-w-[78%] flex-wrap gap-1", m.mine ? "justify-end" : "justify-start")}>
      {list.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onReact(m.id, r.emoji)}
          className={cn(
            "flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition-transform active:scale-90",
            r.mine
              ? "border-rose-500 bg-rose-500/15 text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent"
          )}
          aria-label={`${r.emoji} ${r.count}`}
          aria-pressed={r.mine}
        >
          <span className="text-sm leading-none" aria-hidden="true">{r.emoji}</span>
          {r.count > 1 && <span className="font-semibold tabular-nums">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Bubble pesan ----------

function Bubble({
  m,
  showTime,
  onEdit,
  onDelete,
  onReply,
  onReact,
  editBusy,
  deleteBusy,
}: {
  m: ChatMessage;
  showTime: boolean;
  onEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (m: ChatMessage) => void;
  onReact?: (messageId: string, emoji: string | null) => void;
  editBusy?: boolean;
  deleteBusy?: boolean;
}) {
  const t = useT();
  const [lightbox, setLightbox] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);

  function startEditing() {
    setDraft(m.text);
    setEditing(true);
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || !onEdit || editBusy) return;
    setEditing(false);
    onEdit(m.id, value);
  }

  // ---- Placeholder pesan dihapus (soft delete) ----
  if (m.deleted) {
    return (
      <div className={cn("flex w-full", m.mine ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "animate-msg-in flex max-w-[78%] items-center gap-1.5 rounded-2xl border border-dashed px-3.5 py-2 text-sm italic shadow-sm",
            m.mine ? "rounded-br-md bg-rose-500/10 text-rose-400" : "rounded-bl-md bg-muted/50 text-muted-foreground"
          )}
        >
          <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words">{t("dm.deletedMsg")}</span>
        </div>
      </div>
    );
  }

  // ---- Menu pesan: Balas + Reaksi (semua pesan), Edit (teks milikku),
  //      Hapus (semua jenis milikku) ----
  const canReply = !!onReply;
  const canReact = !!onReact;
  const canEdit = !!onEdit && m.mine && m.kind === "TEXT";
  const canDelete = !!onDelete && m.mine;
  const menu =
    !m.pending &&
    (canReply || canReact || canEdit || canDelete) &&
    (() => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8 md:w-8"
            aria-label={t("dm.msgMenu")}
            disabled={deleteBusy}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={m.mine ? "end" : "start"} className="min-w-44">
          {canReply && (
            <DropdownMenuItem onClick={() => onReply(m)}>
              <Reply className="h-4 w-4" /> {t("dm.reply")}
            </DropdownMenuItem>
          )}
          {canReact && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger aria-label={t("dm.react")}>
                <SmilePlus className="h-4 w-4" /> {t("dm.react")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="p-1.5">
                <div className="flex gap-0.5" role="group" aria-label={t("dm.react")}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <DropdownMenuItem
                      key={emoji}
                      onSelect={() => onReact(m.id, emoji)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg px-0 text-xl focus:bg-accent"
                      aria-label={`${t("dm.react")} ${emoji}`}
                    >
                      {emoji}
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {(canReply || canReact) && (canEdit || canDelete) && <DropdownMenuSeparator />}
          {canEdit && (
            <DropdownMenuItem onClick={startEditing}>
              <Pencil className="h-4 w-4" /> {t("dm.editMsg")}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(m.id)}>
              <Trash2 className="h-4 w-4" /> {t("dm.deleteMsg")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ))();

  // ---- Kerangka pesan: baris (menu + bubble) lalu pil reaksi di bawahnya ----
  function shell(content: React.ReactNode) {
    return (
      <div className={cn("flex w-full flex-col gap-1", m.mine ? "items-end" : "items-start")}>
        <div className={cn("flex w-full items-center gap-1", m.mine ? "justify-end" : "justify-start")}>
          {m.mine ? menu : null}
          {content}
          {m.mine ? null : menu}
        </div>
        <ReactionRow m={m} onReact={onReact} />
      </div>
    );
  }

  // ---- Tanda waktu + "Diedit" + tanda terkirim/dibaca ----
  const meta = showTime && (
    <span className={cn("flex items-center justify-end gap-1 text-[10px]", m.mine ? "text-white/70" : "text-muted-foreground")}>
      {m.editedAt && <span className="italic">{t("dm.editedLabel")}</span>}
      {m.mine && <Receipt m={m} />}
      {timeAgo(m.createdAt)}
    </span>
  );

  // ---- Foto (dengan keterangan di bawahnya) ----
  if (m.kind === "IMAGE" && m.media) {
    const captionText = m.text?.trim() ?? "";
    return (
      <>
        {shell(
          <div
            className={cn(
              "animate-msg-in max-w-[78%] overflow-hidden rounded-2xl border bg-card shadow-sm",
              m.mine ? "rounded-br-md" : "rounded-bl-md"
            )}
          >
            {m.replyTo && (
              <div className="px-2 pt-2">
                <ReplyQuote q={m.replyTo} variant="card" />
              </div>
            )}
            <button type="button" onClick={() => setLightbox(true)} className="block w-full" aria-label={captionText || t("dm.photoMsg")}>
              <img src={mediaThumb(m.media, 720) ?? undefined} alt={captionText || t("dm.photoMsg")} className="max-h-72 w-full object-cover" loading="lazy" decoding="async" />
            </button>
            {captionText && (
              <p className="whitespace-pre-wrap break-words px-3 pt-2 text-sm leading-snug">{captionText}</p>
            )}
            {showTime && (
              <div className={cn("mt-1 flex items-center justify-end gap-1 px-2.5 py-1", m.mine ? "bg-gradient-to-r from-rose-500 to-orange-400 text-white" : "bg-card")}>
                {m.mine && <Receipt m={m} />}
                <span className={cn("text-[10px]", m.mine ? "text-white/70" : "text-muted-foreground")}>{timeAgo(m.createdAt)}</span>
              </div>
            )}
          </div>
        )}
        {lightbox && <PhotoLightbox src={m.media} createdAt={m.createdAt} onClose={() => setLightbox(false)} />}
      </>
    );
  }

  // ---- Video (dengan keterangan di bawahnya) ----
  if (m.kind === "VIDEO" && m.media) {
    const captionText = m.text?.trim() ?? "";
    return shell(
      <div className={cn("animate-msg-in max-w-[78%] overflow-hidden rounded-2xl border bg-black shadow-sm", m.mine ? "rounded-br-md" : "rounded-bl-md")}>
        {m.replyTo && (
          <div className="px-2 pt-2">
            <ReplyQuote q={m.replyTo} variant="dark" />
          </div>
        )}
        <video src={m.media} controls playsInline preload="metadata" className="max-h-72 w-full" aria-label={captionText || t("dm.videoMsg")} />
        {captionText && <p className="whitespace-pre-wrap break-words bg-card px-3 py-2 text-sm leading-snug">{captionText}</p>}
        {showTime && (
          <div className={cn("mt-1 flex items-center justify-end gap-1 px-2.5 py-1", m.mine ? "bg-gradient-to-r from-rose-500 to-orange-400 text-white" : "bg-card")}>
            {m.mine && <Receipt m={m} />}
            <span className={cn("text-[10px]", m.mine ? "text-white/70" : "text-muted-foreground")}>{timeAgo(m.createdAt)}</span>
          </div>
        )}
      </div>
    );
  }

  // ---- Pesan suara ----
  if (m.kind === "VOICE" && m.media) {
    return shell(
      <div
        className={cn(
          "animate-msg-in max-w-[78%] rounded-2xl px-3 py-2 shadow-sm",
          m.mine ? "rounded-br-md bg-gradient-to-r from-rose-500 to-orange-400 text-white" : "rounded-bl-md border bg-card"
        )}
      >
        {m.replyTo && <ReplyQuote q={m.replyTo} variant={m.mine ? "gradient" : "card"} className="mb-1.5" />}
        <VoiceBubble src={m.media} mine={m.mine} />
        {showTime && meta}
      </div>
    );
  }

  // ---- Teks (dengan mode edit inline) ----
  return shell(
    <div
      className={cn(
        "animate-msg-in max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-snug whitespace-pre-wrap break-words shadow-sm",
        m.mine
          ? "bg-gradient-to-r from-rose-500 to-orange-400 text-white"
          : "border bg-card"
      )}
    >
      {editing ? (
        <form onSubmit={saveEdit} className="flex min-w-48 flex-col gap-2 sm:min-w-64" aria-label={t("dm.editMsg")}>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            autoFocus
            placeholder={t("dm.editingPlaceholder")}
            aria-label={t("dm.editingPlaceholder")}
            className={cn("min-h-16 resize-none border-none bg-transparent p-0 text-sm focus-visible:ring-0", m.mine ? "text-white placeholder:text-white/60" : "")}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn("h-7 rounded-full px-3 text-xs", m.mine ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-muted-foreground")}
              onClick={() => setEditing(false)}
              disabled={editBusy}
            >
              {t("c.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7 rounded-full bg-white/20 px-3 text-xs font-semibold text-white hover:bg-white/30"
              disabled={!draft.trim() || editBusy}
            >
              {editBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t("dm.saveEdit")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {m.replyTo && <ReplyQuote q={m.replyTo} variant={m.mine ? "gradient" : "card"} className="mb-1.5" />}
          {m.text}
          {showTime && meta}
        </>
      )}
    </div>
  );
}

function Receipt({ m }: { m: ChatMessage }) {
  if (m.pending) return <Loader2 className="h-3 w-3 animate-spin opacity-70" aria-label="mengirim" />;
  if (m.readAt) return <CheckCheck className="h-3.5 w-3.5 text-sky-200" aria-label="dibaca" />;
  return <Check className="h-3.5 w-3.5 opacity-70" aria-label="terkirim" />;
}

// ---------- Daftar percakapan ----------

function ConversationRow({
  c,
  t,
  active,
}: {
  c: ConversationItem;
  t: ReturnType<typeof useT>;
  active?: boolean;
}) {
  const preview =
    c.lastMessageDeleted
      ? t("dm.deletedMsg")
      : c.lastMessage !== null && c.lastMessage !== ""
        ? `${c.lastMessageMine ? `${t("dm.you")}: ` : ""}${c.lastMessage}`
        : c.lastMessageKind
          ? `${c.lastMessageMine ? `${t("dm.you")}: ` : ""}${kindLabel(c.lastMessageKind, t)}`
          : t("dm.startChat");
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent",
        active && "bg-rose-500/10 ring-1 ring-rose-500/30",
        !active && c.unread > 0 && "bg-rose-500/5"
      )}
    >
      {/* Avatar terpisah dari link chat: klik membuka story kalau ada;
          tanpa story avatar polos supaya baris tetap fokus ke chat. */}
      <UserAvatarStory
        name={c.user.displayName}
        color={c.user.avatarColor}
        avatar={c.user.avatar}
        size={48}
        username={c.user.username}
        online={c.user.online}
      />
      <a
        href={`#/chat/${c.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
        aria-current={active ? "page" : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("flex items-center gap-1.5 truncate text-sm", c.unread > 0 ? "font-bold" : "font-semibold")}>
              {c.user.displayName}
              {(c.user.role === "ADMIN" || c.user.role === "OWNER") && <AdminBadge role={c.user.role} />}
              <span className="truncate text-xs font-normal text-muted-foreground">@{c.user.username}</span>
            </p>
            {c.lastMessageAt && (
              <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.lastMessageAt)}</span>
            )}
          </div>
          <p className={cn("truncate text-xs", c.unread > 0 ? "text-foreground" : "text-muted-foreground", c.lastMessageDeleted && "italic")}>{preview}</p>
        </div>
        {c.unread > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
            {c.unread > 99 ? "99+" : c.unread}
          </span>
        )}
      </a>
    </li>
  );
}

function NewChatDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const results = useSearchUsers(search.trim().length >= 2 ? search.trim() : "");
  const start = useStartConversation();

  const users = (results.data?.users ?? []).filter((u) => u.username !== me.username);

  // Baris user diklik: dialog ditutup SEGERA (tidak menghalangi layar),
  // lalu percakapan dibuat di belakang dan navigasi begitu siap.
  async function pickUser(u: (typeof users)[number]) {
    onClose();
    try {
      const data = await start.mutateAsync(u.username);
      window.location.hash = `#/chat/${data.conversationId}`;
    } catch {
      // pesan error sudah ditampilkan hook
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center animate-fade-in" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-t-2xl border bg-card p-4 shadow-xl sm:rounded-2xl sm:p-6 animate-slide-up sm:animate-pop-in">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{t("dm.newChat")}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label={t("c.cancel")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("dm.searchUser")}
          autoFocus
          aria-label={t("dm.searchUser")}
        />
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
          {results.isLoading && search.length >= 2 && (
            <li className="flex items-center gap-3 p-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </li>
          )}
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-accent">
              {/* Klik avatar: buka story kalau ada; kalau tidak -> tutup
                  dialog langsung dan buka profil user itu. */}
              <UserAvatarStory
                name={u.displayName}
                color={u.avatarColor}
                avatar={u.avatar}
                size={40}
                username={u.username}
                onFallback={() => {
                  onClose();
                  window.location.hash = `#/u/${encodeURIComponent(u.username)}`;
                }}
              />
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => pickUser(u)}
                disabled={start.isPending}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {u.displayName}
                    {(u.role === "ADMIN" || u.role === "OWNER") && <AdminBadge role={u.role} />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                </span>
                {start.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </button>
            </li>
          ))}
          {search.length >= 2 && !results.isLoading && users.length === 0 && (
            <li className="p-3 text-center text-sm text-muted-foreground">{t("fl.empty")}</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function ConversationsList({
  me,
  activeId,
  compact,
  search,
}: {
  me: Me | null;
  activeId?: string;
  compact?: boolean;
  search?: string;
}) {
  const t = useT();
  const query = useConversations(!!me, 3_000);
  const conversations = query.data?.conversations ?? [];
  const [newChatOpen, setNewChatOpen] = useState(false);

  // Filter pencarian sisi klien: nama tampil, username, dan cuplikan pesan terakhir
  const q = (search ?? "").trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.user.displayName.toLowerCase().includes(q) ||
        c.user.username.toLowerCase().includes(q) ||
        (c.lastMessage ?? "").toLowerCase().includes(q)
    );
  }, [conversations, q]);

  if (query.isLoading) {
    return (
      <ul className="flex flex-col gap-2">
        {[1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl border p-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-48" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (conversations.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15">
            <MessageCircle className="h-7 w-7 text-rose-500" />
          </span>
          <p className="font-semibold">{t("dm.empty")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{t("dm.emptySub")}</p>
          <div className="flex gap-2">
            <a href="#/explore">
              <Button variant="outline">{t("nav.explore")}</Button>
            </a>
            <Button onClick={() => setNewChatOpen(true)} className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
              <Plus className="h-4 w-4" /> {t("dm.newChat")}
            </Button>
          </div>
        </div>
        {newChatOpen && me && <NewChatDialog me={me} onClose={() => setNewChatOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <ul className={cn("flex flex-col", compact ? "gap-1.5" : "gap-3")}>
        {filtered.map((c) => (
          <ConversationRow key={c.id} c={c} t={t} active={activeId === c.id} />
        ))}
      </ul>
      {q && filtered.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("fl.empty")}</p>
      )}
      {newChatOpen && me && <NewChatDialog me={me} onClose={() => setNewChatOpen(false)} />}
    </>
  );
}

// ---------- Pratinjau lampiran sebelum kirim (konfirmasi dulu, baru terkirim) ----------

type PendingAttachment = { file: File; url: string; kind: "IMAGE" | "VIDEO" };

function AttachmentPreviewDialog({
  pending,
  busy,
  progress,
  onCancel,
  onConfirm,
}: {
  pending: PendingAttachment;
  busy: boolean;
  progress: number;
  onCancel: () => void;
  onConfirm: (caption: string) => void;
}) {
  const t = useT();
  const [caption, setCaption] = useState("");

  const sizeMb = (pending.file.size / (1024 * 1024)).toFixed(pending.file.size > 10 * 1024 * 1024 ? 0 : 1);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-t-2xl border bg-card shadow-2xl animate-slide-up sm:rounded-2xl sm:animate-pop-in">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-base font-bold">{t("dm.previewTitle")}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onCancel} disabled={busy} aria-label={t("c.cancel")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Pratinjau media */}
        <div className="relative flex max-h-[52vh] items-center justify-center overflow-hidden border-y bg-black/5">
          {pending.kind === "VIDEO" ? (
            <video src={pending.url} controls playsInline className="max-h-[52vh] w-full object-contain" />
          ) : (
            <img src={pending.url} alt="Pratinjau lampiran" className="max-h-[52vh] w-full object-contain" />
          )}
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {pending.kind === "VIDEO" ? t("dm.videoMsg") : t("dm.photoMsg")} · {sizeMb}MB
          </span>
        </div>

        <div className="space-y-2.5 p-4">
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t("dm.captionPlaceholder")}
            maxLength={1000}
            disabled={busy}
            aria-label={t("dm.captionPlaceholder")}
            className="rounded-full"
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={onCancel} disabled={busy}>
              {t("c.cancel")}
            </Button>
            <Button
              type="button"
              className="relative flex-1 overflow-hidden rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
              onClick={() => onConfirm(caption.trim())}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {progress < 100 ? `${progress}%` : t("dm.send")}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> {t("dm.sendAttachment")}
                </>
              )}
              {busy && (
                <span className="absolute inset-x-2 bottom-0.5 h-1 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
                  <span className="block h-full bg-white transition-[width] duration-200" style={{ width: `${progress}%` }} />
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Tampilan chat ----------

type VoiceState = { recording: boolean; seconds: number; blob: Blob | null; previewUrl: string | null; sending: boolean };

function ChatView({ conversationId, me }: { conversationId: string; me: Me | null }) {
  const t = useT();
  const qc = useQueryClient();
  const query = useMessages(conversationId, !!me);
  const send = useSendMessage(conversationId);
  const sendMedia = useSendMessageMedia(conversationId);
  const editMessage = useEditMessage(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);
  const reactMessage = useReactMessage(conversationId);
  const [text, setText] = useState("");
  const [other, setOther] = useState<ChatPresence | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingAtt, setPendingAtt] = useState<PendingAttachment | null>(null);
  const [attBusy, setAttBusy] = useState(false);
  const [attProgress, setAttProgress] = useState(0);
  const [voice, setVoice] = useState<VoiceState>({ recording: false, seconds: 0, blob: null, previewUrl: null, sending: false });
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceCancelledRef = useRef(false);
  const typingSentAtRef = useRef(0);
  const nearBottomRef = useRef(true);

  const messages = useMemo(() => query.data?.pages.flatMap((p) => p.messages) ?? [], [query.data]);
  // Cursor sinkronisasi: pesan yang berubah (baru/edit/hapus) punya updatedAt.
  // PENTING: pesan optimistik (pending / id "tmp-") TIDAK ikut dihitung —
  // jam client bisa lebih maju dari server; kalau ikut, cursor melompati
  // pesan lawan yang terjadi di jendela itu dan tidak pernah tampil sampai
  // refresh penuh (inilah salah satu sumber "sinkronisasi pesan delay").
  const lastAt = useMemo(() => {
    let max = "";
    for (const m of messages) {
      if (m.pending) continue; // hanya stempel waktu dari server
      const stamp = m.updatedAt ?? m.createdAt;
      if (stamp > max) max = stamp;
    }
    return max || null;
  }, [messages]);
  const otherFromQuery = query.data?.pages[0]?.other ?? null;

  // Presence awal dari query utama
  useEffect(() => {
    if (otherFromQuery) setOther(otherFromQuery);
  }, [otherFromQuery]);

  // Pindah percakapan -> buang kutipan balasan lama + kembalikan auto-scroll
  useEffect(() => {
    setReplyTarget(null);
    nearBottomRef.current = true;
  }, [conversationId]);

  // Scroll ke bawah saat pesan baru / ganti percakapan (hanya kalau user
  // sedang di dekat bawah — kalau sedang membaca ke atas, jangan menyentak)
  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [conversationId, messages.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  // ---- Polling realtime ringan (2 dtk, pause otomatis saat tab tersembunyi) ----
  // Pesan baru ditempel ke cache react-query; pesan yang DIEDIT/DIHAPUS lawan
  // diperbarui di tempat (patch berdasarkan id) — semuanya instan tanpa refresh.
  const lastAtRef = useRef<string | null>(null);
  useEffect(() => {
    lastAtRef.current = lastAt;
  }, [lastAt]);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    let inFlight = false; // jangan tumpang-tindih request saat jaringan lambat
    type MsgCache = { pages: { messages: ChatMessage[] }[]; pageParams: number[] };
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;
      try {
        const since = lastAtRef.current ?? new Date(Date.now() - 120_000).toISOString();
        const fresh = await api.newMessages(conversationId, since);
        if (!alive) return;
        if (fresh.other) setOther(fresh.other);
        if (fresh.messages.length > 0) {
          let hasNew = false;
          qc.setQueryData<MsgCache>(["messages", conversationId], (old) => {
            if (!old?.pages) return old;
            const known = new Set(old.pages.flatMap((p) => p.messages).map((m) => m.id));
            const adding = fresh.messages.filter((m) => !known.has(m.id) && !m.pending);
            const updates = fresh.messages.filter((m) => known.has(m.id));
            hasNew = adding.length > 0;
            let pages = old.pages;
            if (adding.length > 0) {
              const lastPage = old.pages[old.pages.length - 1];
              const patched = { ...lastPage, messages: [...lastPage.messages, ...adding] };
              pages = [...old.pages.slice(0, -1), patched];
            }
            if (updates.length > 0) {
              const updateMap = new Map(updates.map((m) => [m.id, m]));
              pages = pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) => updateMap.get(m.id) ?? m),
              }));
            }
            return adding.length > 0 || updates.length > 0 ? { ...old, pages } : old;
          });
          // Segarkan ringan daftar percakapan (preview & badge belum-dibaca)
          if (hasNew) qc.invalidateQueries({ queryKey: ["conversations"] });
        }
        if (fresh.mineLastReadAt) {
          // Centang biru: pesanku sudah dibaca lawan
          qc.setQueryData<MsgCache>(["messages", conversationId], (old) => {
            if (!old?.pages) return old;
            let changed = false;
            const pages = old.pages.map((p) => ({
              ...p,
              messages: p.messages.map((m) => {
                if (m.mine && !m.readAt && m.createdAt <= (fresh.mineLastReadAt ?? "")) {
                  changed = true;
                  return { ...m, readAt: fresh.mineLastReadAt ?? null };
                }
                return m;
              }),
            }));
            return changed ? { ...old, pages } : old;
          });
        }
      } catch {
        // diamkan error polling (offline / jeda server)
      } finally {
        inFlight = false;
      }
    };
    tick();
    const timer = setInterval(tick, 2000);
    // Kembali ke tab chat = langsung sinkron sekarang (tanpa menunggu tick berikut)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [conversationId, me, qc]);

  // ---- Typing indicator: kirim "aku sedang mengetik" (throttle 2 dtk) ----
  function onType(e: React.ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);
    const now = Date.now();
    if (now - typingSentAtRef.current > 2000) {
      typingSentAtRef.current = now;
      api.sendTyping(conversationId);
    }
  }

  // ---- Kirim pesan teks (optimistik — tampil seketika) ----
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || send.isPending) return;
    setText("");
    const replyToId = replyTarget && !replyTarget.deleted && !replyTarget.pending ? replyTarget.id : null;
    setReplyTarget(null);
    // Pesan milikku sendiri: SELALU ikut ke bawah walau user sedang
    // membaca pesan lama di atas (pesan orang lain tetap tidak menyentak).
    nearBottomRef.current = true;
    send.mutate({ text: value, replyToId });
  }

  // ---- Edit / hapus pesan sendiri ----
  function handleEdit(messageId: string, newText: string) {
    editMessage.mutate({ messageId, text: newText });
  }

  function handleDelete(messageId: string) {
    deleteMessage.mutate(messageId);
  }

  // ---- Balas pesan (milik siapa pun) & reaksi emoji ----
  function handleReply(m: ChatMessage) {
    if (m.deleted || m.pending) return;
    setReplyTarget(m);
  }

  function handleReact(messageId: string, emoji: string | null) {
    reactMessage.mutate({ messageId, emoji });
  }

  // ---- Pilih foto/video dari galeri -> PRATINJAU dulu, kirim setelah dikonfirmasi ----
  async function pickAttachment(f: File | undefined | null) {
    if (!f) return;
    const kind = detectGalleryKind(f);
    if (!kind) {
      toast({ title: "File tidak didukung", description: "Pilih gambar atau video (MP4/WebM/MOV)" });
      return;
    }
    // Batas ukuran mengikuti jalur aktif: R2 (CDN) = 5GB, database = 200MB/60MB
    const caps = await uploadCaps();
    if (kind === "VIDEO" && f.size > caps.video) {
      toast({
        title: "Video terlalu besar",
        description: caps.r2 ? "Maksimal 5GB per video" : "Maksimal 200MB per video",
      });
      return;
    }
    if (kind === "IMAGE" && f.size > caps.image) {
      toast({
        title: "Gambar terlalu besar",
        description: caps.r2 ? "Maksimal 5GB" : "Maksimal 60MB",
      });
      return;
    }
    setPendingAtt({ file: f, url: fileToPreviewUrl(f), kind });
  }

  // ---- Konfirmasi pratinjau: unggah + kirim (dengan progress) ----
  // Keterangan (caption) dan kutipan balasan ikut terkirim bersama media.
  async function confirmAttachment(caption: string) {
    if (!pendingAtt || attBusy) return;
    setAttBusy(true);
    setAttProgress(0);
    const current = pendingAtt;
    const replyToId = replyTarget && !replyTarget.deleted && !replyTarget.pending ? replyTarget.id : null;
    try {
      let blob: Blob = current.file;
      if (current.kind === "IMAGE") {
        // Chat: preset ringan (1620px) supaya kirim cepat namun tetap tajam
        blob = await compressImageForChat(current.file);
      }
      nearBottomRef.current = true; // pesan milikku: selalu ikut ke bawah
      const uploaded = await api.upload(blob, current.file.name || "lampiran", (pct) => setAttProgress(pct));
      await sendMedia.mutateAsync({ mediaId: uploaded.mediaId, text: caption || undefined, replyToId });
      setReplyTarget(null);
      URL.revokeObjectURL(current.url);
      setPendingAtt(null);
    } catch (err) {
      toast({ title: "Gagal mengirim lampiran", description: (err as Error).message });
    } finally {
      setAttBusy(false);
      setAttProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function cancelAttachment() {
    if (!pendingAtt || attBusy) return;
    URL.revokeObjectURL(pendingAtt.url);
    setPendingAtt(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ---- Kirim hasil jepretan kamera (dialog kamera sudah punya konfirmasi) ----
  async function sendCameraPhoto(blob: Blob) {
    try {
      setAttBusy(true);
      setAttProgress(0);
      setCameraOpen(false);
      // Foto kamera sudah JPEG bagus; kompresi chat tetap dijalankan biar ringan
      const asFile =
        blob instanceof File ? blob : new File([blob], "kamera.jpg", { type: blob.type || "image/jpeg" });
      const out = await compressImageForChat(asFile);
      nearBottomRef.current = true; // pesan milikku: selalu ikut ke bawah
      const uploaded = await api.upload(out, "kamera.jpg", (pct) => setAttProgress(pct));
      await sendMedia.mutateAsync({ mediaId: uploaded.mediaId });
      setReplyTarget(null);
    } catch {
      // toast error dari hook
    } finally {
      setAttBusy(false);
      setAttProgress(0);
    }
  }

  // ---- Rekam pesan suara ----
  async function startRecording() {
    if (voice.recording || voice.blob) return;
    voiceCancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (voiceCancelledRef.current) return; // dibatalkan -> buang hasil
        const blob = new Blob(chunks, { type: mime.split(";")[0] });
        if (blob.size < 512) {
          // terlalu pendek — anggap batal
          setVoice({ recording: false, seconds: 0, blob: null, previewUrl: null, sending: false });
          return;
        }
        setVoice((v) => ({ ...v, recording: false, blob, previewUrl: fileToPreviewUrl(blob) }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setVoice({ recording: true, seconds: 0, blob: null, previewUrl: null, sending: false });
      voiceTimerRef.current = setInterval(() => {
        setVoice((v) => ({ ...v, seconds: v.seconds + 1 }));
      }, 1000);
    } catch {
      setVoice({ recording: false, seconds: 0, blob: null, previewUrl: null, sending: false });
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    voiceTimerRef.current = null;
  }

  function cancelRecording() {
    voiceCancelledRef.current = true;
    if (voice.recording) {
      stopRecording();
    } else if (voice.previewUrl) {
      URL.revokeObjectURL(voice.previewUrl);
    }
    setVoice({ recording: false, seconds: 0, blob: null, previewUrl: null, sending: false });
  }

  async function sendVoice() {
    if (!voice.blob) return;
    try {
      setVoice((v) => ({ ...v, sending: true }));
      nearBottomRef.current = true; // pesan milikku: selalu ikut ke bawah
      const uploaded = await api.upload(voice.blob, "pesan-suara.webm");
      await sendMedia.mutateAsync({ mediaId: uploaded.mediaId });
      setReplyTarget(null);
      if (voice.previewUrl) URL.revokeObjectURL(voice.previewUrl);
      setVoice({ recording: false, seconds: 0, blob: null, previewUrl: null, sending: false });
    } catch {
      setVoice((v) => ({ ...v, sending: false }));
    }
  }

  // Bersihkan rekaman saat keluar chat
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      recorderRef.current?.stop();
    };
  }, []);

  const busy = send.isPending || attBusy || voice.sending;
  const presenceSub = presenceText(other, t);

  // Susun tampilan: pemisah hari + grup pesan beruntun (pengirim sama <4 dtk)
  const rendered = useMemo(() => {
    const out: Array<{ kind: "day"; key: string; label: string } | { kind: "msg"; key: string; m: ChatMessage; showTime: boolean }> = [];
    let prevDay: string | null = null;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const curDay = new Date(m.createdAt).toDateString();
      if (curDay !== prevDay) {
        out.push({ kind: "day", key: `day-${m.id}`, label: dayLabel(m.createdAt, t) });
        prevDay = curDay;
      }
      const next = messages[i + 1];
      const grouped =
        next &&
        next.mine === m.mine &&
        !next.deleted &&
        !m.deleted &&
        new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() < 4 * 60_000;
      out.push({ kind: "msg", key: m.id, m, showTime: !grouped });
    }
    return out;
  }, [messages, t]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <ChatHeader conversationId={conversationId} me={me} presence={other} />
      {/* Area pesan: bingkai kolom penuh + wallpaper titik halus (desktop tidak
          lagi punya ruang kosong di pinggir); daftar pesannya sendiri tetap
          dibatasi max-w-3xl supaya tetap nyaman dibaca di layar lebar. */}
      <div ref={scrollRef} onScroll={handleScroll} className="chat-wallpaper flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-3 py-4">
          {query.isLoading ? (
            <>
              <Skeleton className="h-12 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
              <Skeleton className="h-12 w-3/5 rounded-2xl" />
            </>
          ) : query.hasNextPage ? (
            <div className="pb-2 text-center">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                {query.isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
                {t("dm.loadOlder")}
              </Button>
            </div>
          ) : null}
          {messages.length === 0 && !query.isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15">
                <Zap className="h-7 w-7 text-rose-500" />
              </span>
              <p className="text-sm font-semibold">{t("dm.startChat")}</p>
              <p className="max-w-xs text-xs text-muted-foreground">{t("dm.emptySub")}</p>
            </div>
          ) : (
            rendered.map((item) =>
              item.kind === "day" ? (
                <div key={item.key} className="flex items-center justify-center py-2">
                  <span className="rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
                    {item.label}
                  </span>
                </div>
              ) : (
                <Bubble
                  key={item.key}
                  m={item.m}
                  showTime={item.showTime}
                  onEdit={item.m.mine && !item.m.deleted ? handleEdit : undefined}
                  onDelete={item.m.mine && !item.m.deleted ? handleDelete : undefined}
                  onReply={!item.m.deleted ? handleReply : undefined}
                  onReact={!item.m.deleted ? handleReact : undefined}
                  editBusy={editMessage.isPending}
                  deleteBusy={deleteMessage.isPending}
                />
              )
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Panel input: kutipan balasan / rekaman suara / pratinjau rekaman / input biasa
          — konten dibatasi max-w-3xl sejajar dengan daftar pesan. */}
      <form
        onSubmit={submit}
        className="border-t bg-card/60"
      >
        <div
          className="mx-auto w-full max-w-3xl p-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
        {replyTarget && (
          <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-2 animate-fade-in">
            <span className="h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-rose-500 to-orange-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-rose-500">
                {replyTarget.mine ? t("dm.you") : other?.user.displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{messageSnippet(replyTarget, t)}</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={() => setReplyTarget(null)}
              aria-label={t("dm.cancelReply")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {voice.blob && voice.previewUrl ? (
          <div className="mb-2 flex items-center gap-2 rounded-xl border bg-muted/40 p-2 animate-fade-in">
            <VoiceBubble src={voice.previewUrl} mine={false} />
            <div className="ml-auto flex gap-1.5">
              <Button type="button" size="icon" className="h-9 w-9 rounded-full" variant="ghost" onClick={cancelRecording} aria-label={t("dm.cancelRecord")}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="h-9 w-9 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                onClick={sendVoice}
                disabled={voice.sending}
                aria-label={t("dm.stopRecord")}
              >
                {voice.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : voice.recording ? (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/5 p-2 animate-fade-in">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/10">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
              </span>
            </span>
            <span className="flex-1 text-sm font-medium tabular-nums">{t("dm.recording", { s: voice.seconds })}</span>
            <Button type="button" size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={cancelRecording}>
              {t("dm.cancelRecord")}
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
              onClick={stopRecording}
              aria-label={t("dm.stopRecord")}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            onChange={(e) => pickAttachment(e.target.files?.[0])}
            aria-label={t("dm.attach")}
          />
          {/* Lampiran galeri (foto / video) — pratinjau dulu sebelum kirim */}
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full transition-transform active:scale-90"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label={t("dm.attach")}
          >
            {attBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          </Button>
          {/* Kamera: jepret langsung & kirim */}
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full transition-transform active:scale-90"
            variant="outline"
            onClick={() => setCameraOpen(true)}
            disabled={busy}
            aria-label={t("dm.camera")}
          >
            <Camera className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full transition-transform active:scale-90"
            variant="outline"
            onClick={startRecording}
            disabled={busy}
            aria-label={t("dm.record")}
          >
            <Mic className="h-5 w-5" />
          </Button>
          <Input
            value={text}
            onChange={onType}
            placeholder={t("dm.placeholder")}
            className="h-10 flex-1 rounded-full bg-muted/60"
            maxLength={1000}
            aria-label={t("dm.typeMsg")}
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim() || busy}
            className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white transition-transform hover:opacity-90 active:scale-90"
            aria-label={t("dm.send")}
          >
            {send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
        </div>
      </form>
      <span className="sr-only">{presenceSub}</span>
      {cameraOpen && <CameraCaptureDialog onCapture={sendCameraPhoto} onClose={() => setCameraOpen(false)} />}
      {pendingAtt && (
        <AttachmentPreviewDialog
          pending={pendingAtt}
          busy={attBusy}
          progress={attProgress}
          onCancel={cancelAttachment}
          onConfirm={confirmAttachment}
        />
      )}
    </div>
  );
}

function ChatHeader({
  conversationId,
  me,
  presence,
}: {
  conversationId: string;
  me: Me | null;
  presence: ChatPresence | null;
}) {
  const t = useT();
  const conversations = useConversations(!!me, 3_000);
  const c = conversations.data?.conversations.find((x) => x.id === conversationId);
  const user = presence?.user ?? (c ? c.user : null);
  const sub = presence
    ? presenceText(presence, t)
    : c
      ? presenceText({ online: c.user.online ?? false, lastSeenAt: c.user.lastSeenAt ?? null, typing: false }, t)
      : "";
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card/80 px-2 py-2 backdrop-blur md:px-4">
      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full md:hidden" asChild>
        <a href="#/messages" aria-label={t("dm.back")}>
          <ArrowLeft className="h-5 w-5" />
        </a>
      </Button>
      {user ? (
        <>
          <UserAvatarLink
            name={user.displayName}
            color={user.avatarColor}
            avatar={user.avatar}
            username={user.username}
            size={38}
            ring
            online={presence ? presence.online : c?.user.online}
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              {user.displayName}
              {(user.role === "ADMIN" || user.role === "OWNER") && <AdminBadge role={user.role} />}
              <span className="truncate text-xs font-normal text-muted-foreground">@{user.username}</span>
            </p>
            <p
              className={cn(
                "truncate text-xs",
                presence?.typing ? "text-rose-500 font-medium" : presence?.online ? "text-emerald-500" : "text-muted-foreground"
              )}
            >
              {sub}
            </p>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      )}
    </header>
  );
}

// ---------- View utama ----------

export function MessagesView({ me, conversationId }: { me: Me | null; conversationId?: string }) {
  const t = useT();
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");

  useEffect(() => {
    document.title = `${t("dm.title")} · SkelzHub`;
  }, [t]);

  if (!me) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <MessageCircle className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">{t("dm.loginTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("dm.loginSub")}</p>
        <a href="#/login">
          <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">{t("a.login")}</Button>
        </a>
      </div>
    );
  }

  // ===== Desktop: dua kolom (daftar kiri + chat kanan) =====
  // ===== Mobile: satu layar penuh (daftar ATAU chat) =====
  // Tinggi mobile presisi: header 56px + nav bawah 60px = 116px (+ safe area).
  return (
    <div className="h-[calc(100dvh-116px-env(safe-area-inset-bottom))] w-full md:h-screen">
      <div className="flex h-full w-full">
        {/* Kolom daftar percakapan (desktop selalu tampil; mobile hanya saat belum buka chat) */}
        <aside
          className={cn(
            "flex w-full flex-col border-r bg-background/40 md:flex md:w-[340px] lg:w-[360px] md:shrink-0",
            conversationId && "hidden"
          )}
          aria-label={t("dm.title")}
        >
          <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h1 className="text-lg font-bold tracking-tight">{t("dm.title")}</h1>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                {t("dm.photoMsg")} · {t("dm.voiceMsg")}
              </span>
              <Button
                size="icon"
                className="h-9 w-9 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                onClick={() => setNewChatOpen(true)}
                aria-label={t("dm.newChat")}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </header>
          {/* Pencarian percakapan — tampil di desktop dan mobile */}
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder={t("dm.searchChats")}
                aria-label={t("dm.searchChats")}
                className="h-10 rounded-full bg-muted/60 pl-9 pr-10"
              />
              {chatSearch && (
                <button
                  type="button"
                  onClick={() => setChatSearch("")}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={t("c.cancel")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <ConversationsList me={me} activeId={conversationId} compact search={chatSearch} />
          </div>
        </aside>

        {/* Kolom chat (desktop) / layar penuh (mobile) */}
        {conversationId ? (
          <ChatView conversationId={conversationId} me={me} />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 p-8 text-center md:flex">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15">
              <MessageCircle className="h-8 w-8 text-rose-500" />
            </span>
            <p className="text-base font-semibold">{t("dm.title")}</p>
            <p className="max-w-xs text-sm text-muted-foreground">{t("dm.emptySub")}</p>
          </div>
        )}
      </div>
      {newChatOpen && <NewChatDialog me={me} onClose={() => setNewChatOpen(false)} />}
    </div>
  );
}
