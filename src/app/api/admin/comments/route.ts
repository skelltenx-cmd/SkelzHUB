import { db } from "@/lib/db";
import { jsonError, ApiError, requireAdmin, readJson } from "@/lib/api-utils";
import { Prisma } from "@prisma/client";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/admin/comments?search= -> semua komentar untuk moderasi
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();

    const where: Prisma.CommentWhereInput = search
      ? { text: { contains: search } }
      : {};

    const comments = await db.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true,
        text: true,
        createdAt: true,
        user: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } } },
        post: {
          select: {
            id: true,
            caption: true,
            type: true,
            mediaId: true,
            author: { select: { id: true, username: true, displayName: true, avatarColor: true } },
          },
        },
      },
    });

    return Response.json({
      comments: comments.map((c) => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        author: {
          ...c.user,
          avatar: c.user.avatarMedia ? `/api/media/${c.user.avatarMedia.id}` : null,
        },
        postId: c.post.id,
        postCaption: c.post.caption,
        postMedia: `/api/media/${c.post.mediaId}`,
        postType: c.post.type === "VIDEO" ? "VIDEO" : "IMAGE",
        postAuthor: c.post.author,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/admin/comments  { commentId }
export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<{ commentId?: string }>(request);
    const commentId = body.commentId || "";
    if (!commentId) throw new ApiError("commentId wajib diisi");

    const comment = await db.comment.findUnique({ where: { id: commentId }, select: { id: true } });
    if (!comment) throw new ApiError("Komentar tidak ditemukan", 404);

    await db.comment.delete({ where: { id: commentId } });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
