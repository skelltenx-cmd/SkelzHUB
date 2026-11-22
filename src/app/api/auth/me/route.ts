import { db } from "@/lib/db";
import { jsonError, roleOut } from "@/lib/api-utils";
import { clearSessionCookie, getSessionInfo } from "@/lib/session";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

export async function GET() {
  try {
    const info = await getSessionInfo();
    if (!info) return Response.json({ user: null });

    const user = await db.user.findUnique({ where: { id: info.userId } });
    if (!user) return Response.json({ user: null });

    // User ter-ban (session juga otomatis dicabut saat dibanned): kasih pesan ke client
    if (user.bannedAt) {
      await clearSessionCookie();
      return Response.json({
        user: null,
        bannedMessage: `Akun kamu telah dibanned${user.banReason ? `: ${user.banReason}` : ""}`,
      });
    }

    // Session versi lama (dicabut admin / dibuat ulang): anggap sudah logout
    if (info.version !== user.sessionVersion) {
      await clearSessionCookie();
      return Response.json({ user: null });
    }

    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        avatarColor: user.avatarColor,
        avatar: user.avatarMediaId ? `/api/media/${user.avatarMediaId}` : null,
        isPrivate: user.isPrivate,
        role: roleOut(user.role),
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
