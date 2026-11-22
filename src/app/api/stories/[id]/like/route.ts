import { db } from "@/lib/db";
import { jsonError, ApiError, requireUserId, notify } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// POST /api/stories/[id]/like  (toggle)
// Suka / batal suka pada story — seperti like pada konten sosial pada umumnya.
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await requireUserId();

    const story = await db.story.findUnique({
      where: { id },
      select: { id: true, authorId: true, expiresAt: true },
    });
    if (!story || story.expiresAt <= new Date()) throw new ApiError("Story tidak ditemukan", 404);

    const existing = await db.storyLike.findUnique({
      where: { storyId_userId: { storyId: id, userId } },
      select: { id: true },
    });

    if (existing) {
      await db.storyLike.delete({ where: { id: existing.id } });
    } else {
      await db.storyLike.create({ data: { storyId: id, userId } });
      // Notifikasi ke pemilik story (sekali per like baru; otomatis dilewati jika like sendiri)
      await notify({ userId: story.authorId, actorId: userId, type: "STORY_LIKE" });
    }

    const likeCount = await db.storyLike.count({ where: { storyId: id } });
    return Response.json({ liked: !existing, likeCount });
  } catch (err) {
    return jsonError(err);
  }
}
