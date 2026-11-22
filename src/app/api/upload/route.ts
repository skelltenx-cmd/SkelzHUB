import { db } from "@/lib/db";
import { jsonError, jsonNoStore, ApiError, requireUserId, readFileFromRequest } from "@/lib/api-utils";

// POST /api/upload  (multipart: file)
// Endpoint unggahan media untuk SEMUA fitur: post, story, foto profil,
// lampiran chat, dan pesan suara. Menyimpan bytes sebagai base64 di tabel
// Media lalu mengembalikan mediaId yang dipakai endpoint lain.
//
// Batas ukuran otomatis menyesuaikan lingkungan (Vercel serverless ~4.4MB)
// — validasi ada di readFileFromRequest supaya pesan error-nya jelas.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireUserId();
    const { buffer, mime, kind } = await readFileFromRequest(request);

    const media = await db.media.create({
      data: {
        mimeType: mime,
        kind,
        data: buffer.toString("base64"),
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
