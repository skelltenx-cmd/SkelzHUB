import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { jsonError, ApiError, readJson, requireUserId, notify, roleOut } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const commentSelect = {
  id: true,
  text: true,
  createdAt: true,
  parentId: true,
  user: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } } },
} as const;

/** Bentuk komentar untuk keluaran API (dengan konteks balasan) */
function commentOut(c: {
  id: string;
  text: string;
  createdAt: Date;
  parentId: string | null;
  user: { id: string; username: string; displayName: string; avatarColor: number; role: string; avatarMedia?: { id: string } | null };
  parent?: { user: { id: string; username: string; displayName: string; avatarColor: number; role: string; avatarMedia?: { id: string } | null } } | null;
}) {
  const p = c.parent?.user;
  return {
    id: c.id,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
    parentId: c.parentId,
    // Penulis komentar yang dibalas ("membalas @xxx")
    replyTo: p
      ? {
          id: p.id,
          username: p.username,
          displayName: p.displayName,
          avatarColor: p.avatarColor,
          avatar: p.avatarMedia ? `/api/media/${p.avatarMedia.id}` : null,
          role: roleOut(p.role),
        }
      : null,
    author: {
      id: c.user.id,
      username: c.user.username,
      displayName: c.user.displayName,
      avatarColor: c.user.avatarColor,
      role: roleOut(c.user.role),
      avatar: c.user.avatarMedia ? `/api/media/${c.user.avatarMedia.id}` : null,
    },
  };
}

// GET /api/posts/[id]/comments  ?page=0&limit=30
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10) || 30));

    const post = await db.post.findUnique({ where: { id }, select: { id: true, repostOfId: true } });
    if (!post) throw new ApiError("Post tidak ditemukan", 404);
    const targetId = post.repostOfId ?? post.id;

    const comments = await db.comment.findMany({
      where: { postId: targetId },
      orderBy: { createdAt: "desc" },
      skip: page * limit,
      take: limit + 1,
      select: {
        ...commentSelect,
        parent: { select: { user: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } } } } },
      },
    });

    const hasMore = comments.length > limit;
    const pageComments = hasMore ? comments.slice(0, limit) : comments;

    return Response.json({
      comments: pageComments.map(commentOut),
      nextPage: hasMore ? page + 1 : null,
      hasMore,
    });
  } catch (err) {
    return jsonError(err);
  }
}

// POST /api/posts/[id]/comments  { text, parentId? }
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const body = await readJson<{ text?: string; parentId?: string }>(request);
    const text = (body.text || "").trim().slice(0, 500);
    if (!text) throw new ApiError("Komentar tidak boleh kosong");

    const post = await db.post.findUnique({ where: { id }, select: { id: true, authorId: true, repostOfId: true } });
    if (!post) throw new ApiError("Post tidak ditemukan", 404);
    const targetId = post.repostOfId ?? post.id;
    const targetAuthorId = post.repostOfId ? (await db.post.findUnique({ where: { id: post.repostOfId }, select: { authorId: true } }))?.authorId : post.authorId;

    // Balasan: parent wajib komentar di post yang sama.
    // Balasan-ke-balasan diratakan ke komentar utama (model sosmed pada umumnya).
    let parentId: string | null = null;
    let parentAuthorId: string | null = null;
    const rawParentId = (body.parentId || "").trim();
    if (rawParentId) {
      const parent = await db.comment.findUnique({
        where: { id: rawParentId },
        select: { id: true, postId: true, parentId: true, userId: true },
      });
      if (!parent || parent.postId !== targetId) {
        throw new ApiError("Komentar yang dibalas tidak ditemukan", 400);
      }
      parentId = parent.parentId ?? parent.id; // ratakan ke thread utama
      parentAuthorId = parent.userId;
    }

    const comment = await db.comment.create({
      data: { text, userId, postId: targetId, parentId },
      select: {
        ...commentSelect,
        parent: { select: { user: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } } } } },
      },
    });

    // Notifikasi: penulis post (kalau bukan diriku) + penulis komentar yang dibalas
    await notify({
      userId: targetAuthorId ?? post.authorId,
      actorId: userId,
      type: "COMMENT",
      postId: targetId,
      commentText: text,
    });
    if (parentAuthorId && parentAuthorId !== (targetAuthorId ?? post.authorId)) {
      await notify({
        userId: parentAuthorId,
        actorId: userId,
        type: "COMMENT",
        postId: targetId,
        commentText: text,
      });
    }

    const viewerId = await getSessionUserId();
    return Response.json({
      comment: {
        ...commentOut(comment),
        isMine: comment.user.id === viewerId,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
