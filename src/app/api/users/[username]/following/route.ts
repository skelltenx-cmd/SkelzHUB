import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { jsonError, ApiError, canViewPrivateContent } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ username: string }> };

// GET /api/users/[username]/following -> daftar yang diikuti
export async function GET(_request: Request, { params }: Params) {
  try {
    const { username } = await params;
    const viewerId = await getSessionUserId();

    const user = await db.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true, isPrivate: true } });
    if (!user) throw new ApiError("User tidak ditemukan", 404);

    const allowed = await canViewPrivateContent(viewerId, user);
    if (!allowed) throw new ApiError("Daftar yang diikuti akun ini privat", 403);

    const follows = await db.follow.findMany({
      where: { followerId: user.id, status: "ACCEPTED" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        following: { select: { id: true, username: true, displayName: true, avatarColor: true, avatarMedia: { select: { id: true } } } },
      },
    });

    return Response.json({
      users: follows.map((f) => ({
        id: f.id,
        status: "ACCEPTED" as const,
        user: {
          ...f.following,
          avatar: f.following.avatarMedia ? `/api/media/${f.following.avatarMedia.id}` : null,
        },
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
