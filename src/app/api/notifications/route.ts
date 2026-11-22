import { db } from "@/lib/db";
import { jsonError, jsonNoStore, requireUser, readJson, roleOut } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/notifications -> daftar notifikasi user + jumlah belum dibaca
export async function GET() {
  try {
    const user = await requireUser();

    const items = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        read: true,
        createdAt: true,
        commentText: true,
        actor: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, avatarMedia: { select: { id: true } } } },
        post: {
          select: {
            id: true,
            type: true,
            mediaId: true,
          },
        },
      },
    });

    const unread = await db.notification.count({ where: { userId: user.id, read: false } });

    return jsonNoStore({
      unread,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
        commentText: n.commentText,
        actor: {
          ...n.actor,
          avatar: n.actor.avatarMedia ? `/api/media/${n.actor.avatarMedia.id}` : null,
          role: roleOut(n.actor.role),
        },
        postId: n.post?.id ?? null,
        postMedia: n.post?.mediaId ? `/api/media/${n.post.mediaId}` : null,
        postType: n.post ? (n.post.type === "VIDEO" ? "VIDEO" : "IMAGE") : null,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

// POST /api/notifications -> tandai semua sebagai sudah dibaca
export async function POST(_request: Request) {
  try {
    const user = await requireUser();
    await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
