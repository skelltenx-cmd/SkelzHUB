import { db } from "@/lib/db";
import { jsonError, jsonNoStore, ApiError, requireUser, readJson, roleOut } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const ONLINE_WINDOW_MS = 75_000;
const TYPING_WINDOW_MS = 5_000;

/** Pastikan user adalah peserta percakapan ini + info lawan bicara */
async function getMyConversation(conversationId: string, userId: string) {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      typingAAt: true,
      typingBAt: true,
      userA: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, lastSeenAt: true, avatarMedia: { select: { id: true } } } },
      userB: { select: { id: true, username: true, displayName: true, avatarColor: true, role: true, lastSeenAt: true, avatarMedia: { select: { id: true } } } },
    },
  });
  if (!conversation) throw new ApiError("Percakapan tidak ditemukan", 404);
  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new ApiError("Kamu bukan peserta percakapan ini", 403);
  }
  return conversation;
}

/** Reaksi pesan diringkas per emoji (jumlah + apakah aku ikut bereaksi) */
type ReactionRow = { emoji: string; userId: string };

function summarizeReactions(rows: ReactionRow[], userId: string) {
  const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (r.userId === userId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }
  // Urutkan: reaksi terbanyak dulu
  return [...byEmoji.values()].sort((a, b) => b.count - a.count);
}

function messageDTO(
  m: {
    id: string;
    text: string;
    kind: string;
    senderId: string;
    createdAt: Date;
    readAt: Date | null;
    editedAt: Date | null;
    deletedAt: Date | null;
    updatedAt: Date;
    media?: { id: string } | null;
    replyTo?: {
      id: string;
      text: string;
      kind: string;
      deletedAt: Date | null;
      sender?: { id: string; displayName: string } | null;
    } | null;
    reactions?: ReactionRow[];
  },
  userId: string
) {
  const deleted = m.deletedAt !== null;
  // Kutipan balasan: ringkas pesan asal (nama pengirim + cuplikan).
  // Pesan media juga boleh punya keterangan (caption) -> teks tetap dibawa;
  // bila kosong, klien menampilkan label jenis pesan ("📷 Foto" dst).
  const quote = m.replyTo
    ? {
        id: m.replyTo.id,
        text: m.replyTo.deletedAt ? "" : m.replyTo.text.slice(0, 140),
        kind: m.replyTo.kind as string,
        senderName: m.replyTo.sender?.displayName ?? "",
        senderMine: m.replyTo.sender?.id === userId,
        deleted: !!m.replyTo.deletedAt,
      }
    : null;
  return {
    id: m.id,
    text: deleted ? "" : m.text,
    kind: m.kind,
    media: deleted || !m.media ? null : `/api/media/${m.media.id}`,
    mine: m.senderId === userId,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
    editedAt: !deleted && m.editedAt ? m.editedAt.toISOString() : null,
    deleted,
    updatedAt: m.updatedAt.toISOString(),
    replyTo: quote,
    reactions: summarizeReactions(m.reactions ?? [], userId),
  };
}

const messageSelect = {
  id: true,
  text: true,
  kind: true,
  senderId: true,
  createdAt: true,
  readAt: true,
  editedAt: true,
  deletedAt: true,
  updatedAt: true,
  media: { select: { id: true } },
  replyTo: {
    select: {
      id: true,
      text: true,
      kind: true,
      deletedAt: true,
      sender: { select: { displayName: true, id: true } },
    },
  },
  reactions: { select: { emoji: true, userId: true } },
} as const;

// GET /api/conversations/[id]/messages ?page=0&limit=40&since=<iso>
// Membuka chat = pesan dari lawan otomatis ditandai sudah dibaca.
// Respons juga membawa presence (online/terakhir aktif) + status mengetik lawan.
//
// Mode `since` (polling ringan): pesan yang DIBUAT atau DIEDIT/DIHAPUS setelah
// cursor dikirim lagi — klien memperbarui baris yang sama berdasarkan id sehingga
// edit/hapus pesan lawan juga tersinkron tanpa refresh.
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const conversation = await getMyConversation(id, user.id);

    const now = Date.now();
    const other = conversation.userA.id === user.id ? conversation.userB : conversation.userA;
    // typingAAt milik userA -> status mengetik lawan = sisi lawan
    const otherTypingAt = conversation.userA.id === user.id ? conversation.typingBAt : conversation.typingAAt;

    const presence = {
      user: {
        id: other.id,
        username: other.username,
        displayName: other.displayName,
        avatarColor: other.avatarColor,
        avatar: other.avatarMedia ? `/api/media/${other.avatarMedia.id}` : null,
        role: roleOut(other.role),
      },
      online: !!other.lastSeenAt && now - other.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
      lastSeenAt: other.lastSeenAt ? other.lastSeenAt.toISOString() : null,
      typing: !!otherTypingAt && now - otherTypingAt.getTime() < TYPING_WINDOW_MS,
    };

    const url = new URL(request.url);
    const since = url.searchParams.get("since");

    // Mode polling ringan (dipakai tiap ±2 dtk saat chat dibuka):
    // pesan baru DAN pesan yang diubah (edit/hapus) setelah cursor "since".
    if (since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        const fresh = await db.message.findMany({
          where: { conversationId: id, updatedAt: { gt: sinceDate } },
          orderBy: { createdAt: "asc" },
          take: 50,
          select: messageSelect,
        });
        // Tandai dibaca HANYA bila poll ini benar-benar membawa pesan lawan
        // yang belum dibaca — tanpa ini tiap poll (2 dtk) menulis DB walau
        // tidak ada pesan baru (mahal di pooler + serverless).
        const hasUnread = fresh.some((m) => m.senderId !== user.id && !m.readAt);
        if (hasUnread) {
          await db.message.updateMany({
            where: { conversationId: id, senderId: { not: user.id }, readAt: null },
            data: { readAt: new Date() },
          });
        }
        // Read-receipt: pesan-ku terakhir yang sudah dibaca lawan (centang biru).
        // (Dijaga TANPA syarat — balasan lawan membaca pesanku tidak selalu
        // menghasilkan pesan baru di jendela "since", tapi harus tetap tampak.)
        const lastRead = await db.message.findFirst({
          where: { conversationId: id, senderId: user.id, readAt: { not: null } },
          orderBy: { readAt: "desc" },
          select: { readAt: true },
        });
        return jsonNoStore({
          messages: fresh.map((m) => messageDTO(m, user.id)),
          other: presence,
          mineLastReadAt: lastRead?.readAt ? lastRead.readAt.toISOString() : null,
        });
      }
    }

    const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "40", 10) || 40));

    const messages = await db.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      skip: page * limit,
      take: limit + 1,
      select: messageSelect,
    });

    const hasMore = messages.length > limit;
    const pageMessages = hasMore ? messages.slice(0, limit) : messages;

    // Tandai pesan lawan yang belum dibaca -> sudah dibaca (chat sedang dibuka)
    await db.message.updateMany({
      where: { conversationId: id, senderId: { not: user.id }, readAt: null },
      data: { readAt: new Date() },
    });

    return jsonNoStore({
      messages: pageMessages.reverse().map((m) => messageDTO(m, user.id)),
      other: presence,
      nextPage: hasMore ? page + 1 : null,
      hasMore,
    });
  } catch (err) {
    return jsonError(err);
  }
}

