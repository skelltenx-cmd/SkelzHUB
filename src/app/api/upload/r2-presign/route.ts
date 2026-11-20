import { jsonError, jsonNoStore, ApiError, requireUserId, readJson, classifyMime } from "@/lib/api-utils";
import { isR2Enabled, buildR2Key, presignR2Upload, R2_MAX_UPLOAD_BYTES } from "@/lib/r2";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

const MB = 1024 * 1024;

// ============================================================
// POST /api/upload/r2-presign   { filename, mimeType, size }
//
// Langkah 1 unggah Cloudflare R2: browser minta URL presigned.
// Setelah itu browser meng-PUT file LANGSUNG ke R2 (tidak lewat
// server SkelzHub) sehingga batas body request Vercel ~4.5MB
// TIDAK BERLAKU — file sampai 5GB pun aman.
//
// GET /api/upload/r2-presign
//   -> { enabled: boolean } (deteksi: pakai R2 atau jalur database)
// ============================================================

type PresignBody = { filename?: unknown; mimeType?: unknown; size?: unknown };

export async function GET() {
  return jsonNoStore({ enabled: isR2Enabled() });
}

export async function POST(request: Request) {
  try {
    await requireUserId();

    if (!isR2Enabled()) {
      throw new ApiError("Penyimpanan R2 belum diaktifkan di server", 501);
    }

    const body = await readJson<PresignBody>(request);
    const mimeType = typeof body.mimeType === "string" && body.mimeType ? body.mimeType : "image/jpeg";
    const size = Number(body.size);

    if (!Number.isFinite(size) || size < 1) throw new ApiError("Ukuran file tidak valid", 400);
    if (size > R2_MAX_UPLOAD_BYTES) {
      throw new ApiError("Ukuran maksimal 5GB per file", 400);
    }

    // Validasi format + jenis (IMAGE / VIDEO / AUDIO)
    const cls = classifyMime(mimeType);

    // Kunci objek dibuat SERVER (bukan client) supaya tidak bisa ditebak
    const key = buildR2Key(cls.kind, cls.mime);
    const uploadUrl = await presignR2Upload(key, cls.mime);

    return jsonNoStore({
      uploadUrl,
      key,
      kind: cls.kind,
      mimeType: cls.mime,
      maxBytes: R2_MAX_UPLOAD_BYTES,
      maxBytesMB: Math.round(R2_MAX_UPLOAD_BYTES / MB),
    });
  } catch (err) {
    return jsonError(err);
  }
}
