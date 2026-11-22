import { db } from "@/lib/db";
import { jsonError, ApiError, requireUserId, notify } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ username: string }> };

// POST /api/users/[username]/follow  (toggle)
// Akun privat: membuat Follow PENDING (permintaan ikut) — toggle kedua = batalkan permintaan
export async function POST(_request: Request, { params }: Params) {
  try {
    const { username } = await params;
    const userId = await requireUserId();

    const target = await db.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!target) throw new ApiError("User tidak ditemukan", 404);
    if (target.id === userId) throw new ApiError("Tidak bisa memfollow diri sendiri");

    const existing = await db.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: target.id } },
    });

    if (existing) {
      // Unfollow / batalkan permintaan
      await db.follow.delete({ where: { id: existing.id } });
    } else if (target.isPrivate) {
      // Akun privat: buat permintaan ikut
      await db.follow.create({ data: { followerId: userId, followingId: target.id, status: "PENDING" } });
      void notify({ userId: target.id, actorId: userId, type: "FOLLOW_REQUEST" });
    } else {
      await db.follow.create({ data: { followerId: userId, followingId: target.id, status: "ACCEPTED" } });
      void notify({ userId: target.id, actorId: userId, type: "FOLLOW" });
    }

    // Notifikasi tidak menahan balasan (fire-and-forget) — satu query
    // tulis ikut + satu hitung pengikut = rute selesai secepat mungkin.
    const followerCount = await db.follow.count({ where: { followingId: target.id, status: "ACCEPTED" } });
    return Response.json({
      following: !existing && !target.isPrivate,
      pending: !existing && target.isPrivate,
      followerCount,
    });
  } catch (err) {
    return jsonError(err);
  }
}
