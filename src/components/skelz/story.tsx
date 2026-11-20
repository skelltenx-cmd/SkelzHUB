"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, Filter as FilterIcon, Heart, Loader2, MessageCircle, Music, Pause, Play, Plus, Send, Trash2, Type, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { api, uploadCaps } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import type { Me, StoryGroup, StoryDetail, StoryItem, StoryComment } from "@/lib/types";
import {
  useAddStoryComment,
  useCreateStory,
  useDeleteStory,
  useDeleteStoryComment,
  useStories,
  useStoryComments,
  useStoryDetail,
  useStoryLike,
  markStorySeenEverywhere,
} from "./hooks";
import { UserAvatar } from "./user-avatar";
import { AdminBadge } from "./admin-badge";
import { PhotoLightbox } from "./photo-lightbox";
import { compressImage, fileToPreviewUrl, formatCount, timeAgo, mediaThumb } from "./utils";
import { toast } from "@/hooks/use-toast";

// Accept "image/*" supaya di HP semua sumber foto bisa dipilih (kamera, galeri,
// screenshot) dan iOS otomatis mengonversi HEIC -> JPEG saat diambil.

// ---------- Editor story (filter / teks / sound) ----------

// Filter story — string CSS yang SAMA dipakai untuk pratinjau & ekspor canvas
// sehingga hasil unggahan identik dengan yang terlihat di layar.
const STORY_FILTERS = [
  { key: "original", css: "none", label: "st.f.original" },
  { key: "warm", css: "sepia(0.35) saturate(1.2) brightness(1.05)", label: "st.f.warm" },
  { key: "cool", css: "saturate(1.1) hue-rotate(-12deg) brightness(1.03)", label: "st.f.cool" },
  { key: "mono", css: "grayscale(1) contrast(1.08)", label: "st.f.mono" },
  { key: "vivid", css: "saturate(1.55) contrast(1.12)", label: "st.f.vivid" },
  { key: "fade", css: "saturate(0.82) brightness(1.08) contrast(0.92)", label: "st.f.fade" },
  { key: "noir", css: "grayscale(1) contrast(1.45) brightness(0.92)", label: "st.f.noir" },
  { key: "sunset", css: "sepia(0.28) saturate(1.4) hue-rotate(-8deg) brightness(1.02)", label: "st.f.sunset" },
] as const;

type StoryFilterKey = (typeof STORY_FILTERS)[number]["key"];

// Warna overlay teks (swatch bulat kecil di editor)
const STORY_TEXT_COLORS = [
  { key: "white", hex: "#FFFFFF", name: "Putih" },
  { key: "black", hex: "#000000", name: "Hitam" },
  { key: "yellow", hex: "#FACC15", name: "Kuning" },
  { key: "pink", hex: "#EC4899", name: "Pink" },
  { key: "cyan", hex: "#22D3EE", name: "Cyan" },
] as const;

type StoryTextColorKey = (typeof STORY_TEXT_COLORS)[number]["key"];

// Posisi overlay teks — atas ~18%, tengah ~50%, bawah ~82% (sama saat ekspor)
const STORY_TEXT_POS = [
  { key: "top", y: 0.18, label: "st.posTop" },
  { key: "mid", y: 0.5, label: "st.posMid" },
  { key: "bot", y: 0.82, label: "st.posBot" },
] as const;

type StoryTextPosKey = (typeof STORY_TEXT_POS)[number]["key"];

const SOUND_MAX_BYTES = 20 * 1024 * 1024; // batas ukuran sound 20MB
const STORY_AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|webm)$/i;

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function truncateName(name: string, max = 20): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Muat gambar dari URL objek untuk digambar ke canvas ekspor. */
function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gambar tidak bisa diproses, coba pilih ulang"));
    img.src = url;
  });
}

/** Pecah teks per kata sampai muat lebar maksimum (maksimum sejumlah baris). */
function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  // Terlalu panjang: potong ke jumlah baris maksimum lalu tambah elipsis
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
    last = last.slice(0, -1);
  }
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/**
 * Render foto + filter + teks overlay ke canvas -> JPEG (kualitas 0.92).
 * Filter memakai string CSS yang sama dengan pratinjau lewat ctx.filter
 * (didukung Chrome/Edge/Firefox/Safari 17+; bila tidak didukung, foto
 * digambar apa adanya tanpa filter).
 */
async function renderEditedStoryImage(
  src: string,
  filterCss: string,
  text: string,
  colorHex: string,
  posY: number
): Promise<Blob> {
  const img = await loadImageEl(src);
  const cap = 2160; // jaga memori; kompresi akhir tetap lewat compressImage (1920px)
  const scale = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const supportsCtxFilter = "filter" in ctx;
  if (filterCss !== "none" && supportsCtxFilter) {
    try {
      ctx.filter = filterCss;
    } catch {
      // browser tanpa ctx.filter: gambar tanpa filter
    }
  }
  ctx.drawImage(img, 0, 0, w, h);
  if (supportsCtxFilter) {
    try {
      ctx.filter = "none";
    } catch {
      /* abaikan */
    }
  }
  const value = text.trim();
  if (value) {
    const fontSize = Math.round(w * 0.075);
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const lines = wrapTextLines(ctx, value, w * 0.86, 3);
    const lineH = Math.round(fontSize * 1.16);
    const startY = h * posY - ((lines.length - 1) * lineH) / 2;
    // Stroke hitam tebal supaya teks tetap terbaca di foto ramai
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.strokeStyle = "#000000";
    for (let i = 0; i < lines.length; i++) {
      ctx.strokeText(lines[i], w / 2, startY + i * lineH);
    }
    ctx.fillStyle = colorHex;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], w / 2, startY + i * lineH);
    }
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
  if (!blob) throw new Error("Gagal merender gambar, coba lagi");
  return blob;
}

// ---------- Dialog buat story ----------

