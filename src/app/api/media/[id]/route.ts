import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

// CATATAN PENTING COLD-START: AWS SDK (r2) dan sharp HANYA diimpor saat
// benar-benar dipakai (dynamic import). Jalur paling sering dipakai (302 ke
// CDN publik / 304 browser / base64 dari cache memori) jalan TANPA memuat
// library berat — route ini jauh lebih cepat bangun dari dingin. Fungsi kecil
// dari lib/r2 disalin singkat di sini supaya tidak menarik seluruh SDK.

type Params = { params: Promise<{ id: string }> };

// Memuat media besar dari database bisa makan waktu lebih dari default —
// naikkan durasi maksimum route ini agar video besar tetap lancar.
export const maxDuration = 60;

const R2_ON =
  !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
function r2PublicUrlOf(key: string): string | null {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}
/** Modul r2 (AWS SDK) dimuat hanya saat jalur proxy/thumbnail dipakai. */
async function r2Helpers() {
  return import("@/lib/r2");
}

// Deteksi MIME asli dari awal base64 (menghindari mismatch dari data lama)
function sniffMime(base64: string, fallback: string): string {
  const prefix = base64.slice(0, 16);
  if (prefix.startsWith("/9j/")) return "image/jpeg"; // FF D8 FF
  if (prefix.startsWith("iVBOR")) return "image/png"; // 89 50 4E 47
  if (prefix.startsWith("R0lGOD")) return "image/gif"; // GIF87a/GIF89a
  if (prefix.startsWith("UklGR")) return "image/webp"; // RIFF....WEBP
  return fallback || "image/jpeg";
}

// ============================================================
// CACHE PERFORMA (3 lapis):
//
//  1. ETag + 304        : browser menyimpan file; buka ulang = tanpa
//                         unduh ulang, server balas 304 instan.
//  2. Cache memori LRU  : pemutaran video mengirim BANYAK request Range;
//                         cache membuat request berikutnya instan dan
//                         database tidak dikganggu lagi.
//  3. Cache gate privasi: keputusan "media ini milik post publik?" hanya
//                         dihitung sekali lalu diingat 5 menit — jauh
//                         lebih ringan daripada query tiap request.
// ============================================================

const CACHE_BUDGET_BYTES = 192 * 1024 * 1024;
type CacheEntry = { buffer: Buffer; contentType: string; total: number };
const mediaCache = new Map<string, CacheEntry>();

function cacheGet(id: string): CacheEntry | null {
  const entry = mediaCache.get(id);
  if (!entry) return null;
  // sentuh: pindahkan ke posisi "terbaru" (paling tahan terhadap pembuangan)
  mediaCache.delete(id);
  mediaCache.set(id, entry);
  return entry;
}

function cacheSet(id: string, entry: CacheEntry) {
  mediaCache.delete(id);
  mediaCache.set(id, entry);
  let used = 0;
  for (const e of mediaCache.values()) used += e.total;
  while (used > CACHE_BUDGET_BYTES && mediaCache.size > 1) {
    const oldest = mediaCache.keys().next().value as string;
    const evicted = mediaCache.get(oldest);
    if (evicted) used -= evicted.total;
    mediaCache.delete(oldest);
  }
}

// ---- Cache "gate" privasi (mediaId -> publik?) TTL 5 menit ----
type GateEntry = { ownerPrivate: boolean; owner: string | null; expiresAt: number };
const gateCache = new Map<string, GateEntry>();
const GATE_TTL_MS = 5 * 60 * 1000;
const GATE_MAX = 4096;

/** Cek apakah media ini milik post akun privat — hasil di-cache 5 menit. */
async function mediaOwnerPrivate(id: string): Promise<GateEntry> {
  const hit = gateCache.get(id);
  if (hit && hit.expiresAt > Date.now()) return hit;
  const owningPost = await db.post.findFirst({
    where: { mediaId: id },
    select: { authorId: true, author: { select: { isPrivate: true } } },
  });
  const entry: GateEntry = {
    owner: owningPost?.authorId ?? null,
    ownerPrivate: owningPost ? owningPost.author.isPrivate : false,
    expiresAt: Date.now() + GATE_TTL_MS,
  };
  if (gateCache.size > GATE_MAX) gateCache.clear();
  gateCache.set(id, entry);
  return entry;
}

/** Izinkan permintaan ini melihat media (privat = hanya pengikut disetujui). */
async function mediaAllowed(id: string): Promise<boolean> {
  const gate = await mediaOwnerPrivate(id);
  if (!gate.ownerPrivate) return true;
  const viewerId = await getSessionUserId();
  if (viewerId === gate.owner) return true;
  if (!viewerId) return false;
  const f = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: gate.owner as string } },
    select: { status: true },
  });
  return f?.status === "ACCEPTED";
}

