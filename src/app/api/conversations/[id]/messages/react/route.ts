import { db } from "@/lib/db";
import { jsonError, ApiError, requireUser, readJson } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// Daftar emoji reaksi yang diizinkan (singkat, standar aplikasi pesan)
const ALLOWED_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

// POST /api/conversations/[id]/messages/react { messageId, emoji }
// Tambah/ganti/hapus reaksi emoji pada pesan (toggle):
//  - emoji sama dengan reaksi lama  -> reaksi dihapus
//  - emoji beda                     -> reaksi diganti
//  - emoji null/kosong              -> reaksi dihapus
// Peserta percakapan manapun boleh bereaksi (bukan cuma pengirim).
// updatedAt pesan ikut tersentuh supaya polling lawan bicara langsung
// melihat reaksi barunya tanpa refresh.
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const conversation = await db.conversation.findUnique({
      where: { id },
      select: { id: true, userAId: true, userBId: true },
    });
    if (!conversation) throw new ApiError("Percakapan tidak ditemukan", 404);
    if (conversation.userAId !== user.id && conversation.userBId !== user.id) {
      throw new ApiError("Kamu bukan peserta percakapan ini", 403);
    }

    const body = await readJson<{ messageId?: string; emoji?: string | null }>(request);
    const messageId = (body.messageId || "").trim();
    const emoji = (body.emoji || "").trim() || null;
    if (!messageId) throw new ApiError("messageId wajib diisi", 400);
    if (emoji && !ALLOWED_EMOJIS.includes(emoji)) {
      throw new ApiError("Emoji reaksi tidak didukung", 400);
    }

    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, deletedAt: true },
    });
    if (!message || message.conversationId !== id) throw new ApiError("Pesan tidak ditemukan", 404);
    if (message.deletedAt) throw new ApiError("Pesan sudah dihapus", 400);

    const existing = await db.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId: user.id } },
      select: { id: true, emoji: true },
    });

    let finalEmoji: string | null = emoji;
    if (existing) {
      if (!emoji || existing.emoji === emoji) {
        // toggle: emoji sama / minta hapus -> reaksi hilang
        await db.messageReaction.delete({ where: { id: existing.id } });
        finalEmoji = null;
      } else {
        // ganti emoji
        await db.messageReaction.update({
          where: { id: existing.id },
          data: { emoji },
        });
      }
    } else if (emoji) {
      await db.messageReaction.create({
        data: { messageId, userId: user.id, emoji },
      });
    }

    // Sentuh updatedAt pesan supaya polling (mode `since`) menangkap reaksi baru
    await db.message.update({
      where: { id: messageId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return Response.json({ ok: true, messageId, emoji: finalEmoji });
  } catch (err) {
    return jsonError(err);
  }
}
