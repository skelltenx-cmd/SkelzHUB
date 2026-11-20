import { db } from "@/lib/db";
import { jsonError, ApiError, requireUserId, notify } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** id bisa post biasa atau repost -> interaksi selalu mengarah ke post ASLI */
async function resolveOriginalId(id: string): Promise<{ postId: string; authorId: string }> {
  const post = await db.post.findUnique({ where: { id }, select: { id: true, authorId: true, repostOfId: true } });
  if (!post) throw new ApiError("Post tidak ditemukan", 404);
  if (!post.repostOfId) return { postId: post.id, authorId: post.authorId };
  const original = await db.post.findUnique({ where: { id: post.repostOfId }, select: { id: true, authorId: true } });
  if (!original) throw new ApiError("Post asli tidak ditemukan", 404);
  return { postId: original.id, authorId: original.authorId };
}

// POST /api/posts/[id]/like  (toggle)
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const { postId, authorId } = await resolveOriginalId(id);

    const existing = await db.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) {
      await db.like.delete({ where: { id: existing.id } });
    } else {
      await db.like.create({ data: { userId, postId } });
      await notify({ userId: authorId, actorId: userId, type: "LIKE", postId });
    }

    const likeCount = await db.like.count({ where: { postId } });
    return Response.json({ liked: !existing, likeCount });
  } catch (err) {
    return jsonError(err);
  }
}