// ---- Lebar thumbnail yang diizinkan (?w=) ----
const ALLOWED_WIDTHS = new Set([96, 160, 320, 480, 640, 720, 1080, 1440, 2160]);
/** Cache thumbnail (id+w) terpisah & lebih kecil anggarannya. */
const THUMB_BUDGET_BYTES = 64 * 1024 * 1024;
type ThumbEntry = { buffer: Buffer; contentType: string; total: number };
const thumbCache = new Map<string, ThumbEntry>();

function thumbGet(key: string): ThumbEntry | null {
  const entry = thumbCache.get(key);
  if (!entry) return null;
  thumbCache.delete(key);
  thumbCache.set(key, entry);
  return entry;
}

function thumbSet(key: string, entry: ThumbEntry) {
  thumbCache.delete(key);
  thumbCache.set(key, entry);
  let used = 0;
  for (const e of thumbCache.values()) used += e.total;
  while (used > THUMB_BUDGET_BYTES && thumbCache.size > 1) {
    const oldest = thumbCache.keys().next().value as string;
    const evicted = thumbCache.get(oldest);
    if (evicted) used -= evicted.total;
    thumbCache.delete(oldest);
  }
}

/** Buat thumbnail webp dari buffer gambar (auto-rotate EXIF, tanpa perbesar).
 *  Kualitas 86: tetap tajam di layar retina, ukuran tetap kecil. */
async function makeThumb(buffer: Buffer, width: number): Promise<ThumbEntry | null> {
  try {
    // sharp dimuat lazy: request tanpa thumbnail tidak perlu memuatnya
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default ?? (sharpMod as unknown as { default: typeof sharpMod });
    const out = await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    return { buffer: out, contentType: "image/webp", total: out.length };
  } catch {
    return null;
  }
}

