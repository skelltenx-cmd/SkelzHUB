import { db } from "@/lib/db";
import { jsonError, ApiError, requireUser, readJson } from "@/lib/api-utils";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// POST /api/conversations/[id]/typing
// Tandai "sedang mengetik" (kadaluarsa otomatis setelah ±5 detik).
// Fire-and-forget dari client — murah dan tanpa state tambahan.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const isA = conversation.userAId === user.id;
    await db.conversation.update({
      where: { id },
      data: isA ? { typingAAt: new Date() } : { typingBAt: new Date() },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
