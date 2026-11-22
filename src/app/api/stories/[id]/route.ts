import { db } from "@/lib/db";
import { jsonError, ApiError, requireUser } from "@/lib/api-utils";
import { deleteMediaIfOrphan } from "@/lib/story-purge";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// GET /api/stories/[id] -> detail story milik sendiri: daftar penonton (untuk pemilik/admin)
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const story = await db.story.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        caption: true,
        createdAt: true,
        expiresAt: true,
        media: { select: { id: true, kind: true } },
        audio: { select: { id: true } },
        views: {
          orderBy: { seenAt: "desc" },
          take: 100,
          select: {
            seenAt: true,
            user: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } } },
          },
        },
      },
    });
    if (!story) throw new ApiError("Story tidak ditemukan", 404);

    const isOwner = story.authorId === user.id;
    const isAdmin = user.role === "ADMIN" || user.role === "OWNER";
    if (!isOwner && !isAdmin) throw new ApiError("Hanya pemilik story yang bisa melihat penontonnya", 403);

    return Response.json({
      story: {
        id: story.id,
        media: `/api/media/${story.media.id}`,
        type: story.media.kind === "VIDEO" ? "VIDEO" : "IMAGE",
        caption: story.caption,
        createdAt: story.createdAt.toISOString(),
        expiresAt: story.expiresAt.toISOString(),
        audio: story.audio ? `/api/media/${story.audio.id}` : null,
      },
      viewers: story.views.map((v) => ({
        id: v.user.id,
        username: v.user.username,
        displayName: v.user.displayName,
        avatarColor: v.user.avatarColor,
        avatar: v.user.avatarMedia ? `/api/media/${v.user.avatarMedia.id}` : null,
        role: v.user.role === "OWNER" ? "OWNER" : v.user.role === "ADMIN" ? "ADMIN" : "USER",
        seenAt: v.seenAt.toISOString(),
      })),
      viewCount: story.views.length,
    });
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/stories/[id] -> hapus story sendiri (atau oleh admin);
// media terkait ikut dibuang bila tidak dipakai konten lain
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const story = await db.story.findUnique({ where: { id }, select: { authorId: true, mediaId: true } });
    if (!story) throw new ApiError("Story tidak ditemukan", 404);
    if (story.authorId !== user.id && user.role !== "ADMIN" && user.role !== "OWNER") {
      throw new ApiError("Kamu tidak bisa menghapus story orang lain", 403);
    }

    await db.story.delete({ where: { id } });
    // Media story yang sudah yatim dibuang supaya database tidak membengkak
    await deleteMediaIfOrphan(story.mediaId).catch(() => null);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