export function CreateStoryDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const soundInputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ file: File; kind: "IMAGE" | "VIDEO"; previewUrl: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  // Editor story (foto): tab filter / teks / sound
  const [editTab, setEditTab] = useState<"filter" | "text" | "sound">("filter");
  const [filterKey, setFilterKey] = useState<StoryFilterKey>("original");
  const [overlayText, setOverlayText] = useState("");
  const [textColorKey, setTextColorKey] = useState<StoryTextColorKey>("white");
  const [textPosKey, setTextPosKey] = useState<StoryTextPosKey>("mid");
  // Sound latar: file + pratinjau lokal lewat Audio object — hanya diputar
  // manual lewat tombol putar, tidak otomatis mengikuti pratinjau gambar.
  const [soundFile, setSoundFile] = useState<File | null>(null);
  const [soundDuration, setSoundDuration] = useState<number | null>(null);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const soundElRef = useRef<HTMLAudioElement | null>(null);
  const soundUrlRef = useRef<string | null>(null);
  const createStory = useCreateStory(() => {
    toast({ title: t("st.story") + " ✓", description: t("st.hint") });
    qc.invalidateQueries({ queryKey: ["stories"] });
    onClose();
  });

  const filterCss = STORY_FILTERS.find((f) => f.key === filterKey)?.css ?? "none";
  const textColorHex = STORY_TEXT_COLORS.find((c) => c.key === textColorKey)?.hex ?? "#FFFFFF";
  const textPosY = STORY_TEXT_POS.find((p) => p.key === textPosKey)?.y ?? 0.5;
  const trimmedOverlay = overlayText.trim();

  // Bebaskan memori pratinjau audio saat dialog ditutup
  useEffect(() => {
    return () => {
      soundElRef.current?.pause();
      if (soundUrlRef.current) URL.revokeObjectURL(soundUrlRef.current);
    };
  }, []);

  const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/3gpp"];

  async function accept(f: File | undefined | null) {
    if (!f) return;
    // Batas ukuran mengikuti jalur aktif: R2 (CDN) = 5GB, database = 200MB/60MB
    const caps = await uploadCaps();
    if (f.type.startsWith("video/")) {
      if (!VIDEO_TYPES.includes(f.type) || f.size > caps.video) {
        toast({
          title: "Video tidak didukung / terlalu besar",
          description: caps.r2 ? "MP4/WebM/MOV maks 5GB" : "MP4/WebM/MOV maks 200MB",
        });
        return;
      }
      resetEdits();
      setPicked({ file: f, kind: "VIDEO", previewUrl: fileToPreviewUrl(f) });
      return;
    }
    // Di beberapa HP Android, file galeri tidak punya MIME -> anggap gambar jika ada ekstensi gambar
    const looksImage =
      f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);
    if (!looksImage || f.size > caps.image) {
      toast({
        title: "File tidak didukung / terlalu besar",
        description: caps.r2 ? "JPEG/PNG/WebP/GIF maks 5GB" : "JPEG/PNG/WebP/GIF maks 60MB",
      });
      return;
    }
    resetEdits();
    setPicked({ file: f, kind: "IMAGE", previewUrl: fileToPreviewUrl(f) });
  }

  function stopSoundPreview() {
    soundElRef.current?.pause();
    setSoundPlaying(false);
  }

  function removeSound() {
    const el = soundElRef.current;
    if (el) {
      el.pause();
      el.onended = null;
      el.onloadedmetadata = null;
    }
    if (soundUrlRef.current) URL.revokeObjectURL(soundUrlRef.current);
    soundElRef.current = null;
    soundUrlRef.current = null;
    setSoundFile(null);
    setSoundDuration(null);
    setSoundPlaying(false);
  }

  function toggleSoundPreview() {
    const el = soundElRef.current;
    if (!el) return;
    if (soundPlaying) {
      el.pause();
      setSoundPlaying(false);
    } else {
      el.play()
        .then(() => setSoundPlaying(true))
        .catch(() => setSoundPlaying(false));
    }
  }

  function acceptSound(f: File | undefined | null) {
    if (!f) return;
    const looksAudio = f.type.startsWith("audio/") || STORY_AUDIO_EXT.test(f.name);
    if (!looksAudio || f.size > SOUND_MAX_BYTES) {
      toast({ title: "Sound tidak didukung / terlalu besar", description: "MP3/M4A/OGG/WAV maks 20MB" });
      return;
    }
    removeSound();
    const url = URL.createObjectURL(f);
    const el = new Audio(url);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      setSoundDuration(Number.isFinite(el.duration) ? el.duration : null);
    };
    el.onended = () => setSoundPlaying(false);
    soundUrlRef.current = url;
    soundElRef.current = el;
    setSoundFile(f);
    setSoundDuration(null);
    setSoundPlaying(false);
  }

  // Reset semua state editor saat ganti file / setelah sukses unggah
  function resetEdits() {
    setEditTab("filter");
    setFilterKey("original");
    setOverlayText("");
    setTextColorKey("white");
    setTextPosKey("mid");
    removeSound();
  }

  async function submit() {
    if (!picked || uploading || createStory.isPending) return;
    try {
      setUploading(true);
      setProgress(0);
      stopSoundPreview();
      const sound = soundFile;
      let blob: Blob = picked.file;
      if (picked.kind === "IMAGE") {
        const edited = filterKey !== "original" || trimmedOverlay.length > 0;
        if (edited) {
          // Foto + filter/teks: render ke canvas (filter + overlay teks),
          // lalu kompresi seperti biasa supaya tetap tajam & ringan.
          const rendered = await renderEditedStoryImage(picked.previewUrl, filterCss, trimmedOverlay, textColorHex, textPosY);
          blob = await compressImage(
            new File([rendered], picked.file.name || "story.jpg", { type: "image/jpeg" }),
            { maxDim: 1920, maxBytes: 5 * 1024 * 1024 }
          );
        } else {
          // Story: kualitas tajam (1920px) supaya layar penuh tetap jernih,
          // ukuran tetap ringan (lihat utils.ts)
          blob = await compressImage(picked.file, { maxDim: 1920, maxBytes: 5 * 1024 * 1024 });
        }
      }
      // Progress gabungan: foto 0-70%, sound 70-100% (bila ada sound)
      const uploaded = await api.upload(blob, picked.file.name || "story", (pct) =>
        setProgress(sound ? Math.round(pct * 0.7) : pct)
      );
      if (uploaded.kind !== picked.kind) {
        throw new Error("Tipe media tidak cocok, coba unggah ulang");
      }
      let audioMediaId: string | undefined;
      if (sound) {
        const audioUploaded = await api.upload(sound, sound.name || "audio", (pct) =>
          setProgress(70 + Math.round(pct * 0.3))
        );
        if (audioUploaded.kind !== "AUDIO") {
          throw new Error("Tipe media tidak cocok, coba unggah ulang");
        }
        audioMediaId = audioUploaded.mediaId;
      }
      await createStory.mutateAsync({ mediaId: uploaded.mediaId, caption: caption.trim(), audioMediaId });
      resetEdits();
    } catch (err) {
      toast({ title: "Gagal mengunggah story", description: (err as Error).message });
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || createStory.isPending;

  // Panel sound dipakai baik untuk foto (tab) maupun video (panel tunggal)
  const soundPanel = (
    <div className="space-y-1.5">
      <input
        ref={soundInputRef}
        type="file"
        accept="audio/*"
        className="sr-only"
        onChange={(e) => {
          acceptSound(e.target.files?.[0]);
          e.target.value = "";
        }}
        aria-label={t("st.addSound")}
      />
      {soundFile ? (
        <div className="flex items-center gap-1.5 rounded-xl border bg-background px-2 py-1.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-400 text-white" aria-hidden="true">
            <Music className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold" title={soundFile.name}>
              {truncateName(soundFile.name)}
            </span>
            <span className="block text-[11px] tabular-nums text-muted-foreground">
              {soundDuration != null ? fmtDuration(soundDuration) : "--:--"} · {t("st.soundOn")}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            onClick={toggleSoundPreview}
            disabled={busy}
            aria-label={soundPlaying ? t("st.pauseSound") : t("st.playSound")}
          >
            {soundPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            onClick={removeSound}
            disabled={busy}
            aria-label={t("st.removeSound")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => soundInputRef.current?.click()}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold text-muted-foreground transition-colors hover:border-rose-400/70 hover:text-foreground"
        >
          <Music className="h-5 w-5" aria-hidden="true" />
          {t("st.addSound")}
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">{t("st.soundHint")}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center" role="dialog" aria-modal="true">
      <div className="my-auto w-full max-w-md rounded-t-2xl border bg-card p-4 shadow-xl animate-slide-up sm:rounded-2xl sm:p-6 sm:animate-pop-in">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{t("st.addStory")}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label={t("c.cancel")} disabled={busy}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <input ref={inputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="sr-only" onChange={(e) => accept(e.target.files?.[0])} aria-label={t("st.addStory")} />

        {!picked ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[3/4] max-h-[58vh] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-rose-400/70 hover:text-foreground"
          >
            <motion.span
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15"
            >
              <Plus className="h-7 w-7 text-rose-500" />
            </motion.span>
            <span className="text-sm font-semibold text-foreground">{t("st.addStory")}</span>
            <span className="text-xs">{t("st.hint")}</span>
          </button>
        ) : (
          <>
            {/* Pratinjau dengan bingkai ala penampil story: bar progres +
                header + caption overlay supaya user tahu hasil akhirnya */}
            <div className="relative overflow-hidden rounded-2xl border bg-black">
              <div className="absolute inset-x-3 top-2.5 z-10 flex gap-1">
                <span className="h-[3px] flex-1 rounded-full bg-white/90" />
              </div>
              <div className="absolute inset-x-3 top-6 z-10 flex items-center gap-2">
                <UserAvatar name={me.displayName} color={me.avatarColor} avatar={me.avatar} size={24} />
                <span className="truncate text-xs font-semibold text-white drop-shadow">{me.displayName}</span>
              </div>
              {picked.kind === "VIDEO" ? (
                <video src={picked.previewUrl} muted playsInline className="aspect-[3/4] max-h-[58vh] w-full object-contain" />
              ) : (
                <img src={picked.previewUrl} alt="Pratinjau story" style={{ filter: filterCss }} className="aspect-[3/4] max-h-[40vh] w-full object-cover" />
              )}
              {/* Overlay teks pratinjau — posisi & warna sesuai pilihan editor */}
              {picked.kind === "IMAGE" && trimmedOverlay && (
                <p
                  className="pointer-events-none absolute inset-x-0 z-[5] px-4 text-center text-2xl font-bold leading-snug sm:text-3xl"
                  style={{
                    top: `${textPosY * 100}%`,
                    transform: "translateY(-50%)",
                    color: textColorHex,
                    textShadow: "0 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.55)",
                  }}
                >
                  {trimmedOverlay}
                </p>
              )}
              {caption.trim() && (
                <p className="pointer-events-none absolute inset-x-0 bottom-4 bg-gradient-to-t from-black/60 to-transparent px-4 pb-1 pt-6 text-center text-sm font-medium text-white drop-shadow">
                  {caption.trim().length > 60 ? `${caption.trim().slice(0, 60)}…` : caption.trim()}
                </p>
              )}
              <span className="absolute left-3 top-14 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                {picked.kind === "VIDEO" ? "Video · 24 jam" : "Foto · 24 jam"}
              </span>
              <Button variant="secondary" size="sm" className="absolute right-2 top-6 rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80" onClick={() => inputRef.current?.click()} disabled={busy}>
                Ganti
              </Button>
            </div>

            {/* Toolbar edit story: FOTO -> filter/teks/sound, VIDEO -> sound saja */}
            {picked.kind === "IMAGE" ? (
              <div className="mt-3 space-y-2 rounded-xl border bg-muted/30 p-2.5">
                <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("st.editTools")}</span>
                <div role="tablist" aria-label={t("st.editTools")} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                  {(["filter", "text", "sound"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={editTab === tab}
                      disabled={busy}
                      onClick={() => setEditTab(tab)}
                      className={cn(
                        "flex h-10 items-center justify-center gap-1.5 rounded-md text-xs font-bold transition-colors",
                        editTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab === "filter" ? (
                        <FilterIcon className="h-4 w-4" aria-hidden="true" />
                      ) : tab === "text" ? (
                        <Type className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Music className="h-4 w-4" aria-hidden="true" />
                      )}
                      {tab === "filter" ? t("st.filter") : tab === "text" ? t("st.text") : t("st.sound")}
                    </button>
                  ))}
                </div>

                {/* Filter: thumbnail kecil dengan filter diterapkan, aktif diberi ring */}
                {editTab === "filter" && (
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                    {STORY_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilterKey(f.key)}
                        disabled={busy}
                        aria-pressed={filterKey === f.key}
                        aria-label={t(f.label)}
                        className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg p-1 transition-transform active:scale-95"
                      >
                        <span
                          className={cn(
                            "block h-14 w-14 overflow-hidden rounded-lg ring-2 transition-all",
                            filterKey === f.key ? "ring-rose-500 ring-offset-2 ring-offset-background" : "ring-transparent"
                          )}
                        >
                          <img src={picked.previewUrl} alt="" style={{ filter: f.css }} className="h-full w-full object-cover" />
                        </span>
                        <span
                          className={cn(
                            "w-full truncate text-center text-[10px] font-semibold",
                            filterKey === f.key ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                          )}
                        >
                          {t(f.label)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Teks overlay: teks + warna + posisi */}
                {editTab === "text" && (
                  <div className="space-y-2.5">
                    <Input
                      value={overlayText}
                      onChange={(e) => setOverlayText(e.target.value)}
                      placeholder={t("st.textPh")}
                      maxLength={200}
                      disabled={busy}
                      aria-label={t("st.textPh")}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">{t("st.textColor")}</span>
                      <div className="flex flex-wrap gap-1">
                        {STORY_TEXT_COLORS.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setTextColorKey(c.key)}
                            disabled={busy}
                            aria-pressed={textColorKey === c.key}
                            aria-label={`${t("st.textColor")}: ${c.name}`}
                            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-90"
                          >
                            <span
                              className={cn(
                                "block h-6 w-6 rounded-full shadow-inner",
                                textColorKey === c.key ? "ring-2 ring-rose-500 ring-offset-2 ring-offset-background" : "ring-1 ring-black/10"
                              )}
                              style={{ backgroundColor: c.hex }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {STORY_TEXT_POS.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setTextPosKey(p.key)}
                          disabled={busy}
                          aria-pressed={textPosKey === p.key}
                          className={cn(
                            "h-10 rounded-lg border text-xs font-bold transition-colors",
                            textPosKey === p.key
                              ? "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {t(p.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {editTab === "sound" && soundPanel}
              </div>
            ) : (
              <div className="mt-3 space-y-1.5 rounded-xl border bg-muted/30 p-2.5">
                <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("st.sound")}</span>
                {soundPanel}
              </div>
            )}

            <div className="mt-3 space-y-2">
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t("st.captionPlaceholder")} maxLength={500} disabled={busy} aria-label={t("st.captionLabel")} />
              <p className="text-xs text-muted-foreground">{t("st.hint")}</p>
              <Button onClick={submit} disabled={busy} className="relative w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy
                  ? uploading
                    ? `Mengunggah ${progress}%`
                    : t("st.uploading")
                  : t("st.share")}
                {busy && uploading && (
                  <span className="absolute inset-x-4 bottom-1 h-1 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
                    <span className="block h-full bg-white transition-[width] duration-200" style={{ width: `${progress}%` }} />
                  </span>
                )}
              </Button>
            </div>
          </>
        )}
        <span className="sr-only">{me.username}</span>
      </div>
    </div>
  );
}

// ---------- Rail story di atas feed ----------

export function StoriesRail({ me }: { me: Me | null }) {
  const t = useT();
  const query = useStories(!!me);
  const groups = query.data?.groups ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Foto profil yang sedang diperbesar (lightbox) — null = tutup
  const [avatarView, setAvatarView] = useState<string | null>(null);

  const myGroup = groups.find((g) => g.isMe);
  const others = groups.filter((g) => !g.isMe);

  function openMy() {
    if (myGroup) {
      const idx = groups.indexOf(myGroup);
      setViewerIndex(idx);
    } else {
      setCreateOpen(true);
    }
  }

  if (!me) return null;
  if (query.isLoading) {
    return (
      <div className="mb-4 flex gap-3 overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex gap-3.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Story-ku */}
        <button type="button" onClick={openMy} className="group flex w-16 shrink-0 flex-col items-center gap-1.5" aria-label={myGroup ? t("st.yourStory") : t("st.addStory")}>
          <span className={cn("relative block rounded-full p-[2.5px] transition-transform active:scale-95", myGroup ? "bg-gradient-to-tr from-rose-500 via-pink-500 to-orange-400" : "bg-muted-foreground/25")}>
            <span className={cn("block rounded-full border-2", myGroup && "border-transparent")}>
              <UserAvatar name={me.displayName} color={me.avatarColor} avatar={me.avatar} size={56} ring />
            </span>
            {!myGroup && (
              <motion.span
                initial={{ scale: 0.9, opacity: 0.8 }}
                animate={{ scale: 1.05, opacity: 1 }}
                transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse" }}
                className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-gradient-to-r from-rose-500 to-orange-400 text-white"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
              </motion.span>
            )}
          </span>
          <span className="w-full truncate text-center text-[11px] text-muted-foreground group-hover:text-foreground">{t("st.yourStory")}</span>
        </button>

        {/* Story orang lain: klik -> pilihan Lihat Story atau Lihat Foto Profil */}
        {others.map((g) => {
          const idx = groups.indexOf(g);
          return (
            <DropdownMenu key={g.author.id}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group flex w-16 shrink-0 flex-col items-center gap-1.5"
                  aria-label={`${t("st.story")}: ${g.author.displayName}`}
                >
                  <span className={cn("relative block rounded-full p-[2.5px] transition-transform active:scale-95", g.hasUnseen ? "animate-story-ring bg-gradient-to-tr from-rose-500 via-pink-500 to-orange-400" : "bg-muted-foreground/25")}>
                    <span className="block rounded-full">
                      <UserAvatar name={g.author.displayName} color={g.author.avatarColor} avatar={g.author.avatar} size={56} />
                    </span>
                  </span>
                  <span className="w-full truncate text-center text-[11px] text-muted-foreground group-hover:text-foreground">@{g.author.username}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setViewerIndex(idx)}>
                  <Play className="h-4 w-4" /> {t("st.viewStory")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    window.location.hash = `#/u/${encodeURIComponent(g.author.username)}`;
                  }}
                >
                  <UserRound className="h-4 w-4" /> {t("st.openProfile")}
                </DropdownMenuItem>
                {g.author.avatar && (
                  <DropdownMenuItem onClick={() => setAvatarView(g.author.avatar ?? null)}>
                    <UserRound className="h-4 w-4" /> {t("st.viewProfilePhoto")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>

      {viewerIndex !== null && (
        <StoryViewer groups={groups} startIndex={viewerIndex} me={me} onClose={() => setViewerIndex(null)} />
      )}
      {createOpen && me && <CreateStoryDialog me={me} onClose={() => setCreateOpen(false)} />}
      <PhotoLightbox src={avatarView} alt="Foto profil" onClose={() => setAvatarView(null)} />
    </div>
  );
}

// ---------- Overlay penampil story ----------

const IMAGE_MS = 5000;
// Batas durasi story bersound: 60 detik — audio lebih panjang tetap lanjut
// ke story berikutnya di detik 60.
const AUDIO_CAP_S = 60;

type StoryAudioMode = "none" | "play" | "fallback";

export function StoryViewer({
  groups,
  startIndex,
  onClose,
  me,
}: {
  groups: StoryGroup[];
  startIndex: number;
  onClose: () => void;
  me?: Me | null;
}) {
  const t = useT();
  const [gi, setGi] = useState(startIndex);
  const [ii, setIi] = useState(0);
  const [progress, setProgress] = useState(0);
  const group = groups[gi];
  const item = group?.items[ii] as StoryItem | undefined;
  // Mekanisme preload: playback HANYA dimulai setelah media item termuat penuh.
  // "ready" diturunkan dari daftar item yang sudah termuat (loadedIds) sehingga
  // berpindah item otomatis menampilkan spinner tanpa perlu reset manual.
  // Status sound latar item aktif TERIKAT ID ITEM: "none" = tanpa/belum
  // diputar, "play" = audio berbunyi (progress mengikuti audio),
  // "fallback" = autoplay ditolak/audio gagal -> kembali ke timer 5 dtk.
  // Nilai turunannya otomatis kembali "segar" saat item berganti.
  const [audioState, setAudioState] = useState<{ id: string; ready: boolean; mode: StoryAudioMode }>({
    id: "",
    ready: false,
    mode: "none",
  });
  const audioOf: { ready: boolean; mode: StoryAudioMode } =
    item && audioState.id === item.id ? audioState : { ready: false, mode: "none" };
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  // Foto bersound: item baru dianggap siap setelah gambar DAN audionya siap,
  // supaya durasi story benar-benar mengikuti audio sejak detik pertama.
  const needsAudioClock = !!(item && item.type === "IMAGE" && item.audio);
  const ready = !!item && loadedIds.has(item.id) && (!needsAudioClock || audioOf.ready);
  const [paused, setPaused] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Balasan terikat ke story asal komentar yang dibalas (bukan item aktif) supaya
  // tetap benar walau story sudah berganti saat pengguna selesai mengetik.
  const [replyTarget, setReplyTarget] = useState<{ comment: StoryComment; storyId: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [burst, setBurst] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  const like = useStoryLike();
  const addComment = useAddStoryComment();
  const qc = useQueryClient();

  const markLoaded = useCallback((id: string) => {
    setLoadedIds((prev) => {
      if (prev.has(id)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(id);
      return nextSet;
    });
    // Mulai dari 0 saat item baru selesai termuat (progress item lama tidak ikut)
    setProgress(0);
  }, []);

  // Ref disinkronkan tiap render: loop rAF membaca ref (bukan state) sehingga
  // like/komentar/re-render TIDAK pernah me-restart playback dari awal.
  // Sedang mengetik balasan juga membekukan story (seperti aplikasi sosial pada umumnya).
  const replyActive = !!replyTarget || replyText.trim().length > 0;
  useEffect(() => {
    pausedRef.current = paused || commentsOpen || detailOpen || replyActive;
  }, [paused, commentsOpen, detailOpen, replyActive]);

  const next = useCallback(() => {
    setPaused(false);
    if (!group) return;
    if (ii + 1 < group.items.length) {
      setIi(ii + 1);
    } else if (gi + 1 < groups.length) {
      setGi(gi + 1);
      setIi(0);
    } else {
      onClose();
    }
  }, [group, ii, gi, groups.length, onClose]);

  const prev = useCallback(() => {
    setPaused(false);
    if (ii > 0) {
      setIi(ii - 1);
    } else if (gi > 0) {
      setGi(gi - 1);
      setIi(0);
    }
  }, [ii, gi]);

  // Simpan fungsi navigasi di ref agar loop rAF selalu memakai versi terbaru
  // tanpa harus bergantung padanya (itulah penyebab playback restart saat like).
  const nextRef = useRef(next);
  const prevRef = useRef(prev);
  useEffect(() => {
    nextRef.current = next;
    prevRef.current = prev;
  }, [next, prev]);

  // Preload agresif: SEMUA gambar grup aktif + beberapa item grup berikutnya
  // dimuat lebih dulu ke cache browser (immutable cache) supaya perpindahan
  // story mulus tanpa macet. Video: pra-ambil metadata (moov atom) supaya
  // mulai putar jauh lebih cepat saat gilirannya tiba.
  useEffect(() => {
    if (!groups.length) return;
    const imgs: string[] = [];
    const vids: string[] = [];
    const collect = (g: StoryGroup | undefined, limit: number) => {
      if (!g) return;
      for (const s of g.items.slice(0, limit)) {
        if (s.type === "VIDEO") vids.push(s.media);
        else imgs.push(s.media);
      }
    };
    collect(groups[gi], 20); // seluruh grup aktif
    collect(groups[gi + 1], 4); // sebagian grup berikutnya
    collect(groups[gi + 2], 2); // intip grup selanjutnya juga
    for (const u of imgs) {
      const img = new Image();
      img.decoding = "async";
      img.src = u;
      img.decode?.().catch(() => null);
    }
    for (const u of vids.slice(0, 2)) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.src = u; // fetch metadata -> masuk cache HTTP immutable
    }
  }, [gi, groups]);

  // Reset status saat item berganti — dilakukan otomatis lewat state turunan
  // (loadedIds) tanpa effect: item baru yang belum termuat -> ready=false.

  // Tandai sudah dilihat (fire & forget) + patch cache langsung supaya
  // ring story (rail & semua avatar) memucat SEKETIKA setelah ditonton.
  useEffect(() => {
    if (item && group && !group.isMe) {
      markStorySeenEverywhere(qc, item.id);
      api.markStorySeen(item.id).catch(() => null);
    }
  }, [item?.id, qc]);

  // Navigasi keyboard (diabaikan saat sheet terbuka supaya panah tetap
  // berguna memindahkan kursor di dalam input)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (commentsOpen || detailOpen) {
        if (e.key === "Escape") {
          setCommentsOpen(false);
          setDetailOpen(false);
        }
        return;
      }
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") nextRef.current();
      else if (e.key === "ArrowLeft") prevRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, commentsOpen, detailOpen]);

  // Sound latar (item.audio): FOTO -> durasi story = durasi audio (maks 60 dtk,
  // progress mengikuti audio.currentTime, audio.onended lanjut otomatis);
  // VIDEO -> video dimute dan sound yang berbunyi (progress tetap ikut video).
  // Ganti item -> audio lama dihentikan (pause + src direset) lalu audio baru
  // diputar otomatis (penampil dibuka dari klik -> autoplay diizinkan; bila
  // ditolak atau gagal, diamkan dan jatuh kembali ke timer 5 dtk).
  useEffect(() => {
    const a = audioRef.current;
    if (!item || !item.audio || !a) return;
    a.pause();
    try {
      a.currentTime = 0;
    } catch {
      /* beberapa stream tidak bisa di-seek */
    }
    let advanced = false; // cegah next() ganda saat detik 60
    const write = (patch: { ready?: boolean; mode?: StoryAudioMode }) => {
      setAudioState((prev) =>
        prev.id === item.id ? { ...prev, ...patch } : { id: item.id, ready: false, mode: "none", ...patch }
      );
    };
    const onCanPlay = () => {
      write({ ready: true });
      if (item.type === "IMAGE") markLoaded(item.id);
    };
    const onTime = () => {
      const cur = a.currentTime;
      if (cur >= AUDIO_CAP_S) {
        if (!advanced) {
          advanced = true;
          nextRef.current(); // audio >60 dtk: lanjut di detik 60
        }
        return;
      }
      const raw = a.duration;
      const dur = Number.isFinite(raw) && raw > 0 ? Math.min(raw, AUDIO_CAP_S) : 0;
      if (dur > 0) setProgress(Math.min(1, cur / dur));
    };
    const onEnded = () => nextRef.current();
    const onError = () => {
      // Sound gagal dimuat: jangan macet — anggap siap & pakai timer 5 dtk
      write({ ready: true, mode: "fallback" });
      if (item.type === "IMAGE") markLoaded(item.id);
    };
    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    a.load();
    if (!pausedRef.current) {
      a.play()
        .then(() => write({ mode: "play" }))
        .catch(() => write({ mode: "fallback" }));
    }
    return () => {
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      a.pause();
      a.removeAttribute("src");
      try {
        a.load(); // benar-benar melepas audio lama
      } catch {
        /* abaikan */
      }
    };
  }, [item?.id, item?.audio, markLoaded]);

  // Timer gambar (rAF). Deps HANYA item + ready + sheet: like/komentar tidak
  // menyentuh loop ini. Saat di-pause, waktu dibekukan (tidak dihitung).
  // Foto bersound yang berbunyi tidak memakai timer ini: progres & durasi
  // cerita mengikuti audio (kecuali autoplay ditolak -> fallback 5 dtk).
  useEffect(() => {
    const audioClock = item?.type === "IMAGE" && !!item.audio && audioOf.mode === "play";
    if (!item || item.type === "VIDEO" || commentsOpen || detailOpen || !ready || audioClock) return;
    elapsedRef.current = 0;
    startRef.current = performance.now();
    const step = (now: number) => {
      if (pausedRef.current) {
        startRef.current = now - elapsedRef.current; // bekukan progres
      } else {
        elapsedRef.current = now - startRef.current;
      }
      const p = Math.min(1, elapsedRef.current / IMAGE_MS);
      setProgress(p);
      if (p >= 1) {
        nextRef.current();
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [item?.id, ready, commentsOpen, detailOpen, audioOf.mode]);

  // Video: mulai hanya setelah data siap diputar (canplay) — playback aman,
  // tidak error/skip saat file masih mengunduh. "ready" turunan loadedIds.
  // Ada sound latar -> video diputar MUTED dan sound yang berbunyi.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !item || item.type !== "VIDEO") return;
    v.muted = !!item.audio;
    const onCanPlay = () => {
      markLoaded(item.id);
      if (!pausedRef.current) v.play().catch(() => null);
    };
    const onEnded = () => nextRef.current();
    const onTime = () => {
      if (v.duration > 0) setProgress(Math.min(1, v.currentTime / v.duration));
    };
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("ended", onEnded);
    v.addEventListener("timeupdate", onTime);
    v.currentTime = 0;
    v.load();
    return () => {
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("timeupdate", onTime);
      v.pause();
    };
  }, [item?.id, markLoaded]);

  // Pause / lanjut video sesuai kondisi (termasuk sedang mengetik balasan)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !item || item.type !== "VIDEO") return;
    if (paused || commentsOpen || detailOpen || replyActive) {
      v.pause();
    } else if (ready) {
      v.play().catch(() => null);
    }
  }, [paused, commentsOpen, detailOpen, replyActive, ready, item?.id]);

  // Jeda/lanjut sound latar mengikuti kondisi jeda story (termasuk sheet
  // terbuka dan sedang mengetik balasan) — berlaku foto maupun video.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !item?.audio) return;
    if (paused || commentsOpen || detailOpen || replyActive) {
      a.pause();
    } else if (audioOf.mode !== "fallback") {
      a.play().catch(() => null);
    }
  }, [paused, commentsOpen, detailOpen, replyActive, audioOf.mode, item?.id, item?.audio]);

  if (!group || !item) return null;

  // Bar progres: selama media belum termuat penuh, tampil 0 (bukan nilai item lama)
  const displayProgress = ready ? progress : 0;

  // Suka story: tamu diarahkan ke halaman masuk dulu
  function toggleLike() {
    if (!item) return;
    if (!me) {
      window.location.hash = "#/login";
      return;
    }
    like.mutate(item.id);
  }

  function likeWithBurst(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!item) return;
    if (!item.likedByMe) toggleLike();
    // Double-tap suka tidak boleh meninggalkan story terjeda:
    // pastikan playback langsung berjalan lagi.
    setPaused(false);
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
  }

  // Bar balasan bawah (komentar story / balasan ke komentar)
  function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    if (!me) {
      window.location.hash = "#/login";
      return;
    }
    const value = replyText.trim();
    if (!value || addComment.isPending) return;
    setReplyText("");
    addComment.mutate(
      {
        storyId: replyTarget?.storyId ?? item.id,
        text: value,
        parentId: replyTarget?.comment.id ?? null,
      },
      {
        onSuccess: () => {
          setReplyTarget(null);
        },
      }
    );
  }

  const inputPlaceholder = replyTarget
    ? t("st.replyPlaceholder", { u: replyTarget.comment.author.username })
    : t("st.replyBar");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[80] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={t("st.story")}
    >
      {/* Bar progres */}
      <div className="flex gap-1 px-3 pt-3 animate-fade-in">
        {group.items.map((s, idx) => (
          <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full bg-white"
              style={{ width: idx < ii ? "100%" : idx === ii ? `${displayProgress * 100}%` : "0%", transition: idx === ii ? "none" : "width 0.2s" }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-3 animate-fade-in">
        <UserAvatar name={group.author.displayName} color={group.author.avatarColor} avatar={group.author.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
            <a href={`#/u/${encodeURIComponent(group.author.username)}`} className="hover:underline">
              {group.author.displayName}
            </a>
            {(group.author.role === "ADMIN" || group.author.role === "OWNER") && <AdminBadge role={group.author.role} />}
            <span className="truncate text-xs font-normal text-white/60">@{group.author.username}</span>
          </p>
          <p className="text-xs text-white/70">{timeAgo(item.createdAt)}</p>
        </div>
        {group.isMe && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={() => setDetailOpen(true)}
            className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white backdrop-blur transition-colors hover:bg-white/20"
            aria-label={t("st.views", { n: item.viewCount })}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="tabular-nums">{formatCount(item.viewCount)}</span>
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          aria-label="Tutup"
        >
          <X className="h-5 w-5" />
        </motion.button>
      </div>

      {/* Konten story */}
      <div
        className="relative flex-1 select-none overflow-hidden"
        onClick={(e) => {
          // Tap tengah = pause/lanjut; double-tap = suka.
          // e.detail===2 tidak men-toggle pause supaya double-tap-tap-suka
          // tidak meninggalkan story dalam keadaan jeda.
          if (e.detail === 1) setPaused((p) => !p);
        }}
        onDoubleClick={likeWithBurst}
      >
        {item.type === "VIDEO" ? (
          <video
            key={item.id}
            ref={videoRef}
            src={item.media}
            playsInline
            preload="auto"
            muted={!!item.audio}
            className="h-full w-full animate-story-in object-contain"
          />
        ) : (
          <img
            key={item.id}
            src={mediaThumb(item.media, 1080) ?? undefined}
            alt={item.caption || "Story"}
            onLoad={() => markLoaded(item.id)}
            onError={() => markLoaded(item.id)}
            className="h-full w-full animate-story-in object-contain"
          />
        )}

        {/* Sound latar story (tanpa kontrol; diputar otomatis oleh effect) */}
        {item.audio && <audio ref={audioRef} src={item.audio} preload="auto" />}

        {/* Spinner sampai media benar-benar termuat (mekanisme load dulu, play belakangan) */}
        {!ready && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <span className="flex flex-col items-center gap-2 rounded-full bg-black/60 px-5 py-3 backdrop-blur">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
              <span className="text-[11px] font-medium text-white/80">{t("st.loading")}</span>
            </span>
          </div>
        )}

        {/* Zona tap kiri/kanan (sempit & jelas; klik tidak bocor ke handler
            pause induk -> tidak pernah memicu jeda/pesanan ganda) */}
        <button
          type="button"
          className="absolute inset-y-0 left-0 z-0 w-[18%] cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label="Sebelumnya"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 z-0 w-[18%] cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label="Berikutnya"
        />

        {/* ===== Rail aksi di SISI KANAN (suka / komentar) — seperti sosial
            pada umumnya. Klik berhenti di tombol (stopPropagation) supaya
            tidak memicu pause & playback TIDAK PERNAH terganggu. ===== */}
        <div className="absolute bottom-24 right-2 z-20 flex flex-col gap-2.5 sm:bottom-28 sm:right-3">
          <motion.button
            whileTap={{ scale: 0.82 }}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleLike();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-pressed={item.likedByMe}
            aria-label={item.likedByMe ? t("st.unlike") : t("st.like")}
            className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-white/25"
          >
            <motion.span
              key={item.likedByMe ? "liked" : "unliked"}
              initial={{ scale: item.likedByMe ? 1.4 : 1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="inline-flex"
            >
              <Heart className={cn("h-6 w-6 drop-shadow", item.likedByMe && "fill-rose-500 text-rose-500")} aria-hidden="true" />
            </motion.span>
          </motion.button>
          {item.likeCount > 0 && (
            <span className="mx-auto -mt-1.5 rounded-full bg-black/50 px-2 text-center text-[11px] font-bold tabular-nums text-white backdrop-blur">
              {formatCount(item.likeCount)}
            </span>
          )}

          <motion.button
            whileTap={{ scale: 0.82 }}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCommentsOpen(true);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={t("st.comments")}
            className="mt-1 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-white/25"
          >
            <MessageCircle className="h-6 w-6 drop-shadow" aria-hidden="true" />
          </motion.button>
          {item.commentCount > 0 && (
            <span className="mx-auto -mt-1.5 rounded-full bg-black/50 px-2 text-center text-[11px] font-bold tabular-nums text-white backdrop-blur">
              {formatCount(item.commentCount)}
            </span>
          )}
        </div>

        {/* Keterangan story */}
        {item.caption && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="pointer-events-none absolute inset-x-16 bottom-16 px-2 text-center text-sm font-medium leading-relaxed text-white drop-shadow-lg sm:inset-x-20 sm:bottom-20"
          >
            {item.caption}
          </motion.p>
        )}

        {/* Chip indikator sound: penonton tahu story ini bersound */}
        {item.audio && (
          <span className="pointer-events-none absolute bottom-4 left-3 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur animate-fade-in">
            <Music className="h-3.5 w-3.5" aria-hidden="true" />
            {t("st.sound")}
          </span>
        )}

        {paused && !commentsOpen && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 px-4 py-2 text-xs font-medium text-white backdrop-blur"
          >
            ⏸
          </motion.span>
        )}

        {/* Animasi jantung saat double-tap suka */}
        <AnimatePresence>
          {burst && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.15, 1], opacity: [0, 1, 1] }}
              exit={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 0.55 }}
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            >
              <Heart className="h-24 w-24 fill-rose-500 text-rose-500 drop-shadow-lg" aria-hidden="true" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== Bar balasan bawah (komentar langsung, seperti aplikasi sosial pada umumnya) ===== */}
      <form
        onSubmit={submitReply}
        className="mx-auto flex w-full max-w-md shrink-0 flex-col gap-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2"
      >
        {replyTarget && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur"
          >
            <span className="text-rose-400" aria-hidden="true">↷</span>
            <span className="min-w-0 flex-1 truncate">{t("st.replyTo", { u: replyTarget.comment.author.username })}</span>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="text-white/60 transition-colors hover:text-white"
              aria-label={t("c.cancel")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 backdrop-blur-md">
            <Input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={inputPlaceholder}
              maxLength={500}
              disabled={addComment.isPending}
              aria-label={inputPlaceholder}
              className="h-10 flex-1 border-none bg-transparent text-white placeholder:text-white/60 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!replyText.trim() || addComment.isPending}
              aria-label={t("st.commentSend")}
              className="h-8 w-8 shrink-0 rounded-full bg-transparent text-white shadow-none hover:bg-white/20"
            >
              {addComment.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
          <motion.button
            whileTap={{ scale: 0.85 }}
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label={t("st.comments")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/25"
          >
            <MessageCircle className="h-5 w-5" />
          </motion.button>
        </div>
      </form>

      {/* Komentar story */}
      {commentsOpen && (
        <StoryCommentsSheet
          storyId={item.id}
          me={me ?? null}
          isOwner={!!group.isMe}
          onReply={(c) => {
            setReplyTarget({ comment: c, storyId: item.id });
            setCommentsOpen(false);
          }}
          onClose={() => setCommentsOpen(false)}
        />
      )}

      {/* Detail penonton (story milik sendiri) */}
      {detailOpen && group.isMe && <ViewersSheet storyId={item.id} onClose={() => setDetailOpen(false)} />}
    </motion.div>
  );
}

// ---------- Sheet komentar story (timer story otomatis berhenti selama terbuka) ----------

function StoryCommentsSheet({
  storyId,
  me,
  isOwner,
  onReply,
  onClose,
}: {
  storyId: string;
  me: Me | null;
  isOwner: boolean;
  onReply: (c: StoryComment) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const query = useStoryComments(storyId, true);
  const comments = query.data?.comments ?? [];
  const add = useAddStoryComment();
  const del = useDeleteStoryComment();

  // Susun thread rapi: komentar utama + balasannya (urutan menaik)
  const threads = useMemo(() => {
    const tops = comments.filter((c) => !c.parentId);
    const byParent = new Map<string, StoryComment[]>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const list = byParent.get(c.parentId) ?? [];
      list.push(c);
      byParent.set(c.parentId, list);
    }
    return tops.map((top) => ({ top, replies: byParent.get(top.id) ?? [] }));
  }, [comments]);

  // Gulir ke komentar terbaru (API mengirim urutan menaik, terbaru di bawah)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length, storyId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!me || !value || add.isPending) return;
    setText("");
    add.mutate({ storyId, text: value });
  }

  return (
    <div
      className="absolute inset-0 z-[85] flex items-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("st.comments")}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        className="flex max-h-[70%] w-full flex-col rounded-t-2xl border-t bg-card p-4 sm:mx-auto sm:max-w-md sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">{t("st.comments")}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label="Tutup">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div ref={listRef} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]">
          {query.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("st.noComments")}</p>
          ) : (
            <ul className="space-y-1">
              {threads.map(({ top, replies }) => (
                <li key={top.id}>
                  <StoryCommentRow
                    c={top}
                    me={me}
                    isOwner={isOwner}
                    t={t}
                    onReply={onReply}
                    onDelete={() => del.mutate({ storyId, commentId: top.id })}
                    deletePending={del.isPending}
                  />
                  {replies.length > 0 && (
                    <div className="ml-9 mt-0.5 border-l-2 border-muted pl-3">
                      {replies.map((r) => (
                        <StoryCommentRow
                          key={r.id}
                          c={r}
                          isReply
                          me={me}
                          isOwner={isOwner}
                          t={t}
                          onReply={onReply}
                          onDelete={() => del.mutate({ storyId, commentId: r.id })}
                          deletePending={del.isPending}
                        />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={submit} className="mt-3 flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("st.commentPlaceholder")}
            maxLength={500}
            disabled={!me || add.isPending}
            aria-label={t("st.commentPlaceholder")}
            className="h-9 flex-1 rounded-full border-none bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!me || !text.trim() || add.isPending}
            aria-label={t("st.commentSend")}
            className="h-9 w-9 shrink-0 rounded-full text-rose-500 hover:text-rose-600"
          >
            {add.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
        {!me && <p className="mt-1.5 text-xs text-muted-foreground">{t("st.commentLogin")}</p>}
      </motion.div>
    </div>
  );
}

/** Baris komentar story — rapi: nama+@username, chip "membalas", teks, aksi. */
function StoryCommentRow({
  c,
  isReply,
  me,
  isOwner,
  t,
  onReply,
  onDelete,
  deletePending,
}: {
  c: StoryComment;
  isReply?: boolean;
  me: Me | null;
  isOwner: boolean;
  t: ReturnType<typeof useT>;
  onReply: (c: StoryComment) => void;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const canDelete = c.isMine || isOwner;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("group flex items-start gap-2.5", isReply ? "py-1.5" : "py-2")}
    >
      <a href={`#/u/${encodeURIComponent(c.author.username)}`} className="shrink-0" aria-label={`Profil ${c.author.displayName}`}>
        <UserAvatar name={c.author.displayName} color={c.author.avatarColor} avatar={c.author.avatar} size={isReply ? 26 : 32} />
      </a>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm leading-snug break-words">
          <a href={`#/u/${encodeURIComponent(c.author.username)}`} className="font-semibold hover:underline">
            {c.author.displayName}
          </a>
          {(c.author.role === "ADMIN" || c.author.role === "OWNER") && <AdminBadge role={c.author.role} />}
          <span className="truncate text-xs font-normal text-muted-foreground">@{c.author.username}</span>
        </p>
        {isReply && c.replyTo && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="mr-0.5 text-rose-500/80" aria-hidden="true">↷</span>
            <span className="shrink-0">membalas</span>
            <a href={`#/u/${encodeURIComponent(c.replyTo.username)}`} className="font-medium text-rose-600 hover:underline">
              @{c.replyTo.username}
            </a>
          </p>
        )}
        <p className="mt-0.5 break-words text-sm leading-snug text-foreground/90">{c.text}</p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{timeAgo(c.createdAt)}</span>
          {me && (
            <button
              type="button"
              onClick={() => onReply(c)}
              className="font-semibold transition-colors hover:text-rose-500"
            >
              {t("st.reply")}
            </button>
          )}
        </div>
      </div>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={deletePending}
          aria-label={`${t("c.delete")} (@${c.author.username})`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </motion.div>
  );
}

function ViewersSheet({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const t = useT();
  const query = useStoryDetail(storyId, true);
  const del = useDeleteStory(onClose);
  const [confirmDel, setConfirmDel] = useState(false);
  const detail: StoryDetail | undefined = query.data;

  return (
    <div className="absolute inset-0 z-[85] flex items-end bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        className="max-h-[70%] w-full overflow-y-auto rounded-t-2xl border-t bg-card p-4 sm:mx-auto sm:max-w-md sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">{t("st.viewers", { n: detail?.viewCount ?? 0 })}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label="Tutup">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {query.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : !detail || detail.viewers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("st.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {detail.viewers.map((v) => (
              <motion.li
                key={v.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <a href={`#/u/${encodeURIComponent(v.username)}`} className="flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-accent">
                  <UserAvatar name={v.displayName} color={v.avatarColor} avatar={v.avatar} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      {v.displayName}
                      {(v.role === "ADMIN" || v.role === "OWNER") && <AdminBadge role={v.role} />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">@{v.username} · {timeAgo(v.seenAt)}</span>
                  </span>
                </a>
              </motion.li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t pt-3">
          {confirmDel ? (
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmDel(false)}>
                {t("c.cancel")}
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => del.mutate(storyId)} disabled={del.isPending}>
                {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("c.delete")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => setConfirmDel(true)}>
              <Trash2 className="h-4 w-4" /> {t("st.delete")}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
