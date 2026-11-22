import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { jsonError, ApiError, readJson, toUserDTO, userInclude, followStatusOf } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ username: string }> };

// GET /api/users/[username]  -> profil + statistik + status follow (mengikuti / diminta / tidak)
export async function GET(_request: Request, { params }: Params) {
  try {
    const { username } = await params;
    const user = await db.user.findUnique({
      where: { username: username.toLowerCase() },
      include: userInclude,
    });
    if (!user) throw new ApiError("User tidak ditemukan", 404);

    const viewerId = await getSessionUserId();
    const followStatus = await followStatusOf(viewerId, user.id);

    return Response.json({
      user: toUserDTO(user, {
        isFollowing: followStatus === "ACCEPTED",
        followStatus,
        isMe: viewerId === user.id,
      }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

// PATCH /api/users/[username]  -> update profil sendiri { displayName, bio }
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { username } = await params;
    const viewerId = (await getSessionUserId()) as string | null;

    const target = await db.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!target) throw new ApiError("User tidak ditemukan", 404);
    if (!viewerId || viewerId !== target.id) throw new ApiError("Kamu hanya bisa mengubah profil sendiri", 403);

    const body = await readJson<{ displayName?: string; bio?: string }>(request);
    const displayName = (body.displayName || "").trim().slice(0, 40) || target.username;
    const bio = (body.bio || "").trim().slice(0, 160);

    const updated = await db.user.update({
      where: { id: target.id },
      data: { displayName, bio },
      include: userInclude,
    });

    return Response.json({
      user: toUserDTO(updated, { isFollowing: false, isMe: true }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

// POST /api/users/[username] — dipakai? (kompatibilitas) tidak: follow ada di /follow
export async function POST(_request: Request, { params }: Params) {
  return jsonError(new ApiError("Metode tidak didukung", 405));
}
