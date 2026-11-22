import { db } from "@/lib/db";
import { jsonError, ApiError, getCurrentUser, isAdminRole } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// DELETE /api/comments/[id]  (pemilik komentar, pemilik post, ATAU admin)
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const viewer = await getCurrentUser();
    if (!viewer) throw new ApiError("Kamu harus login dulu", 401);
    if (viewer.bannedAt) throw new ApiError("Akun kamu telah dibanned", 403);

    const comment = await db.comment.findUnique({
      where: { id },
      select: { userId: true, postId: true, post: { select: { authorId: true } } },
    });
    if (!comment) throw new ApiError("Komentar tidak ditemukan", 404);

    const isCommentOwner = viewer.id === comment.userId;
    const isPostOwner = viewer.id === comment.post.authorId;
    const isAdmin = isAdminRole(viewer.role);
    if (!isCommentOwner && !isPostOwner && !isAdmin) {
      throw new ApiError("Kamu tidak bisa menghapus komentar ini", 403);
    }

    await db.comment.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
