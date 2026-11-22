import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";

// ============================================================
// Cloudflare R2 — penyimpanan media SkelzHub (S3-compatible API)
//
// Kenapa R2?
//  - Upload LANGSUNG dari browser ke R2 lewat URL presigned:
//    tidak lagi terhalang batas body request Vercel (~4.5MB) →
//    file praktis TANPA BATAS (sampai 5GB sekali kirim).
//  - Media dilayani dari R2/CDN Cloudflare (edge global) →
//    story/short/post tampil super cepat, database tetap ringan.
//  - 10GB pertama gratis + biaya keluar (egress) 0 — cocok untuk
//    social media yang banyak diputar ulang.
//
// Cara kerja (3 langkah, dua yang pertama tanpa lewat server app):
//  1. Browser minta URL presigned  -> POST /api/upload/r2-presign
//  2. Browser PUT file LANGSUNG    -> ke URL R2 (progress real)
//  3. Browser konfirmasi selesai    -> POST /api/upload/r2-complete
//     (server cek file benar-benar ada lalu buat baris Media)
//
// Media tetap bisa dilayani dari database (base64) bila R2 belum
// dikonfigurasi — semua fitur tetap jalan tanpa env R2 (mode
// kompatibilitas untuk pengembangan lokal).
//
// Env yang dibutuhkan (Vercel → Settings → Environment Variables):
//  R2_ACCOUNT_ID       : ID akun Cloudflare (dashboard kanan bawah)
//  R2_ACCESS_KEY_ID    : Access Key dari API Token R2
//  R2_SECRET_ACCESS_KEY: Secret Key dari token yang sama
//  R2_BUCKET           : nama bucket (mis. skelzhub-media)
//  R2_PUBLIC_URL       : URL publik bucket (opsional tapi disarankan,
//                        contoh https://pub-xxx.r2.dev atau domain custom
//                        https://media.domainmu.com). Kalau kosong, media
//                        R2 dialirkan lewat /api/media/[id] tetap jalan.
// ============================================================

const MAX_PRESIGN_SECONDS = 15 * 60; // URL upload hangus 15 menit
/** Batas satu PUT presigned di R2 = 5GB ( praktis "tanpa batas"). */
export const R2_MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

/** Apakah R2 aktif? (semua env wajib terisi) */
export function isR2Enabled(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

/** URL publik media (jika bucket punya domain publik). null jika belum diatur. */
export function r2PublicUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  const clean = base.replace(/\/+$/, "");
  return `${clean}/${key.replace(/^\/+/, "")}`;
}

let cachedClient: S3Client | null = null;

/** Klien S3-compatible untuk R2 (singleton). */
export function r2Client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return cachedClient;
}

// ---------- Penamaan kunci objek ----------

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/3gpp": "3gp",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
};

/**
 * Kunci objek unik: skelzhub/{jenis}/{tahun-bulan}/{acak}.{ext}
 * Contoh: skelzhub/video/2025-07/c7f3a9b2d1e4.mp4
 * (rapi dikelompokkan, tidak bisa ditebak, aman dipakai di URL CDN)
 */
export function buildR2Key(kind: string, mimeType: string): string {
  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  const now = new Date();
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rand = randomBytes(10).toString("hex");
  const folder = kind === "VIDEO" ? "video" : kind === "AUDIO" ? "audio" : "image";
  return `skelzhub/${folder}/${ym}/${rand}.${ext}`;
}

/** Validasi kunci yang dikirim balik client (harus buatan server kita). */
const R2_KEY_RE = /^skelzhub\/(image|video|audio)\/\d{6}\/[a-f0-9]{20}\.[a-z0-9]{2,5}$/;
export function isValidR2Key(key: string): boolean {
  return R2_KEY_RE.test(key);
}

// ---------- Operasi R2 ----------

/** URL presigned untuk PUT langsung dari browser (hanya 1 klien yang pakai: browser pengunggah). */
export async function presignR2Upload(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client(), cmd, { expiresIn: MAX_PRESIGN_SECONDS });
}

/** Cek objek benar-benar ada di R2 + ukurannya (mencegah "complete" tanpa upload). */
export async function headR2Object(key: string): Promise<{ size: number } | null> {
  try {
    const out = await r2Client().send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
    );
    return { size: out.ContentLength ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Ambil isi objek R2 sebagai buffer penuh (dipakai untuk membuat thumbnail
 * gambar dengan sharp — ukuran kecil hasil resize, bukan file aslinya).
 */
export async function getR2ObjectBuffer(
  key: string
): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  try {
    const out = await r2Client().send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
    );
    const bytes = await (out.Body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray?.();
    if (!bytes) return null;
    return { buffer: Buffer.from(bytes), contentType: out.ContentType ?? null };
  } catch {
    return null;
  }
}

/**
 * Ambil isi objek R2 (proxy /api/media/[id] saat bucket tidak punya URL publik).
 * Range opsional untuk streaming video (seek): "bytes=0-999" dll.
 */
export async function getR2ObjectStream(
  key: string,
  range?: string | null
): Promise<{
  status: number;
  stream: ReadableStream | null;
  contentType: string | null;
  contentLength: number | null;
  contentRange: string | null;
} | null> {
  try {
    const out = await r2Client().send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        ...(range ? { Range: range } : {}),
      })
    );
    // SDK mengembalikan stream Node; ubah ke Web Stream agar bisa dipakai Response
    const body = out.Body as { transformToWebStream?: () => ReadableStream } | undefined;
    const stream = body?.transformToWebStream?.() ?? null;
    return {
      status: range ? 206 : 200,
      stream,
      contentType: out.ContentType ?? null,
      contentLength: out.ContentLength ?? null,
      contentRange: out.ContentRange ?? null,
    };
  } catch {
    return null;
  }
}
