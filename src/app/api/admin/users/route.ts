import { db } from "@/lib/db";
import { jsonError, ApiError, requireAdmin, readJson, roleOut, isAdminRole } from "@/lib/api-utils";
import { Prisma } from "@prisma/client";

// Batas waktu fungsi serverless (default Vercel hanya 10 dtk —
// database jauh (pooler Supabase) bisa melewatinya saat sibuk).
export const maxDuration = 60;

// GET /api/admin/users?search= -> daftar semua user untuk moderasi
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { username: { contains: search } },
            { displayName: { contains: search } },
          ],
        }
      : {};

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarColor: true,
        role: true,
        bannedAt: true,
        banReason: true,
        createdAt: true,
        avatarMedia: { select: { id: true } },
        _count: { select: { posts: true, followers: true } },
      },
    });

    return Response.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarColor: u.avatarColor,
        avatar: u.avatarMedia ? `/api/media/${u.avatarMedia.id}` : null,
        role: roleOut(u.role),
        bannedAt: u.bannedAt?.toISOString() ?? null,
        banReason: u.banReason,
        createdAt: u.createdAt.toISOString(),
        postCount: u._count.posts,
        followerCount: u._count.followers,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

// PATCH /api/admin/users  { userId, action: "ban"|"unban"|"setRole", reason?, role? }
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<{
      userId?: string;
      action?: "ban" | "unban" | "setRole";
      reason?: string;
      role?: "ADMIN" | "USER";
    }>(request);

    const userId = body.userId || "";
    const action = body.action;
    if (!userId || !action) throw new ApiError("userId dan action wajib diisi");

    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) throw new ApiError("User tidak ditemukan", 404);

    if (target.id === admin.id) {
      throw new ApiError("Tidak bisa memoderasi akun admin sendiri", 400);
    }

    if (action === "ban") {
      if (isAdminRole(target.role)) throw new ApiError("Tidak bisa membanned akun admin lain", 400);
      const reason = (body.reason || "").trim().slice(0, 300) || "Pelanggaran aturan komunitas";
      await db.user.update({
        where: { id: target.id },
        data: {
          bannedAt: new Date(),
          banReason: reason,
          sessionVersion: { increment: 1 }, // cabut semua sesi aktif
        },
      });
      return Response.json({ ok: true, message: `User @${target.username} dibanned` });
    }

    if (action === "unban") {
      await db.user.update({
        where: { id: target.id },
        data: { bannedAt: null, banReason: null },
      });
      return Response.json({ ok: true, message: `Ban @${target.username} dihapus` });
    }

    if (action === "setRole") {
      const role = body.role;
      if (role !== "ADMIN" && role !== "USER") throw new ApiError("Role tidak valid");
      // OWNER tidak bisa diturunkan lewat panel (hanya lewat script setup)
      if (target.role === "OWNER") throw new ApiError("Role akun Owner tidak bisa diubah", 400);
      await db.user.update({ where: { id: target.id }, data: { role } });
      return Response.json({
        ok: true,
        message: `@${target.username} sekarang ${role === "ADMIN" ? "admin" : "user biasa"}`,
      });
    }

    throw new ApiError("Action tidak dikenal");
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/admin/users  { userId } -> hapus akun + semua kontennya
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<{ userId?: string }>(request);
    const userId = body.userId || "";
    if (!userId) throw new ApiError("userId wajib diisi");

    if (userId === admin.id) throw new ApiError("Tidak bisa menghapus akun admin sendiri", 400);

    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) throw new ApiError("User tidak ditemukan", 404);

    // Semua relasi (post, komentar, like, follow, notifikasi) terhapus via cascade
    await db.user.delete({ where: { id: userId } });

    return Response.json({ ok: true, message: `Akun @${target.username} dihapus` });
  } catch (err) {
    return jsonError(err);
  }
}
