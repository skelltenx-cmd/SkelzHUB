import { db } from "@/lib/db";
import { jsonError, ApiError, requireUser, notify } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// POST /api/stories/[id]/view -> tandai story sudah dilihat (idempoten)
// Sekalian kirim notifikasi ke pemilik story saat penonton BARU (bukan diri sendiri).
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const story = await db.story.findUnique({ where: { id }, select: { id: true, authorId: true, expiresAt: true } });
    if (!story) throw new ApiError("Story tidak ditemukan", 404);

    // Notifikasi hanya untuk penonton pertama kali (upsert create) dan bukan pemilik sendiri
    if (story.authorId !== user.id) {
      const seen = await db.storyView.findUnique({
        where: { storyId_userId: { storyId: id, userId: user.id } },
        select: { id: true },
      });
      if (!seen) {
        await notify({ userId: story.authorId, actorId: user.id, type: "STORY_VIEW" });
      }
    }

    await db.storyView.upsert({
      where: { storyId_userId: { storyId: id, userId: user.id } },
      create: { storyId: id, userId: user.id },
      update: {},
    });

    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
