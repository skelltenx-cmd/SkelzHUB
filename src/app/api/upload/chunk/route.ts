import { db } from "@/lib/db";
import { jsonError, jsonNoStore, ApiError, requireUserId } from "@/lib/api-utils";

// POST /api/upload/chunk  (multipart: key, index, total, file)
//
// Jalur unggah file BESAR (di atas ~4MB): browser memecah file menjadi
// potongan-potongan lalu mengirim satu per satu ke endpoint ini. Setelah
// semua potongan tiba, /api/upload/complete menggabungkannya jadi satu Media.
//
// Syarat penting: setiap potongan (KECUALI potongan terakhir) harus berukuran
// kelipatan 3 byte supaya hasil base64 tiap potongan sejajar dan bisa
// digabung dengan sekali sambung string — tanpa decode/re-encode ulang
// (cepat & hemat memori). Browser selalu memakai potongan 4.194.399 byte
// (4MB-1, kelipatan 3, aman di bawah batas request serverless Vercel ~4.5MB).
export const maxDuration = 60; // koneksi lambat (3G) tetap aman

const CHUNK_BYTES_LIMIT = 4.4 * 1024 * 1024; // sedikit di bawah batas platform
const TOTAL_CHUNKS_LIMIT = 64; // 64 x ~4MB = ~268MB per file
const KEY_RE = /^[a-z0-9-]{8,64}$/;

export async function POST(request: Request) {
  try {
    await requireUserId();
    const form = await request.formData();
    const key = String(form.get("key") ?? "");
    const index = Number(form.get("index"));
    const total = Number(form.get("total"));
    const file = form.get("file");

    if (!KEY_RE.test(key)) throw new ApiError("Kunci unggahan tidak valid", 400);
    if (!Number.isInteger(index) || index < 0 || index >= TOTAL_CHUNKS_LIMIT) {
      throw new ApiError("Nomor potongan tidak valid", 400);
    }
    if (!Number.isInteger(total) || total < 1 || total > TOTAL_CHUNKS_LIMIT) {
      throw new ApiError("Jumlah potongan tidak valid", 400);
    }
    if (index >= total) throw new ApiError("Nomor potongan melebihi jumlah total", 400);
    if (!file || typeof file === "string") throw new ApiError("File tidak ditemukan", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) throw new ApiError("Potongan kosong", 400);
    if (buffer.length > CHUNK_BYTES_LIMIT) throw new ApiError("Ukuran potongan terlalu besar", 400);
    // Potongan selain terakhir WAJIB kelipatan 3 (base64 sejajar).
    if (index < total - 1 && buffer.length % 3 !== 0) {
      throw new ApiError("Ukuran potongan harus kelipatan 3 byte", 400);
    }

    // Upsert: kirim ulang potongan yang sama (mis. setelah koneksi putus) aman
    await db.mediaChunk.upsert({
      where: { uploadKey_index: { uploadKey: key, index } },
      create: {
        uploadKey: key,
        index,
        bytes: buffer.length,
        data: buffer.toString("base64"),
      },
      update: {
        bytes: buffer.length,
        data: buffer.toString("base64"),
      },
    });

    return jsonNoStore({ ok: true, index, total });
  } catch (err) {
    return jsonError(err);
  }
}
