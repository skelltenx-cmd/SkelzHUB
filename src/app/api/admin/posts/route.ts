import { db } from "@/lib/db";
import { jsonError, ApiError, requireAdmin, readJson, getPreviewComments, toPostDTO } from "@/lib/api-utils";
import { Prisma } from "@prisma/client";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

const adminPostInclude = {
  author: { select: { id: true, username: true, displayName: true, avatarColor: true, isPrivate: true, role: true, avatarMedia: { select: { id: true } } } },
  _count: { select: { likes: true, comments: true, reposts: true, reports: true } },
  repostOf: {
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarColor: true, isPrivate: true, role: true, avatarMedia: { select: { id: true } } } },
      _count: { select: { likes: true, comments: true, reposts: true } },
    },
  },
} as const;

// GET /api/admin/posts?search=&filter=all|video|reported -> semua post untuk moderasi
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const filter = url.searchParams.get("filter") || "all";

    const where: Prisma.PostWhereInput = {};
    if (filter === "video") {
      where.type = "VIDEO";
    } else if (filter === "reported") {
      where.reports = { some: { status: "PENDING" } };
    }
    if (search) {
      const authors = await db.user.findMany({
        where: { OR: [{ username: { contains: search } }, { displayName: { contains: search } }] },
        select: { id: true },
      });
      where.AND = [
        {
          OR: [
            { caption: { contains: search } },
            ...(authors.length > 0 ? [{ authorId: { in: authors.map((a) => a.id) } }] : []),
          ],
        },
      ];
    }

    const posts = await db.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: adminPostInclude,
    });

    const previews = await getPreviewComments(posts.map((p) => p.id));

    return Response.json({
      posts: posts.map((p) => ({
        ...toPostDTO(p, null, previews.get(p.id) ?? []),
        reportCount: p._count.reports,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/admin/posts  { postId } -> hapus post apa pun
export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<{ postId?: string }>(request);
    const postId = body.postId || "";
    if (!postId) throw new ApiError("postId wajib diisi");

    const post = await db.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new ApiError("Post tidak ditemukan", 404);

    await db.post.delete({ where: { id: postId } });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
