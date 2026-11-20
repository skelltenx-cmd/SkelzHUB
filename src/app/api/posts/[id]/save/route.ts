import { db } from "@/lib/db";
import { jsonError, ApiError, requireUserId } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/save  (toggle) — id repost otomatis diarahkan ke post asli
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await requireUserId();

    const row = await db.post.findUnique({ where: { id }, select: { id: true, repostOfId: true } });
    if (!row) throw new ApiError("Post tidak ditemukan", 404);
    const postId = row.repostOfId ?? row.id;

    const existing = await db.saved.findUnique({ where: { userId_postId: { userId, postId } } });
    if (existing) {
      await db.saved.delete({ where: { id: existing.id } });
    } else {
      await db.saved.create({ data: { userId, postId } });
    }

    return Response.json({ saved: !existing });
  } catch (err) {
    return jsonError(err);
  }
}
