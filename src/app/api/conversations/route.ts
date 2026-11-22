import { db } from "@/lib/db";
import { jsonError, jsonNoStore, ApiError, requireUser, readJson, roleOut } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

const ONLINE_WINDOW_MS = 75_000; // heartbeat tiap ±25 dtk -> online bila aktif <75 dtk lalu

// GET /api/conversations -> daftar percakapan + pesan terakhir + jumlah belum dibaca + presence
export async function GET() {
  try {
    const user = await requireUser();

    const conversations = await db.conversation.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        lastMessageAt: true,
        userA: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, lastSeenAt: true, avatarMedia: { select: { id: true } } } },
        userB: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, lastSeenAt: true, avatarMedia: { select: { id: true } } } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { text: true, kind: true, senderId: true, createdAt: true, deletedAt: true },
        },
      },
    });

    const ids = conversations.map((c) => c.id);
    const unreadRows = ids.length
      ? await db.message.groupBy({
          by: ["conversationId"],
          where: { conversationId: { in: ids }, senderId: { not: user.id }, readAt: null },
          _count: { _all: true },
        })
      : [];
    const unreadMap = new Map(unreadRows.map((r) => [r.conversationId, r._count._all]));

    const now = Date.now();
    const items = conversations.map((c) => {
      const other = c.userA.id === user.id ? c.userB : c.userA;
      const last = c.messages[0] ?? null;
      return {
        id: c.id,
        user: {
          id: other.id,
          username: other.username,
          displayName: other.displayName,
          avatarColor: other.avatarColor,
          avatar: other.avatarMedia ? `/api/media/${other.avatarMedia.id}` : null,
          role: roleOut(other.role),
          online: !!other.lastSeenAt && now - other.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
          lastSeenAt: other.lastSeenAt ? other.lastSeenAt.toISOString() : null,
        },
        lastMessage: last && !last.deletedAt ? last.text.slice(0, 80) : null,
        lastMessageKind: last ? last.kind : null,
        lastMessageDeleted: last ? last.deletedAt !== null : false,
        lastMessageAt: last ? last.createdAt.toISOString() : null,
        lastMessageMine: last ? last.senderId === user.id : false,
        unread: unreadMap.get(c.id) ?? 0,
      };
    });

    const totalUnread = items.reduce((sum, c) => sum + c.unread, 0);
    return jsonNoStore({ conversations: items, unread: totalUnread });
  } catch (err) {
    return jsonError(err);
  }
}

// POST /api/conversations { username } -> buka / buat percakapan dengan user tsb
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ username?: string }>(request);
    const username = (body.username || "").trim().toLowerCase();
    if (!username) throw new ApiError("Username wajib diisi");

    const target = await db.user.findUnique({ where: { username }, select: { id: true, bannedAt: true } });
    if (!target) throw new ApiError("User tidak ditemukan", 404);
    if (target.id === user.id) throw new ApiError("Tidak bisa kirim pesan ke diri sendiri");
    if (target.bannedAt) throw new ApiError("Akun ini sedang dibanned", 403);

    const [a, b] = [user.id, target.id].sort();
    const conversation = await db.conversation.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      create: { userAId: a, userBId: b },
      update: {},
      select: { id: true },
    });

    return Response.json({ conversationId: conversation.id });
  } catch (err) {
    return jsonError(err);
  }
}
