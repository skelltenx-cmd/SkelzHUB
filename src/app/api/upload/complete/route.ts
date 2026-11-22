import { db } from "@/lib/db";
import { jsonError, jsonNoStore, ApiError, requireUserId, readJson, classifyMime, MAX_TOTAL_BYTES } from "@/lib/api-utils";

// POST /api/upload/complete  { key, totalChunks, mimeType }
//
// Tahap terakhir unggah file besar: setelah semua potongan diterima
// /api/upload/chunk, endpoint ini menggabungkannya menjadi SATU baris Media
// (masuk database, sama seperti unggahan kecil) lalu menghapus semua
// potongannya.
//
// Kecepatan & hemat memori: karena tiap potongan berukuran kelipatan 3 byte,
// base64 potongan-potongan itu sejajar — cukup digabung dengan sambung
// string, TANPA decode lalu re-encode seluruh file.
export const maxDuration = 60; // penggabungan file besar butuh waktu lebih panjang

const TOTAL_CHUNKS_LIMIT = 64;
const KEY_RE = /^[a-z0-9-]{8,64}$/;
const MB = 1024 * 1024;

// Bersih-bersih potongan terbengkalai (upload dibatalkan / gagal tengah jalan):
// cukup sekali per 10 menit per instance, aman untuk serverless.
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 10 * 60_000;
function sweepStaleChunks() {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  db.mediaChunk
    .deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 60 * 60_000) } } })
    .catch(() => null); // kegagalan sapuan tidak boleh mengganggu unggahan
}

type CompleteBody = { key?: unknown; totalChunks?: unknown; mimeType?: unknown };

export async function POST(request: Request) {
  try {
    await requireUserId();
    const body = await readJson<CompleteBody>(request);

    const key = typeof body.key === "string" ? body.key : "";
    const totalChunks = Number(body.totalChunks);
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";

    if (!KEY_RE.test(key)) throw new ApiError("Kunci unggahan tidak valid", 400);
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > TOTAL_CHUNKS_LIMIT) {
      throw new ApiError("Jumlah potongan tidak valid", 400);
    }
    if (!mimeType) throw new ApiError("Tipe file tidak diketahui", 400);

    // Validasi format (dan dapatkan kind: IMAGE / VIDEO / AUDIO)
    const cls = classifyMime(mimeType);

    // Ambil semua potongan berurutan
    const chunks = await db.mediaChunk.findMany({
      where: { uploadKey: key },
      orderBy: { index: "asc" },
      select: { index: true, bytes: true, data: true },
    });
    if (chunks.length !== totalChunks) {
      throw new ApiError(
        `Unggahan belum lengkap: ${chunks.length} dari ${totalChunks} potongan diterima. Silakan ulangi unggah.`,
        400
      );
    }
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].index !== i) {
        throw new ApiError("Ada potongan yang hilang. Silakan ulangi unggah.", 400);
      }
    }

    const totalBytes = chunks.reduce((sum, c) => sum + c.bytes, 0);
    const limit = MAX_TOTAL_BYTES[cls.kind];
    if (totalBytes > limit) {
      const capMB = Math.round(limit / MB);
      throw new ApiError(
        `Total ukuran ${cls.kind === "VIDEO" ? "video" : cls.kind === "IMAGE" ? "gambar" : "rekaman"} maksimal ${capMB}MB`,
        400
      );
    }

    // Gabung base64 langsung (aman: tiap potongan kelipatan 3 byte).
    // Setelah string final jadi, referensi potongan SEGERA dibebaskan supaya
    // puncak memori saat insert ke database tetap rendah (penting di fungsi
    // serverless Vercel yang defaultnya 1GB).
    const data = chunks.map((c) => c.data).join("");
    for (const c of chunks) c.data = "";

    const media = await db.media.create({
      data: { mimeType: cls.mime, kind: cls.kind, data },
      select: { id: true, kind: true, mimeType: true },
    });

    // Potongan sudah tidak dibutuhkan — hapus, lalu sapu potongan lama
    await db.mediaChunk.deleteMany({ where: { uploadKey: key } }).catch(() => null);
    sweepStaleChunks();

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
