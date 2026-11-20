import { db } from "@/lib/db";
import { jsonError, ApiError, requireUser, readJson, notify } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/follow-requests -> permintaan ikuti yang menunggu persetujuanku
export async function GET() {
  try {
    const user = await requireUser();

    const requests = await db.follow.findMany({
      where: { followingId: user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        follower: { select: { id: true, username: true, displayName: true, avatarColor: true, avatarMedia: { select: { id: true } } } },
      },
    });

    return Response.json({
      requests: requests.map((r) => ({
        followId: r.id,
        createdAt: r.createdAt.toISOString(),
        user: {
          ...r.follower,
          avatar: r.follower.avatarMedia ? `/api/media/${r.follower.avatarMedia.id}` : null,
        },
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

// PATCH /api/follow-requests { followId, action: "accept" | "reject" }
export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ followId?: string; action?: "accept" | "reject" }>(request);
    const followId = body.followId || "";
    const action = body.action;

    const follow = await db.follow.findUnique({ where: { id: followId } });
    if (!follow) throw new ApiError("Permintaan tidak ditemukan", 404);
    if (follow.followingId !== user.id) throw new ApiError("Bukan permintaan untuk akunmu", 403);
    if (follow.status !== "PENDING") throw new ApiError("Permintaan ini sudah diproses", 409);

    if (action === "accept") {
      await db.follow.update({ where: { id: follow.id }, data: { status: "ACCEPTED" } });
      await notify({ userId: follow.followerId, actorId: user.id, type: "FOLLOW_ACCEPT" });
      return Response.json({ ok: true, accepted: true });
    }

    if (action === "reject") {
      await db.follow.delete({ where: { id: follow.id } });
      return Response.json({ ok: true, accepted: false });
    }

    throw new ApiError("Aksi tidak dikenal (accept / reject)");
  } catch (err) {
    return jsonError(err);
  }
}
