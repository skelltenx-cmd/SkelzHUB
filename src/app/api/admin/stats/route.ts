import { db } from "@/lib/db";
import { jsonError, requireAdmin, postInclude, toPostDTO, userInclude, roleOut } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/admin/stats -> statistik platform untuk dashboard admin
export async function GET() {
  try {
    await requireAdmin();

    const [totalUsers, admins, bannedUsers, totalPosts, totalShorts, totalComments, totalLikes, pendingReports] =
      await Promise.all([
        db.user.count(),
        db.user.count({ where: { role: "ADMIN" } }),
        db.user.count({ where: { bannedAt: { not: null } } }),
        db.post.count(),
        db.post.count({ where: { type: "VIDEO" } }),
        db.comment.count(),
        db.like.count(),
        db.report.count({ where: { status: "PENDING" } }),
      ]);

    const latestUsers = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: userInclude,
    });

    const latestPosts = await db.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: postInclude,
    });

    return Response.json({
      totalUsers,
      admins,
      bannedUsers,
      totalPosts,
      totalShorts,
      totalComments,
      totalLikes,
      pendingReports,
      latestUsers: latestUsers.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarColor: u.avatarColor,
        avatar: u.avatarMedia ? `/api/media/${u.avatarMedia.id}` : null,
        role: roleOut(u.role),
        bannedAt: u.bannedAt?.toISOString() ?? null,
        banReason: u.banReason,
        createdAt: u.createdAt.toISOString(),
        postCount: u._count.posts,
        followerCount: u._count.followers,
      })),
      latestPosts: latestPosts.map((p) => toPostDTO(p, null)),
    });
  } catch (err) {
    return jsonError(err);
  }
}
