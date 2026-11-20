import { db } from "@/lib/db";
import { jsonError, requireUser } from "@/lib/api-utils";
import { purgeExpiredStories } from "@/lib/story-purge";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// POST /api/me/heartbeat
// Denyut presence: dititipkan client tiap ±25 detik selama tab terlihat.
// Dipakai untuk status online & "terakhir aktif" di profil / DM.
// Sekaligus jadi pemicu sapuan story kedaluwarsa (dihapus fisik setelah 24 jam).
export async function POST() {
  try {
    const user = await requireUser();
    const now = new Date();
    // Throttle 25 detik supaya tidak menulis DB terlalu sering
    if (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > 25_000) {
      await db.user.update({ where: { id: user.id }, data: { lastSeenAt: now } });
    }
    // Sapu story kedaluwarsa (throttle internal — tidak menambah beban berarti)
    await purgeExpiredStories();
    return Response.json({ ok: true, lastSeenAt: now.toISOString() });
  } catch (err) {
    return jsonError(err);
  }
}
