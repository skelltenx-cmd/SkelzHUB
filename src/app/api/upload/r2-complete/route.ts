import { db } from "@/lib/db";
import { jsonError, jsonNoStore, ApiError, requireUserId, readJson, classifyMime } from "@/lib/api-utils";
import { isR2Enabled, isValidR2Key, headR2Object, R2_MAX_UPLOAD_BYTES } from "@/lib/r2";

// ============================================================
// POST /api/upload/r2-complete   { key, mimeType }
//
// Langkah terakhir unggah R2: setelah browser berhasil PUT file
// ke R2, endpoint ini memverifikasi file BENAR-BENAR ada di R2
// (HeadObject) lalu membuat baris Media yang menunjuk ke kunci R2.
// Setelah itu media dilayani dari CDN — database tetap ringan
// (tidak ada lagi base64 raksasa di CockroachDB).
// ============================================================

export const maxDuration = 30;

type CompleteBody = { key?: unknown; mimeType?: unknown };

export async function POST(request: Request) {
  try {
    await requireUserId();

    if (!isR2Enabled()) {
      throw new ApiError("Penyimpanan R2 belum diaktifkan di server", 501);
    }

    const body = await readJson<CompleteBody>(request);
    const key = typeof body.key === "string" ? body.key : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";

    if (!isValidR2Key(key)) throw new ApiError("Kunci unggahan R2 tidak valid", 400);
    if (!mimeType) throw new ApiError("Tipe file tidak diketahui", 400);

    // Validasi format + jenis (IMAGE / VIDEO / AUDIO)
    const cls = classifyMime(mimeType);

    // Pastikan jenis folder kunci cocok dengan tipe file yang diklaim
    const folder = key.split("/")[1]; // image | video | audio
    if (folder !== cls.kind.toLowerCase()) {
      throw new ApiError("Tipe file tidak cocok dengan unggahan", 400);
    }

    // Verifikasi objek sungguhan ada di R2 (mencegah complete tanpa upload)
    const head = await headR2Object(key);
    if (!head || head.size < 1) {
      throw new ApiError(
        "File belum diterima penyimpanan. Coba ulangi unggah (langkah kirim ke penyimpanan gagal).",
        400
      );
    }
    if (head.size > R2_MAX_UPLOAD_BYTES) {
      throw new ApiError("Ukuran maksimal 5GB per file", 400);
    }

    const media = await db.media.create({
      data: {
        mimeType: cls.mime,
        kind: cls.kind,
        data: null, // isi file ada di R2 — database hanya menyimpan kunci
        r2Key: key,
      },
      select: { id: true, kind: true, mimeType: true },
    });

    return jsonNoStore({
      mediaId: media.id,
      url: `/api/media/${media.id}`,
      kind: media.kind,
      mimeType: media.mimeType,
    });
  } catch (err) {
    return jsonError(err);
  }
}
