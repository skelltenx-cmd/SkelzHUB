"use client";

import { useRef, useState, useEffect } from "react";
import { Clapperboard, ImageIcon, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api, uploadCaps } from "@/lib/api";
import type { Me, Post } from "@/lib/types";
import { useCreatePost } from "../hooks";
import { compressImage, fileToPreviewUrl } from "../utils";

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/3gpp"];

function LoginGate() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
      <Sparkles className="h-10 w-10 text-rose-500" />
      <h1 className="text-lg font-bold">Login dulu untuk posting</h1>
      <p className="text-sm text-muted-foreground">
        Buat akun gratis dan bagikan meme, momen, atau video Shorts terbaikmu.
      </p>
      <div className="flex gap-2">
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

type PickedFile = {
  file: File;
  kind: "IMAGE" | "VIDEO";
  previewUrl: string;
};

export function CreateView({ me }: { me: Me | null }) {
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [caption, setCaption] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  // Batas unggahan aktif: R2 aktif = "hingga 5GB", database = "maks 200MB"
  const [maxVideoLabel, setMaxVideoLabel] = useState("");
  // DUA input terpisah (dropzone sr-only + tombol "Ganti media") — berbagi satu
  // ref membuat ref-nya ter-null saat input yang satu unmount (tombol Ganti
  // media jadi mati setelah pilih pertama). Sekarang masing-masing punya ref.
  const inputRef = useRef<HTMLInputElement>(null);
  const swapRef = useRef<HTMLInputElement>(null);
  const createPost = useCreatePost((post: Post) => {
    toast({
      title: post.type === "VIDEO" ? "Shorts berhasil dibagikan!" : "Post berhasil dibagikan!",
      description: "Kontenmu sekarang bisa dilihat semua orang.",
    });
    reset();
    window.location.hash = post.type === "VIDEO" ? "#/shorts" : "#/";
  });

  useEffect(() => {
    document.title = "Buat Post · SkelzHub";
    uploadCaps()
      .then((caps) => setMaxVideoLabel(caps.r2 ? "hingga 5GB" : "maks 200MB"))
      .catch(() => setMaxVideoLabel("maks 200MB"));
  }, []);

  if (!me) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <LoginGate />
      </div>
    );
  }

  function reset() {
    if (picked) URL.revokeObjectURL(picked.previewUrl);
    setPicked(null);
    setCaption("");
    if (inputRef.current) inputRef.current.value = "";
    if (swapRef.current) swapRef.current.value = "";
  }

  async function acceptFile(f: File | undefined | null) {
    if (!f) return;
    // Batas ukuran mengikuti jalur yang aktif: R2 (CDN) = 5GB, database = 200MB
    const caps = await uploadCaps();
    if (f.type.startsWith("video/")) {
      if (!VIDEO_TYPES.includes(f.type)) {
        toast({ title: "Format video tidak didukung", description: "Pilih video MP4, WebM, atau MOV" });
        return;
      }
      if (f.size > caps.video) {
        toast({
          title: "Video terlalu besar",
          description: caps.r2 ? "Maksimal 5GB per video" : "Maksimal 200MB per video",
        });
        return;
      }
      setPicked({ file: f, kind: "VIDEO", previewUrl: fileToPreviewUrl(f) });
      return;
    }
    // Di beberapa HP Android, file galeri tidak punya MIME -> anggap gambar jika ada ekstensi gambar
    const looksImage =
      f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);
    if (!looksImage) {
      toast({ title: "File tidak didukung", description: "Pilih gambar (JPEG, PNG, WebP, GIF) atau video (MP4, WebM, MOV)" });
      return;
    }
    if (f.size > caps.image) {
      toast({ title: "Gambar terlalu besar", description: caps.r2 ? "Maksimal 5GB sebelum kompresi" : "Maksimal 60MB sebelum kompresi" });
      return;
    }
    setPicked({ file: f, kind: "IMAGE", previewUrl: fileToPreviewUrl(f) });
  }

  async function submit() {
    if (!picked || uploading || processing || createPost.isPending) return;
    // Tahap saat ini (dipakai untuk judul toast yang tepat bila gagal)
    let stage: "upload" | "post" = "upload";
    try {
      setUploading(true);
      setProgress(0);
      let blob: Blob = picked.file;
      if (picked.kind === "IMAGE") {
        blob = await compressImage(picked.file);
      }
      const uploaded = await api.upload(
        blob,
        picked.file.name || (picked.kind === "VIDEO" ? "video.mp4" : "gambar.jpg"),
        (pct) => setProgress(pct)
      );
      if (uploaded.kind !== picked.kind) {
        throw new Error("Tipe media tidak cocok, coba unggah ulang");
      }
      // Unggahan selesai -> fase "Memproses" (membuat post-nya), bukan
      // "Mengunggah 100%" yang membingungkan.
      stage = "post";
      setUploading(false);
      setProcessing(true);
      await createPost.mutateAsync({ caption, mediaId: uploaded.mediaId });
    } catch (err) {
      // Tahap UNGGAH: toast di sini. Tahap BUAT POST: onError milik
      // useCreatePost sudah menampilkan toast sendiri ("Gagal membagikan
      // post") — kalau ikut di-toast di sini jadi dobel.
      if (stage === "upload") {
        const msg = (err as Error).message || "Terjadi kesalahan, coba lagi";
        toast({ title: "Gagal mengunggah", description: msg });
      }
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  }

  const busy = uploading || processing || createPost.isPending;

  return (
    <div className="mx-auto w-full max-w-[470px] px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Buat post baru</h1>
        {picked && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground" disabled={busy}>
            <X className="h-4 w-4" /> Batal
          </Button>
        )}
      </div>

      {!picked ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "mx-auto flex aspect-square w-full max-w-[470px] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed bg-card text-muted-foreground transition-colors hover:border-rose-400/70 hover:text-foreground",
            dragActive && "border-rose-500 bg-accent"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,video/x-matroska,video/3gpp"
            className="sr-only"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap justify-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15">
              <ImageIcon className="h-8 w-8 text-rose-500" />
            </span>
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-400/15 to-amber-400/15">
              <Clapperboard className="h-8 w-8 text-orange-500" />
            </span>
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Tarik gambar atau video ke sini</p>
            <p className="mt-1 text-sm">atau klik untuk memilih dari perangkatmu</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {"Gambar otomatis dikompresi (kualitas terjaga) · Video MP4/WebM/MOV " + (maxVideoLabel || "maks 200MB")}
            </p>
          </div>
        </label>
      ) : (
        <div className="mx-auto w-full overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="relative bg-black">
            {picked.kind === "VIDEO" ? (
              <video
                src={picked.previewUrl}
                controls
                muted
                playsInline
                className="aspect-square w-full bg-black object-contain"
                aria-label="Pratinjau video"
              />
            ) : (
              <img src={picked.previewUrl} alt="Pratinjau unggahan" className="aspect-square w-full object-cover" />
            )}
            <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
              {picked.kind === "VIDEO" ? "Video Shorts" : "Gambar"}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="absolute right-3 top-3 rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
              onClick={() => swapRef.current?.click()}
              disabled={busy}
            >
              Ganti media
            </Button>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <label htmlFor="caption" className="mb-1.5 block text-sm font-medium">
                Keterangan
              </label>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Tulis keterangan seru... pakai #SkelzHub biar makin dikenal!"
                className="min-h-[90px] resize-none"
                maxLength={2200}
                disabled={busy}
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">{caption.length}/2200</div>
            </div>
            <Button
              onClick={submit}
              disabled={busy}
              className="relative w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
              size="lg"
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> {uploading ? `Mengunggah ${progress}%` : "Memproses..."}
                  {uploading && (
                    <span className="absolute inset-x-4 bottom-1 h-1 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
                      <span className="block h-full bg-white transition-[width] duration-200" style={{ width: `${progress}%` }} />
                    </span>
                  )}
                </>
              ) : (
                picked.kind === "VIDEO" ? "Bagikan ke Shorts" : "Bagikan"
              )}
            </Button>
          </div>
        </div>
      )}

      <input
        ref={swapRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime,video/x-matroska,video/3gpp"
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
    </div>
  );
}