// POST /api/conversations/[id]/messages { text?, mediaId?, replyToId? }
// Pesan teks, foto/video, atau pesan suara (voice).
// replyToId opsional: pesan ini adalah balasan pesan lain (tampil kutipan).
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await getMyConversation(id, user.id);

    const body = await readJson<{ text?: string; mediaId?: string; replyToId?: string | null }>(request);
    const text = (body.text || "").trim().slice(0, 1000);
    const mediaId = (body.mediaId || "").trim() || null;
    const replyToId = (body.replyToId || "").trim() || null;

    let kind = "TEXT";
    let media: { id: string; kind: string } | null = null;
    if (mediaId) {
      media = await db.media.findUnique({ where: { id: mediaId }, select: { id: true, kind: true } });
      if (!media) throw new ApiError("Lampiran tidak ditemukan, unggah ulang", 400);
      kind = media.kind === "AUDIO" ? "VOICE" : media.kind; // IMAGE | VIDEO | VOICE
    } else if (!text) {
      throw new ApiError("Pesan tidak boleh kosong");
    }

    // Balasan: pesan asal harus ada di percakapan yang sama
    if (replyToId) {
      const target = await db.message.findUnique({
        where: { id: replyToId },
        select: { id: true, conversationId: true },
      });
      if (!target || target.conversationId !== id) {
        throw new ApiError("Pesan yang dibalas tidak ditemukan", 400);
      }
    }

    const message = await db.message.create({
      data: { conversationId: id, senderId: user.id, text, kind, mediaId, replyToId },
      select: { ...messageSelect },
    });
    await db.conversation.update({
      where: { id },
      data: { lastMessageAt: message.createdAt },
    });

    return Response.json({ message: messageDTO(message, user.id) });
  } catch (err) {
    return jsonError(err);
  }
}

// PATCH /api/conversations/[id]/messages { messageId, text }
// Edit pesan SENDIRI (hanya teks) — media tidak bisa diganti.
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await getMyConversation(id, user.id);

    const body = await readJson<{ messageId?: string; text?: string }>(request);
    const messageId = (body.messageId || "").trim();
    const text = (body.text || "").trim().slice(0, 1000);
    if (!messageId) throw new ApiError("messageId wajib diisi", 400);
    if (!text) throw new ApiError("Pesan tidak boleh kosong");

    const existing = await db.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true, deletedAt: true, kind: true },
    });
    if (!existing || existing.conversationId !== id) throw new ApiError("Pesan tidak ditemukan", 404);
    if (existing.senderId !== user.id) throw new ApiError("Hanya bisa mengedit pesanmu sendiri", 403);
    if (existing.deletedAt) throw new ApiError("Pesan sudah dihapus", 400);
    if (existing.kind !== "TEXT") throw new ApiError("Hanya pesan teks yang bisa diedit", 400);

    const message = await db.message.update({
      where: { id: messageId },
      data: { text, editedAt: new Date() },
      select: { ...messageSelect },
    });
    return Response.json({ message: messageDTO(message, user.id) });
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/conversations/[id]/messages ?messageId=...
// Hapus pesan SENDIRI (soft delete — placeholder "pesan dihapus" seperti
// aplikasi pesan pada umumnya; lawan bicara ikut melihat pesan hilang).
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await getMyConversation(id, user.id);

    const messageId = new URL(request.url).searchParams.get("messageId") || "";
    if (!messageId) throw new ApiError("messageId wajib diisi", 400);

    const existing = await db.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true, deletedAt: true },
    });
    if (!existing || existing.conversationId !== id) throw new ApiError("Pesan tidak ditemukan", 404);
    if (existing.senderId !== user.id) throw new ApiError("Hanya bisa menghapus pesanmu sendiri", 403);
    if (existing.deletedAt) return Response.json({ ok: true }); // sudah terhapus -> idempotent

    await db.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), text: "" },
      select: { id: true },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
