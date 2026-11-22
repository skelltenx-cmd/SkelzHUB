import { db } from "@/lib/db";
import { jsonError, ApiError, requireUser, readJson, changeOwnPassword, toUserDTO, userInclude } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// PATCH /api/me -> pengaturan akun sendiri
// Body (semua opsional): { displayName, bio, isPrivate, avatarMediaId, currentPassword, newPassword }
export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{
      displayName?: string;
      bio?: string;
      isPrivate?: boolean;
      avatarMediaId?: string | null;
      currentPassword?: string;
      newPassword?: string;
    }>(request);

    const data: Record<string, unknown> = {};

    if (typeof body.displayName === "string") {
      const displayName = body.displayName.trim().slice(0, 40);
      if (!displayName) throw new ApiError("Nama tampilan tidak boleh kosong");
      data.displayName = displayName;
    }
    if (typeof body.bio === "string") {
      data.bio = body.bio.trim().slice(0, 160);
    }
    if (typeof body.isPrivate === "boolean") {
      data.isPrivate = body.isPrivate;
      // Saat kembali ke publik: semua permintaan ikut yang menunggu otomatis diterima
      if (!body.isPrivate) {
        await db.follow.updateMany({
          where: { followingId: user.id, status: "PENDING" },
          data: { status: "ACCEPTED" },
        });
      }
    }
    if (body.avatarMediaId !== undefined) {
      if (body.avatarMediaId === null) {
        data.avatarMediaId = null;
      } else {
        const media = await db.media.findUnique({ where: { id: body.avatarMediaId } });
        if (!media) throw new ApiError("Foto profil tidak ditemukan, unggah ulang", 400);
        if (media.kind !== "IMAGE") throw new ApiError("Foto profil harus berupa gambar", 400);
        data.avatarMediaId = media.id;
      }
    }

    // Ganti password: butuh password lama
    if (body.newPassword) {
      if (!body.currentPassword) throw new ApiError("Masukkan password lama dulu", 403);
      await changeOwnPassword(user.id, body.currentPassword, body.newPassword);
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data,
      include: userInclude,
    });

    return Response.json({
      user: toUserDTO(updated, { isMe: true }),
      passwordChanged: !!body.newPassword,
    });
  } catch (err) {
    return jsonError(err);
  }
}
