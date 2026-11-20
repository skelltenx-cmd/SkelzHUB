import { db } from "@/lib/db";
import { jsonError, ApiError, requireUser, readJson } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/report  { reason } — laporkan post ke admin
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const body = await readJson<{ reason?: string }>(request);
    const reason = (body.reason || "").trim().slice(0, 300);

    const post = await db.post.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!post) throw new ApiError("Post tidak ditemukan", 404);
    if (post.authorId === user.id) throw new ApiError("Tidak bisa melaporkan post sendiri", 400);

    const existing = await db.report.findUnique({
      where: { postId_reporterId: { postId: id, reporterId: user.id } },
    });
    if (existing) throw new ApiError("Kamu sudah melaporkan post ini", 409);

    await db.report.create({
      data: { postId: id, reporterId: user.id, reason },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
