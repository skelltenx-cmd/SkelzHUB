import { db } from "@/lib/db";
import { jsonError, jsonNoStore, ApiError, requireUser, requireUserId, readJson, roleOut, notify } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const commentAuthorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarColor: true,
  role: true,
  avatarMedia: { select: { id: true } },
} as const;

// GET /api/stories/[id]/comments
// Daftar komentar story (diurutkan terbaru di bawah) + balasan (parentId).
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;

    const story = await db.story.findUnique({
      where: { id },
      select: { id: true, expiresAt: true },
    });
    if (!story || story.expiresAt <= new Date()) throw new ApiError("Story tidak ditemukan", 404);

    const viewerId = await getUserIdOrNull();
    const comments = await db.storyComment.findMany({
      where: { storyId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true,
        text: true,
        createdAt: true,
        parentId: true,
        userId: true,
        user: { select: commentAuthorSelect },
        parent: {
          select: {
            id: true,
            user: { select: commentAuthorSelect },
          },
        },
      },
    });

    return jsonNoStore({
      comments: comments.map((c) => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        parentId: c.parentId,
        replyTo: c.parent?.user
          ? {
              id: c.parent.user.id,
              username: c.parent.user.username,
              displayName: c.parent.user.displayName,
              avatarColor: c.parent.user.avatarColor,
              avatar: c.parent.user.avatarMedia ? `/api/media/${c.parent.user.avatarMedia.id}` : null,
              role: roleOut(c.parent.user.role),
            }
          : null,
        isMine: c.userId === viewerId,
        author: {
          id: c.user.id,
          username: c.user.username,
          displayName: c.user.displayName,
          avatarColor: c.user.avatarColor,
          avatar: c.user.avatarMedia ? `/api/media/${c.user.avatarMedia.id}` : null,
          role: roleOut(c.user.role),
        },
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

async function getUserIdOrNull(): Promise<string | null> {
  // helper kecil: komen story bisa dibaca tanpa login, tapi "isMine" tetap dihitung bila ada session
  const { getSessionUserId } = await import("@/lib/session");
  try {
    return await getSessionUserId();
  } catch {
    return null;
  }
}

// POST /api/stories/[id]/comments  { text, parentId? }
// Tulis komentar / balasan pada story (mirip balasan story di sosial pada umumnya).
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const body = await readJson<{ text?: string; parentId?: string | null }>(request);
    const text = (body.text || "").trim().slice(0, 500);
    if (!text) throw new ApiError("Komentar tidak boleh kosong");

    const story = await db.story.findUnique({
      where: { id },
      select: { id: true, authorId: true, expiresAt: true },
    });
    if (!story || story.expiresAt <= new Date()) throw new ApiError("Story tidak ditemukan", 404);

    // Balasan: parent harus komentar di story yang sama
    let parentId: string | null = null;
    if (body.parentId) {
      const parent = await db.storyComment.findUnique({
        where: { id: String(body.parentId) },
        select: { id: true, storyId: true },
      });
      if (!parent || parent.storyId !== id) throw new ApiError("Komentar yang dibalas tidak ditemukan", 404);
      parentId = parent.id;
    }

    const comment = await db.storyComment.create({
      data: { storyId: id, userId, text, parentId },
      select: {
        id: true,
        text: true,
        createdAt: true,
        parentId: true,
        user: { select: commentAuthorSelect },
        parent: {
          select: {
            id: true,
            user: { select: commentAuthorSelect },
          },
        },
      },
    });

    // Notifikasi komentar story ke pemilik story (dikirim setelah komentar berhasil dibuat;
    // otomatis dilewati jika yang komentar pemilik sendiri)
    await notify({ userId: story.authorId, actorId: userId, type: "STORY_COMMENT", commentText: text });

    return jsonNoStore({
      comment: {
        id: comment.id,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
        parentId: comment.parentId,
        replyTo: comment.parent?.user
          ? {
              id: comment.parent.user.id,
              username: comment.parent.user.username,
              displayName: comment.parent.user.displayName,
              avatarColor: comment.parent.user.avatarColor,
              avatar: comment.parent.user.avatarMedia ? `/api/media/${comment.parent.user.avatarMedia.id}` : null,
              role: roleOut(comment.parent.user.role),
            }
          : null,
        isMine: true,
        author: {
          id: comment.user.id,
          username: comment.user.username,
          displayName: comment.user.displayName,
          avatarColor: comment.user.avatarColor,
          avatar: comment.user.avatarMedia ? `/api/media/${comment.user.avatarMedia.id}` : null,
          role: roleOut(comment.user.role),
        },
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/stories/[id]/comments?commentId=xxx
// Hapus komentar: milik sendiri, pemilik story, atau admin.
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const commentId = new URL(request.url).searchParams.get("commentId") || "";
    if (!commentId) throw new ApiError("ID komentar tidak ada", 400);

    const comment = await db.storyComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, storyId: true },
    });
    if (!comment || comment.storyId !== id) throw new ApiError("Komentar tidak ditemukan", 404);

    const story = await db.story.findUnique({ where: { id }, select: { authorId: true } });
    const isAdmin = user.role === "ADMIN" || user.role === "OWNER";
    if (comment.userId !== user.id && story?.authorId !== user.id && !isAdmin) {
      throw new ApiError("Kamu tidak bisa menghapus komentar ini", 403);
    }

    await db.storyComment.delete({ where: { id: comment.id } });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
