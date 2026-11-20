"use client";

// Util UI SkelzHub: avatar gradient, format angka, waktu relatif, kompresi gambar

export const AVATAR_GRADIENTS = [
  "from-rose-400 to-orange-400",
  "from-amber-400 to-red-500",
  "from-emerald-400 to-teal-500",
  "from-fuchsia-400 to-rose-500",
  "from-lime-400 to-emerald-500",
  "from-orange-400 to-pink-500",
  "from-teal-400 to-cyan-500",
  "from-violet-400 to-fuchsia-500",
] as const;

export function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  try {
    return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "baru saja";
  if (sec < 60) return `${sec} dtk`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} mnt`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} jam`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} hari`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week} mgg`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} bln`;
  return `${Math.floor(month / 12)} thn`;
}

// ============================================================
// Kompresi gambar di sisi client — kualitas jadi prioritas.
//
// Teknik yang dipakai supaya hasil TIDAK burik:
//  1. Resize bertahap (halving) — mengecilkan gambar sedikit demi
//     sedikit jauh lebih tajam daripada satu kali resize besar.
//  2. imageSmoothingQuality "high" saat menggambar.
//  3. Kualitas JPEG mulai 0.92 (sebelumnya 0.87) dan hanya diturunkan
//     bila ukuran hasil masih melebihi anggaran byte (maxBytes).
//  4. Gambar dengan transparansi (PNG/WebP alpha) tetap dipertahankan
//     sebagai WebP lossy — tidak dipaksa jadi JPEG yang menghitam.
// ============================================================

export type CompressOpts = {
  /** Sisi terpanjang maksimum hasil (px) */
  maxDim?: number;
  /** Anggaran ukuran hasil (byte) — kualitas diturunkan bertahap hanya bila lewat */
  maxBytes?: number;
};

const MB = 1024 * 1024;

/** Decode gambar apa adanya: ImageBitmap (cepat), fallback <img> (Safari lama). */
async function decodeImage(file: File): Promise<{ src: CanvasImageSource; w: number; h: number } | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (bitmap) return { src: bitmap, w: bitmap.width, h: bitmap.height };
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    const out = { src: img, w: img.naturalWidth, h: img.naturalHeight };
    URL.revokeObjectURL(url);
    return out;
  } catch {
    return null;
  }
}

/** Apakah gambar punya piksel transparan? (sampel 40x40 cukup akurat) */
function hasAlpha(src: CanvasImageSource, w: number, h: number): boolean {
  try {
    const s = 40;
    const c = document.createElement("canvas");
    c.width = s;
    c.height = s;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(src, 0, 0, w, h, 0, 0, s, s);
    const data = ctx.getImageData(0, 0, s, s).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Resize bertahap: kecilkan separuh berulang kali lalu potong presis ke target. */
function resizeProgressive(src: CanvasImageSource, w: number, h: number, tw: number, th: number): HTMLCanvasElement {
  const mk = (cw: number, ch: number) => {
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
    return c;
  };
  let canvas = mk(w, h);
  (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(src, 0, 0, w, h);
  // Halving selama separuh ukuran masih >= target (kualitas lebih tajam)
  while (Math.floor(canvas.width / 2) >= tw && Math.floor(canvas.height / 2) >= th) {
    const nw = Math.max(tw, Math.floor(canvas.width / 2));
    const nh = Math.max(th, Math.floor(canvas.height / 2));
    const next = mk(nw, nh);
    (next.getContext("2d") as CanvasRenderingContext2D).drawImage(canvas, 0, 0, nw, nh);
    canvas = next;
  }
  if (canvas.width !== tw || canvas.height !== th) {
    const final = mk(tw, th);
    (final.getContext("2d") as CanvasRenderingContext2D).drawImage(canvas, 0, 0, tw, th);
    canvas = final;
  }
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/** Kompresi gambar: hasil tetap tajam, ukuran tetap terkendali.
 *
 *  Preset kualitas (2025): sisi terpanjang 2160px (cukup untuk layar
 *  retina penuh), kualitas JPEG/WebP mulai 0.94 — terlihat setara asli,
 *  tetap jauh lebih ringan dari file kamera asli. Turun bertahap HANYA
 *  bila hasil masih melebihi anggaran byte (maxBytes). */
export async function compressImage(file: File, opts: CompressOpts = {}): Promise<Blob> {
  const maxDim = opts.maxDim ?? 2160;
  const maxBytes = opts.maxBytes ?? 6 * MB;

  // GIF animasi: biarkan apa adanya supaya tetap bergerak (file besar pun aman —
  // otomatis dikirim bertahap / chunk oleh api.upload)
  if (file.type === "image/gif") return file;

  if (!file.type.startsWith("image/")) {
    throw new Error("Format gambar tidak didukung (JPEG, PNG, WebP, GIF)");
  }

  const decoded = await decodeImage(file);
  if (!decoded) {
    // Tidak bisa diproses browser: pakai file asli apa adanya (file besar
    // otomatis dikirim bertahap / chunk oleh api.upload)
    return file;
  }
  const { src, w, h } = decoded;

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = resizeProgressive(src, w, h, tw, th);
  const transparent = hasAlpha(src, w, h);
  if (src instanceof ImageBitmap) src.close(); // baru tutup setelah semua drawing selesai

  // Rantai kualitas: mulai paling tajam, turun hanya bila perlu
  const chain: Array<{ mime: string; q: number }> = transparent
    ? [{ mime: "image/webp", q: 0.94 }, { mime: "image/webp", q: 0.87 }, { mime: "image/webp", q: 0.8 }]
    : [
        { mime: "image/jpeg", q: 0.94 },
        { mime: "image/jpeg", q: 0.88 },
        { mime: "image/jpeg", q: 0.82 },
      ];

  let best: Blob | null = null;
  for (const step of chain) {
    const blob = await toBlob(canvas, step.mime, step.q);
    if (!blob) continue; // browser tidak dukung mime ini
    best = blob;
    if (blob.size <= maxBytes) return blob; // cukup kecil & masih tajam
  }
  if (best) return best;

  // WebP tidak didukung (browser lama): PNG (transparan) / JPEG
  if (transparent) {
    const png = await toBlob(canvas, "image/png", 1);
    if (png && png.size <= maxBytes * 2) return png;
  }
  const jpeg = await toBlob(canvas, "image/jpeg", 0.9);
  if (jpeg) return jpeg;
  return file; // fallback terakhir: file asli (chunk upload menangani file besar)
}

/** Preset kompresi khusus chat: tetap tajam (1620px) namun ringan dikirim. */
export async function compressImageForChat(file: File): Promise<Blob> {
  return compressImage(file, { maxDim: 1620, maxBytes: 3.2 * MB });
}

export function fileToPreviewUrl(file: Blob): string {
  return URL.createObjectURL(file);
}

// ============================================================
// Thumbnail server — ?w= pada /api/media/<id>
// Server mengubah gambar jadi WebP sekecil slot yang diminta
// (mis. avatar 96px, feed 640px). Foto kamera 4MB jadi puluhan KB:
// feed/avatar/grid termuat jauh lebih cepat, database tidak kebanjiran.
// Lebar yang diizinkan server: 96, 160, 320, 480, 640, 720, 1080, 1440, 2160.
// ============================================================
const THUMB_WIDTHS = [2160, 1440, 1080, 720, 640, 480, 320, 160, 96];

/** URL media dengan lebar thumbnail: ?w=640 (kalau bukan /api/media -> apa adanya). */
export function mediaThumb(url: string | null | undefined, width: number): string | null | undefined {
  if (!url) return url;
  if (!url.startsWith("/api/media/")) return url; // eksternal: biarkan
  const w = THUMB_WIDTHS.includes(width) ? width : THUMB_WIDTHS.reduce((a, b) => (Math.abs(b - width) < Math.abs(a - width) ? b : a));
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}w=${w}`;
}
