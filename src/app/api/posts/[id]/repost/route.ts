import { db } from "@/lib/db";
import { jsonError, ApiError, requireUserId, notify, canViewPrivateContent } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/repost  (toggle repost murni tanpa caption)
// id repost diarahkan otomatis ke post asli
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await requireUserId();

    const row = await db.post.findUnique({ where: { id }, select: { id: true, repostOfId: true } });
    if (!row) throw new ApiError("Post tidak ditemukan", 404);
    const originalId = row.repostOfId ?? row.id;

    const original = await db.post.findUnique({
      where: { id: originalId },
      select: { id: true, authorId: true, repostOfId: true, type: true, author: { select: { id: true, isPrivate: true } } },
    });
    if (!original) throw new ApiError("Post asli tidak ditemukan", 404);
    if (original.repostOfId) throw new ApiError("Tidak bisa memposting ulang sebuah repost");
    if (original.authorId === userId) throw new ApiError("Tidak bisa memposting ulang post sendiri");

    const allowed = await canViewPrivateContent(userId, original.author);
    if (!allowed) throw new ApiError("Post ini dari akun privat", 403);

    const existing = await db.post.findFirst({
      where: { authorId: userId, repostOfId: originalId, caption: "" },
      select: { id: true },
    });

    if (existing) {
      await db.post.delete({ where: { id: existing.id } });
    } else {
      await db.post.create({
        data: { caption: "", mediaId: null, type: original.type, repostOfId: originalId, authorId: userId },
      });
      await notify({ userId: original.authorId, actorId: userId, type: "REPOST", postId: originalId });
    }

    const repostCount = await db.post.count({ where: { repostOfId: originalId } });
    return Response.json({ reposted: !existing, repostCount });
  } catch (err) {
    return jsonError(err);
  }
}