function ifNoneMatchHit(request: Request, etag: string): boolean {
  const inm = request.headers.get("if-none-match");
  if (!inm) return false;
  return inm
    .split(",")
    .map((s) => s.trim().replace(/^W\//, ""))
    .some((tag) => tag === etag || tag === "*");
}

const IMMUTABLE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
} as const;

function notFound() {
  return new Response("Not found", { status: 404 });
}

// GET /api/media/[id]            -> binary media (gambar/video)
// GET /api/media/[id]?w=640       -> thumbnail gambar (webp, tajam & ringan)
//
// Ada TIGA sumber media, dipilih otomatis per baris Media:
//  1. R2 + URL publik  : 302 langsung ke CDN Cloudflare (paling cepat —
//                        edge global + cache browser permanen).
//  2. R2 tanpa URL pub : dialirkan (proxy) dari R2 dengan dukungan Range,
//                        tetap cepat karena tanpa database.
//  3. base64 database  : jalur lama + cache memori LRU (kompibilitas
//                        media lama sebelum R2 dipasang).
// + Cache-Control permanen untuk semua jenis — browser menyimpan
//   file yang sudah dilihat sehingga buka ulang = instan.
// + ?w= pada gambar: di-resize server jadi webp kecil (feed/avatar/grid)
//   — foto kamera 5MB jadi thumbnail puluhan KB, feed jadi jauh lebih cepat.
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;

  if (!/^[a-z0-9]{10,}$/i.test(id)) return notFound();

  // Lebar thumbnail (hanya untuk gambar)
  const wRaw = new URL(request.url).searchParams.get("w");
  const w = wRaw ? parseInt(wRaw, 10) : 0;
  const wantsThumb = ALLOWED_WIDTHS.has(w);
  const etag = wantsThumb ? `"${id}-w${w}"` : `"${id}"`;

  // Browser sudah punya filenya? -> cukup pastikan masih boleh lihat, lalu
  // balas 304 TANPA membuka media sama sekali (sangat cepat).
  if (ifNoneMatchHit(request, etag)) {
    if (!(await mediaAllowed(id))) return new Response("Forbidden", { status: 403 });
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, ...IMMUTABLE_HEADERS },
    });
  }

  // Gate privasi ringan (hasil di-cache, biasanya tanpa query sama sekali)
  if (!(await mediaAllowed(id))) return new Response("Forbidden", { status: 403 });

  // ---- Thumbnail gambar (?w=) ----
  if (wantsThumb) {
    const key = `${id}:${w}`;
    let thumb = thumbGet(key);
    if (!thumb) {
      // Buffer penuh mungkin sudah di cache (mis. baru saja diputar) — pakai.
      const cachedFull = cacheGet(id);
      let source: Buffer | null = cachedFull ? cachedFull.buffer : null;
      let isImage = true;
      if (!source) {
        const media = await db.media.findUnique({ where: { id } });
        if (!media) return notFound();
        isImage = media.kind === "IMAGE";
        if (isImage) {
          if (media.r2Key && R2_ON) {
            const { getR2ObjectBuffer } = await r2Helpers();
            const r2 = await getR2ObjectBuffer(media.r2Key);
            source = r2?.buffer ?? null;
          } else if (media.data) {
            source = Buffer.from(media.data, "base64");
          }
          if (source && source.length > 0) {
            cacheSet(id, {
              buffer: source,
              contentType: sniffMime(media.data ?? "", media.mimeType),
              total: source.length,
            });
          }
        }
      }
      if (!isImage) {
        // video/audio tidak di-resize — teruskan tanpa param
        return Response.redirect(new URL(`/api/media/${id}`, request.url).toString(), 302);
      }
      if (!source || source.length === 0) return notFound();
      thumb = (await makeThumb(source, w)) ?? null;
      if (!thumb) return notFound();
      thumbSet(key, thumb);
    }
    return new Response(new Uint8Array(thumb.buffer), {
      headers: {
        "Content-Type": thumb.contentType,
        ETag: etag,
        ...IMMUTABLE_HEADERS,
        "Content-Length": String(thumb.buffer.length),
      },
    });
  }

  // Media base64 yang sudah pernah dimuat: ambil dari cache memori (instan)
  let entry = cacheGet(id);
  if (!entry) {
    const media = await db.media.findUnique({ where: { id } });
    if (!media) return notFound();

    // ---- (1) Media R2 dengan URL publik: redirect ke CDN Cloudflare ----
    // (browser lalu menyimpan hasilnya — reload berikutnya nyaris instan)
    if (media.r2Key && R2_ON) {
      const publicUrl = r2PublicUrlOf(media.r2Key);
      if (publicUrl) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: publicUrl,
            // Browser menyimpan redirect ini 1 hari; s-maxage memberi tahu
            // Cloudflare untuk juga menyimpannya di edge (lihat Cache Rules)
            // -> user lain di Indonesia langsung kena cache, tanpa menyentuh
            // server Vercel sama sekali.
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      }

      // ---- (2) Media R2 tanpa URL publik: alirkan dari R2 (proxy) ----
      const range = request.headers.get("range");
      const { getR2ObjectStream } = await r2Helpers();
      const r2 = await getR2ObjectStream(media.r2Key, range);
      if (!r2 || !r2.stream) return new Response("Media tidak tersedia", { status: 404 });

      const headers: Record<string, string> = {
        "Content-Type": r2.contentType ?? media.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      };
      if (r2.contentLength != null) headers["Content-Length"] = String(r2.contentLength);
      if (r2.contentRange) headers["Content-Range"] = r2.contentRange;

      return new Response(r2.stream, { status: r2.status, headers });
    }

    // Media remote (mis. video shorts seed): redirect ke URL aslinya
    if (!media.data && media.externalUrl) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: media.externalUrl,
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    const buffer = Buffer.from(media.data ?? "", "base64");
    const total = buffer.length;
    if (total === 0) return new Response("Media kosong", { status: 404 });
    // IMAGE: deteksi MIME asli dari base64 (hindari mismatch data lama).
    // VIDEO & AUDIO (pesan suara): pakai mimeType tersimpan apa adanya.
    const contentType =
      media.kind === "IMAGE" ? sniffMime(media.data ?? "", media.mimeType) : media.mimeType;

    entry = { buffer, contentType, total };
    cacheSet(id, entry);
  }

  const headers: Record<string, string> = {
    "Content-Type": entry.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    ETag: etag,
  };

  // Range request (diperlukan agar video bisa di-seek / streaming)
  const range = request.headers.get("range");
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), entry.total - 1) : entry.total - 1;
      if (start <= end && start < entry.total) {
        const chunk = entry.buffer.subarray(start, end + 1);
        return new Response(new Uint8Array(chunk), {
          status: 206,
          headers: {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${entry.total}`,
            "Content-Length": String(chunk.length),
          },
        });
      }
    }
  }

  const body = new Uint8Array(entry.buffer);
  return new Response(body, {
    headers: {
      ...headers,
      "Content-Length": String(body.length),
    },
  });
}
