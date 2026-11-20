import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { jsonError, toUserDTO, userInclude } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/users?search=q  -> cari user (maks 10)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();

    if (!search) return Response.json({ users: [] });

    const viewerId = await getSessionUserId();

    const users = await db.user.findMany({
      where: {
        OR: [
          { username: { contains: search } },
          { displayName: { contains: search } },
        ],
      },
      orderBy: { followers: { _count: "desc" } },
      take: 10,
      include: userInclude,
    });

    let followedSet = new Set<string>();
    if (viewerId && users.length > 0) {
      const follows = await db.follow.findMany({
        where: { followerId: viewerId, followingId: { in: users.map((u) => u.id) } },
        select: { followingId: true },
      });
      followedSet = new Set(follows.map((f) => f.followingId));
    }

    return Response.json({
      users: users.map((u) =>
        toUserDTO(u, { isFollowing: followedSet.has(u.id), isMe: viewerId === u.id })
      ),
    });
  } catch (err) {
    return jsonError(err);
  }
}
